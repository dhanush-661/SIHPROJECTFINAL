"""
test_evidence_ledger.py
=======================
Phase 7 — Tamper-Evident Evidence Ledger Test Suite
Validates:
1. Append-only database table & SQLite trigger-based UPDATE/DELETE rejection.
2. Canonical JSON deterministic serialization and Merkle-chain link computation.
3. Full 5-stage pipeline chaining (detection, drift, vessel scoring, optical fusion, SAR thickness).
4. Full chain cryptographic verification and Merkle root calculation.
5. Tamper detection: modifying or corrupting an entry breaks verification.
6. FastAPI endpoints: GET /evidence/verify/{spill_id}, GET /evidence/ledger/{spill_id}.
7. Provenance "VERIFIED" integration in /spills/{spill_id}/full assembly.
8. Graceful public testnet anchoring fallback.
"""
import os
import pathlib
import sys
import unittest
import sqlite3

os.environ["TESTING"] = "1"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from fastapi.testclient import TestClient
from app.main import app
from app.schemas.evidence import (
    ChainVerificationResponse,
    LedgerEntry,
    PublicAnchorStatus,
)
from app.schemas.spill import DateRange, DetectionRequest
from app.services.anchor_service import anchor_service, compute_merkle_root
from app.services.db_service import db_service
from app.services.evidence_service import (
    GENESIS_HASH,
    compute_stage_hash,
    evidence_service,
    to_canonical_json,
)
from app.services.sar_engine import SAREngine


