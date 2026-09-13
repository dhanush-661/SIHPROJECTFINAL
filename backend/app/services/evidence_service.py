"""
app/services/evidence_service.py
================================
Phase 7 — Tamper-Evident Evidence Ledger Engine
Manages cryptographic SHA-256 Merkle-chain recording, canonical JSON serialization,
and forensic verification across all 5 pipeline stages.
"""
import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.schemas.evidence import (
    ChainVerificationResponse,
    LedgerEntry,
    PublicAnchorStatus,
)
from app.services.anchor_service import anchor_service, compute_merkle_root

logger = logging.getLogger(__name__)

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


def canonicalize_data(obj: Any) -> Any:
    """
    Recursively normalizes data structures for deterministic JSON serialization.
    - Pydantic models -> model_dump()
    - Dictionaries -> sorted keys
    - Floats -> rounded to 6 decimal places for cross-platform floating point consistency
    - Sets/Tuples -> lists
    """
    if hasattr(obj, "model_dump"):
        return canonicalize_data(obj.model_dump())
    if hasattr(obj, "dict"):
        return canonicalize_data(obj.dict())
    if isinstance(obj, dict):
        return {k: canonicalize_data(v) for k, v in sorted(obj.items())}
    if isinstance(obj, (list, tuple, set)):
        return [canonicalize_data(item) for item in obj]
    if isinstance(obj, float):
        # Normalize float representation
        return round(obj, 6)
    if isinstance(obj, (int, str, bool)) or obj is None:
        return obj
    return str(obj)


def to_canonical_json(data: Any) -> str:
    """
    Produces deterministic canonical JSON string:
    - Sorted keys
    - Compact separators (no extra whitespace)
    - UTF-8 compatible
    """
    normalized = canonicalize_data(data)
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def compute_stage_hash(previous_hash: str, canonical_payload: str) -> str:
    """
    Computes SHA-256 digest over the combined previous hash and canonical payload string.
    """
    hasher = hashlib.sha256()
    hasher.update(f"{previous_hash}:{canonical_payload}".encode("utf-8"))
    return hasher.hexdigest()


