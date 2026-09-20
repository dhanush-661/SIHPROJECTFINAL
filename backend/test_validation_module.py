import os
import unittest
import json
from fastapi.testclient import TestClient

# Ensure test mode
os.environ["TESTING"] = "1"
os.environ["DB_PATH"] = ":memory:"

from app.main import app
from app.services.db_service import DatabaseService, db_service
from app.services.external_incident_service import ExternalIncidentService
from app.services.validation_service import ValidationService
from app.schemas.validation import ExternalIncident, ValidationRunRequest
from app.schemas.spill import SpillRecord


class TestValidationModule(unittest.TestCase):
    def setUp(self):
        # Use an isolated in-memory or temp SQLite database for tests
        self.test_db = DatabaseService(db_path=":memory:")
        self.test_db.clear_all_external_incidents()
        self.test_db.clear_all_spills()
        self.client = TestClient(app)

    def test_external_incident_normalization_and_provenance(self):
        """
        Verify external reference incidents are strictly normalized with EXTERNAL-REFERENCE provenance.
        """
        raw_data = {
            "incident_id": "test-inc-01",
            "source_name": "SkyTruth Cerulean Test",
            "reported_at": "2023-05-10T12:00:00Z",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [72.5, 19.0],
                    [72.6, 19.0],
                    [72.6, 19.1],
                    [72.5, 19.1],
                    [72.5, 19.0]
                ]]
            },
            "estimated_area_km2": 15.5,
            "confidence_or_score": 0.95,
            "source_url": "https://example.org/incident/01",
            "notes_or_vessel": "MT Tanker Bilge Anomaly"
        }

        incident = ExternalIncidentService.normalize_incident_record(raw_data)
        self.assertEqual(incident.incident_id, "test-inc-01")
        self.assertEqual(incident.provenance, "EXTERNAL-REFERENCE")
        self.assertAlmostEqual(incident.centroid[0], 72.55, places=2)
        self.assertAlmostEqual(incident.centroid[1], 19.05, places=2)
        self.assertEqual(len(incident.bbox), 4)

    def test_database_isolation(self):
        """
        Verify external reference records are isolated in external_incidents and never inserted into oil_spills.
        """
        seed_recs = ExternalIncidentService.get_seed_incidents()
        self.test_db.save_external_incidents_batch(seed_recs)

        # External table should contain seeds
        ext_in_db = self.test_db.get_external_incidents(limit=50)
        self.assertGreaterEqual(len(ext_in_db), len(seed_recs))
        for rec in ext_in_db:
            self.assertEqual(rec.provenance, "EXTERNAL-REFERENCE")

        # Operational oil_spills table MUST be empty
        spills_in_db = self.test_db.get_spills(limit=50)
        self.assertEqual(len(spills_in_db), 0, "External incidents must never leak into oil_spills table!")

    def test_spatial_temporal_matching_logic(self):
        """
        Test matching between an operational Sentinel-1 detection and external reference incident.
        """
        # 1. Add external incident (Ennore reference)
        ennore_ext = ExternalIncident(
            incident_id="ext-ennore-test",
            source_name="Indian Coast Guard Reference",
            reported_at="2017-01-28T04:00:00Z",
            geometry={
                "type": "Polygon",
                "coordinates": [[
                    [80.32, 13.24],
                    [80.36, 13.24],
                    [80.36, 13.28],
                    [80.32, 13.28],
                    [80.32, 13.24]
                ]]
            },
            centroid=[80.34, 13.26],
            bbox=[80.32, 13.24, 80.36, 13.28],
            estimated_area_km2=18.0,
            confidence_or_score=0.96,
            source_url="https://example.org/ennore",
            notes_or_vessel="Dawn Kanchipuram",
            provenance="EXTERNAL-REFERENCE"
        )
        self.test_db.save_external_incident(ennore_ext)

        # 2. Add AquaSentinel detected spill in the same vicinity within 2 hours
        detected_spill = SpillRecord(
            spill_id="spill-ennore-s1-test",
            detected_at="2017-01-28T05:30:00Z",
            geometry={
                "type": "Polygon",
                "coordinates": [[
                    [80.33, 13.25],
                    [80.37, 13.25],
                    [80.37, 13.29],
                    [80.33, 13.29],
                    [80.33, 13.25]
                ]]
            },
            area_km2=17.8,
            perimeter_km=18.5,
            centroid=[80.35, 13.27],
            length_km=5.2,
            width_km=3.4,
            bbox=[80.33, 13.25, 80.37, 13.29],
            orientation_deg=45.0,
            confidence=0.94,
            estimated_age_hours=[1.0, 4.0],
            source_image="S1A_IW_GRDH_1SDV_20170128T053000",
            provenance="DETECTED"
        )
        self.test_db.save_spill(detected_spill)

        # Temporarily wire db_service to test_db for ValidationService run
        import app.services.validation_service as vs_mod
        orig_db = vs_mod.db_service
        vs_mod.db_service = self.test_db

        try:
            req = ValidationRunRequest(
                aoi=[80.0, 13.0, 81.0, 14.0],
                date_start="2017-01-27",
                date_end="2017-01-29",
                time_window_hours=48.0,
                max_distance_km=15.0
            )
            response = ValidationService.run_validation(req)

            self.assertEqual(response.total_external_incidents, 1)
            self.assertEqual(response.matched_count, 1)
            self.assertEqual(response.missed_count, 0)
            self.assertEqual(response.unvalidated_detections_count, 0)

            matched_rec = response.comparisons[0]
            self.assertEqual(matched_rec.status, "MATCHED")
            self.assertEqual(matched_rec.matched_spill_id, "spill-ennore-s1-test")
            self.assertIsNotNone(matched_rec.spatial_distance_km)
            self.assertLess(matched_rec.spatial_distance_km, 5.0)
            self.assertAlmostEqual(matched_rec.temporal_delta_hours, 1.5, places=1)
            self.assertIn("1 of 1 known reference incident(s)", response.summary_headline)
        finally:
            vs_mod.db_service = orig_db

    def test_missed_and_unvalidated_classification(self):
        """
        Verify classification of MISSED (reference exists, no detection)
        and UNVALIDATED_DETECTION (detection exists, no reference).
        """
        # External incident in Mauritius
        mauritius_ext = ExternalIncident(
            incident_id="ext-mauritius-test",
            source_name="Mauritius Port Reference",
            reported_at="2020-08-06T06:00:00Z",
            geometry={"type": "Point", "coordinates": [57.74, -20.44]},
            centroid=[57.74, -20.44],
            bbox=[57.73, -20.45, 57.75, -20.43],
            estimated_area_km2=20.0,
            provenance="EXTERNAL-REFERENCE"
        )
        self.test_db.save_external_incident(mauritius_ext)

        # Unrelated detection in Persian Gulf
        persian_spill = SpillRecord(
            spill_id="spill-persian-unvalidated",
            detected_at="2020-08-06T10:00:00Z",
            geometry={"type": "Point", "coordinates": [52.0, 26.0]},
            area_km2=5.0,
            perimeter_km=8.0,
            centroid=[52.0, 26.0],
            length_km=2.0,
            width_km=1.0,
            bbox=[51.9, 25.9, 52.1, 26.1],
            orientation_deg=0.0,
            confidence=0.88,
            estimated_age_hours=[1.0, 2.0],
            source_image="S1_PERSIAN",
            provenance="DETECTED"
        )
        self.test_db.save_spill(persian_spill)

        import app.services.validation_service as vs_mod
        orig_db = vs_mod.db_service
        vs_mod.db_service = self.test_db

        try:
            # AOI covering global bounds
            req = ValidationRunRequest(
                aoi=[-180.0, -90.0, 180.0, 90.0],
                date_start="2020-08-05",
                date_end="2020-08-07",
                time_window_hours=24.0,
                max_distance_km=10.0
            )
            response = ValidationService.run_validation(req)

            self.assertEqual(response.matched_count, 0)
            self.assertEqual(response.missed_count, 1)
            self.assertEqual(response.unvalidated_detections_count, 1)

            statuses = [c.status for c in response.comparisons]
            self.assertIn("MISSED", statuses)
            self.assertIn("UNVALIDATED_DETECTION", statuses)
        finally:
            vs_mod.db_service = orig_db

    def test_api_endpoints(self):
        """
        Test REST API endpoints for external incidents and validation run.
        """
        # Test Seed
        seed_res = self.client.post("/api/v1/external-incidents/seed")
        self.assertEqual(seed_res.status_code, 200)
        self.assertTrue(seed_res.json()["success"])

        # Test List
        list_res = self.client.get("/api/v1/external-incidents")
        self.assertEqual(list_res.status_code, 200)
        incidents = list_res.json()
        self.assertGreater(len(incidents), 0)
        self.assertEqual(incidents[0]["provenance"], "EXTERNAL-REFERENCE")

        # Test Run Validation
        val_res = self.client.post("/api/v1/validation/run", json={
            "aoi": [70.0, 18.0, 74.0, 21.0],
            "date_start": "2023-01-01",
            "date_end": "2023-12-31",
            "time_window_hours": 48.0,
            "max_distance_km": 20.0
        })
        self.assertEqual(val_res.status_code, 200)
        data = val_res.json()
        self.assertIn("run_id", data)
        self.assertIn("summary_headline", data)
        self.assertIn("framing_disclaimer", data)
        self.assertIn("comparisons", data)


if __name__ == "__main__":
    unittest.main()