class TestEvidenceLedger(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.sar_engine = SAREngine()

        # Run Phase 1 detection to seed a real test spill
        req = DetectionRequest(
            aoi=[72.2, 19.3, 72.8, 19.8],
            date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07"),
            sensitivity=0.8,
        )
        spills, _ = cls.sar_engine.run_detection(req)
        assert len(spills) > 0, "Detection returned no spills for testing."
        cls.test_spill = spills[0]
        cls.spill_id = cls.test_spill.spill_id
        db_service.save_spill(cls.test_spill)

    def test_01_canonical_json_determinism(self):
        """Canonical JSON must produce exact same string regardless of key ordering or whitespace."""
        data_a = {"b": 2, "a": 1, "nested": {"z": 9, "y": 8}, "metric": 0.12345678}
        data_b = {"nested": {"y": 8, "z": 9}, "a": 1, "metric": 0.123457, "b": 2}
        canonical_a = to_canonical_json(data_a)
        canonical_b = to_canonical_json(data_b)
        self.assertEqual(canonical_a, canonical_b)
        self.assertIn('"a":1', canonical_a)
        self.assertNotIn(" ", canonical_a)  # No extraneous spaces

    def test_02_merkle_root_computation(self):
        """Merkle root tree computation must pair and hash correctly."""
        hashes = [
            "1111111111111111111111111111111111111111111111111111111111111111",
            "2222222222222222222222222222222222222222222222222222222222222222",
            "3333333333333333333333333333333333333333333333333333333333333333",
        ]
        root = compute_merkle_root(hashes)
        self.assertEqual(len(root), 64)
        # Empty case
        self.assertEqual(compute_merkle_root([]), GENESIS_HASH)

    def test_03_append_only_database_triggers(self):
        """Database triggers must raise error on UPDATE or DELETE against evidence_ledger."""
        test_id = f"test_immutability_{os.urandom(4).hex()}"
        entry_id = db_service.insert_ledger_entry(
            spill_id=test_id,
            stage="detection",
            record_hash="abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
            previous_hash=GENESIS_HASH,
            stage_timestamp="2026-09-11T12:00:00Z",
            payload_json='{"status":"ok"}'
        )
        self.assertIsNotNone(entry_id)

        # Attempt UPDATE (should raise operational error / trigger abort)
        with self.assertRaises(sqlite3.DatabaseError):
            with db_service._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE evidence_ledger SET record_hash = 'corrupted' WHERE id = ?", (entry_id,))
                conn.commit()

        # Attempt DELETE (should raise operational error / trigger abort)
        with self.assertRaises(sqlite3.DatabaseError):
            with db_service._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM evidence_ledger WHERE id = ?", (entry_id,))
                conn.commit()

    def test_04_full_pipeline_merkle_chaining(self):
        """Sequential recording of stages 1-5 must chain hashes from GENESIS to stage 5."""
        chain_spill_id = f"chain_test_{os.urandom(4).hex()}"

        stages = [
            ("detection", {"area_km2": 4.5, "confidence": 0.92}),
            ("drift", {"particles": 500, "forecast_hours": 48}),
            ("vessel_scoring", {"top_suspect": "M/T PACIFIC STAR", "score": 0.88}),
            ("fusion", {"bonn_code": 3, "optical_confirmed": True}),
            ("thickness", {"classification": "thick_emulsion", "contrast_db": -6.4}),
        ]

        entries = []
        for stage_name, payload in stages:
            entry = evidence_service.record_stage(
                spill_id=chain_spill_id,
                stage=stage_name,
                payload=payload
            )
            entries.append(entry)

        self.assertEqual(len(entries), 5)
        # Entry 0 previous_hash must be GENESIS
        self.assertEqual(entries[0].previous_hash, GENESIS_HASH)
        # Entry N previous_hash must equal Entry N-1 record_hash
        for i in range(1, 5):
            self.assertEqual(entries[i].previous_hash, entries[i - 1].record_hash)

        # Verify chain integrity via service
        verification = evidence_service.verify_chain(chain_spill_id)
        self.assertTrue(verification.chain_verified)
        self.assertEqual(verification.provenance, "VERIFIED")
        self.assertEqual(verification.chain_length, 5)
        self.assertEqual(len(verification.merkle_root), 64)

    def test_05_tamper_detection(self):
        """Corrupting payload in a bypass insertion must be flagged as TAMPERED during verification."""
        tamper_spill_id = f"tamper_test_{os.urandom(4).hex()}"

        # 1. Record stage 1 legitimately
        e1 = evidence_service.record_stage(
            spill_id=tamper_spill_id,
            stage="detection",
            payload={"area_km2": 2.0}
        )

        # 2. Bypass service and insert stage 2 with invalid record_hash
        fake_hash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        with db_service._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO evidence_ledger (
                    spill_id, stage, record_hash, previous_hash, stage_timestamp, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (tamper_spill_id, "drift", fake_hash, e1.record_hash, "2026-09-11T12:05:00Z", '{"tampered": true}'))
            conn.commit()

        # Verification must catch the tampering
        verification = evidence_service.verify_chain(tamper_spill_id)
        self.assertFalse(verification.chain_verified)
        self.assertEqual(verification.provenance, "TAMPERED")
        self.assertFalse(verification.entries[1].is_valid)

    def test_06_fastapi_verification_endpoint(self):
        """GET /api/v1/evidence/verify/{spill_id} and /evidence/verify/{spill_id} must return verified chain."""
        # Run drift & thickness for test_spill to populate evidence ledger
        self.client.post(f"/api/v1/drift/{self.spill_id}")
        self.client.post(f"/api/v1/thickness/{self.spill_id}")

        resp = self.client.get(f"/api/v1/evidence/verify/{self.spill_id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertTrue(data["chain_verified"])
        self.assertEqual(data["spill_id"], self.spill_id)
        self.assertEqual(data["provenance"], "VERIFIED")
        self.assertGreaterEqual(data["chain_length"], 2)
        self.assertIn("merkle_root", data)
        self.assertIn("entries", data)
        self.assertIn("public_anchor", data)

        # Verify alias endpoint /evidence/verify/{spill_id}
        resp_alias = self.client.get(f"/evidence/verify/{self.spill_id}")
        self.assertEqual(resp_alias.status_code, 200)
        self.assertEqual(resp_alias.json()["provenance"], "VERIFIED")

    def test_07_fastapi_ledger_endpoint(self):
        """GET /api/v1/evidence/ledger/{spill_id} must return raw immutable ledger entries."""
        resp = self.client.get(f"/api/v1/evidence/ledger/{self.spill_id}")
        self.assertEqual(resp.status_code, 200)
        entries = resp.json()
        self.assertIsInstance(entries, list)
        self.assertGreaterEqual(len(entries), 1)
        self.assertIn("record_hash", entries[0])
        self.assertIn("previous_hash", entries[0])
        self.assertIn("stage", entries[0])

    def test_08_assembled_spill_provenance_verified(self):
        """Hydrated spill endpoint /api/v1/spills/{spill_id}/full must return provenance: 'VERIFIED'."""
        resp = self.client.get(f"/api/v1/spills/{self.spill_id}/full")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["provenance"], "VERIFIED")
        self.assertEqual(data["provenance_registry"]["evidence_ledger"], "VERIFIED")
        self.assertIn("evidence_summary", data)
        self.assertTrue(data["evidence_summary"]["chain_verified"])
        self.assertGreaterEqual(data["evidence_summary"]["chain_length"], 1)

    def test_09_graceful_blockchain_anchor_fallback(self):
        """Blockchain anchor must degrade gracefully when unconfigured or offline without blocking pipeline."""
        resp = self.client.post(f"/api/v1/evidence/anchor/{self.spill_id}", json={"network": "polygon_amoy"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["status"], ["NOT_CONFIGURED", "FAILED", "ANCHORED", "SKIPPED_GRACEFUL"])
        self.assertIn("merkle_root", data)
        self.assertEqual(data["network"], "Polygon Amoy Testnet")


if __name__ == "__main__":
    unittest.main()