class EvidenceService:
    """
    Forensic engine orchestrating tamper-evident recording and verification.
    """

    def __init__(self):
        pass

    def record_stage(
        self,
        spill_id: str,
        stage: str,
        payload: Any,
        stage_timestamp: Optional[str] = None
    ) -> LedgerEntry:
        """
        Creates and persists a chained cryptographic ledger entry for a pipeline stage.
        Import db_service lazily to avoid circular imports.
        """
        from app.services.db_service import db_service

        now_utc = stage_timestamp or datetime.now(timezone.utc).isoformat()
        canonical_str = to_canonical_json(payload)
        parsed_payload = json.loads(canonical_str)

        # Retrieve the latest ledger entry for this spill to chain to its hash
        latest_entry = db_service.get_latest_ledger_entry(spill_id)
        if latest_entry:
            previous_hash = latest_entry["record_hash"]
        else:
            previous_hash = GENESIS_HASH

        record_hash = compute_stage_hash(previous_hash, canonical_str)

        entry = LedgerEntry(
            spill_id=spill_id,
            stage=stage,
            record_hash=record_hash,
            previous_hash=previous_hash,
            stage_timestamp=now_utc,
            payload=parsed_payload,
            is_valid=True
        )

        entry_id = db_service.insert_ledger_entry(
            spill_id=spill_id,
            stage=stage,
            record_hash=record_hash,
            previous_hash=previous_hash,
            stage_timestamp=now_utc,
            payload_json=canonical_str
        )
        entry.id = entry_id
        logger.info(
            f"[EvidenceLedger] Appended stage '{stage}' for spill {spill_id} | Hash: {record_hash[:12]}... | Prev: {previous_hash[:12]}..."
        )
        return entry

    def verify_chain(self, spill_id: str) -> ChainVerificationResponse:
        """
        Recomputes the full cryptographic Merkle-chain from GENESIS to the latest entry.
        Confirms that:
        1. Entry 0 has previous_hash == GENESIS_HASH.
        2. Every subsequent entry N has previous_hash == Entry N-1 record_hash.
        3. Recomputing SHA-256 over canonical JSON reproduces the stored record_hash.
        """
        from app.services.db_service import db_service

        now_utc = datetime.now(timezone.utc).isoformat()
        raw_entries = db_service.get_ledger_entries(spill_id)

        if not raw_entries:
            empty_root = GENESIS_HASH
            return ChainVerificationResponse(
                chain_verified=False,
                spill_id=spill_id,
                chain_length=0,
                merkle_root=empty_root,
                provenance="UNVERIFIED",
                verified_at=now_utc,
                stages_covered=[],
                entries=[],
                public_anchor=PublicAnchorStatus(
                    enabled=False,
                    status="NOT_CONFIGURED",
                    merkle_root=empty_root,
                    details="No evidence records found for this spill ID."
                )
            )

        entries: List[LedgerEntry] = []
        leaf_hashes: List[str] = []
        stages_covered: List[str] = []
        is_chain_intact = True
        expected_prev_hash = GENESIS_HASH

        for idx, row in enumerate(raw_entries):
            row_dict = dict(row)
            stored_hash = row_dict["record_hash"]
            stored_prev = row_dict["previous_hash"]
            payload_str = row_dict["payload_json"]
            stage_name = row_dict["stage"]
            stages_covered.append(stage_name)

            # Recompute canonical string and SHA-256
            recomputed_canonical = to_canonical_json(json.loads(payload_str))
            recomputed_hash = compute_stage_hash(stored_prev, recomputed_canonical)

            # Verify link to previous entry
            link_valid = (stored_prev == expected_prev_hash)
            hash_valid = (recomputed_hash == stored_hash)
            valid = (link_valid and hash_valid)

            if not valid:
                is_chain_intact = False
                logger.warning(
                    f"[EvidenceVerification] Integrity violation at entry #{idx} ({stage_name}) for spill {spill_id}! "
                    f"LinkValid={link_valid}, HashValid={hash_valid}"
                )

            leaf_hashes.append(stored_hash)
            expected_prev_hash = stored_hash

            entries.append(
                LedgerEntry(
                    id=row_dict["id"],
                    spill_id=row_dict["spill_id"],
                    stage=stage_name,
                    record_hash=stored_hash,
                    previous_hash=stored_prev,
                    stage_timestamp=row_dict["stage_timestamp"],
                    payload=json.loads(payload_str),
                    tx_hash=row_dict.get("tx_hash"),
                    explorer_url=row_dict.get("explorer_url"),
                    is_valid=valid
                )
            )

        merkle_root = compute_merkle_root(leaf_hashes)

        # Retrieve or evaluate public testnet anchor status
        anchor_status = anchor_service.anchor_merkle_root(spill_id=spill_id, merkle_root=merkle_root)

        return ChainVerificationResponse(
            chain_verified=is_chain_intact,
            spill_id=spill_id,
            chain_length=len(entries),
            merkle_root=merkle_root,
            provenance="VERIFIED" if is_chain_intact else "TAMPERED",
            verified_at=now_utc,
            stages_covered=stages_covered,
            entries=entries,
            public_anchor=anchor_status
        )

    def get_ledger(self, spill_id: str) -> List[LedgerEntry]:
        """
        Retrieves formatted ledger entries for a spill ID.
        """
        verification = self.verify_chain(spill_id)
        return verification.entries

    def validate_chain(self, spill_id: str) -> tuple[bool, str]:
        """
        Validates hash chain integrity and returns (is_valid, status_message).
        """
        verification = self.verify_chain(spill_id)
        if verification.chain_verified:
            return True, f"Evidence chain verified intact with {verification.chain_length} sequential stages."
        else:
            return False, "Evidence chain verification failed: detected broken hash link or data tampering."


evidence_service = EvidenceService()
