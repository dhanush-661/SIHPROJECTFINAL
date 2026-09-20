import json
import os
import pathlib
import sys
import unittest

os.environ["TESTING"] = "1"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.schemas.spill import DetectionRequest
from app.services.db_service import db_service
from app.services.drift_engine import drift_engine
from app.services.sar_engine import SAREngine
from app.services.anomaly_scorer import anomaly_scorer
from app.main import app
from fastapi.testclient import TestClient


class TestAssembledDashboardPipeline(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        self.sar_engine = SAREngine()

    def test_full_pipeline_persistence_and_assembly(self):
        # 1. Run detection
        req = DetectionRequest(
            aoi=[72.2, 19.3, 72.8, 19.8],
            date_range={"start_date": "2026-09-01", "end_date": "2026-09-07"},
            sensitivity=0.75
        )
        spills, meta = self.sar_engine.run_detection(req)
        self.assertGreater(len(spills), 0)
        spill = spills[0]
        spill_id = spill.spill_id
        db_service.save_spill(spill)

        # 2. Query full assembled spill endpoint
        res = self.client.get(f"/api/v1/spill/{spill_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Check provenance registry
        self.assertIn(data["provenance"], ["ASSEMBLED", "VERIFIED"])
        self.assertEqual(data["provenance_registry"]["detection"], "DETECTED")
        self.assertEqual(data["provenance_registry"]["environmental_currents_wind"], "MEASURED")
        self.assertEqual(data["provenance_registry"]["drift_hindcast_forecast"], "MODEL-PREDICTED")
        self.assertIn(data["provenance_registry"]["vessel_anomaly_attribution"], ["ANOMALY-FLAGGED", "MEASURED_HISTORICAL_AIS"])

        # Check subcomponents
        self.assertEqual(data["spill"]["spill_id"], spill_id)
        self.assertIsNotNone(data["drift"])
        self.assertEqual(data["drift"]["provenance"], "MODEL-PREDICTED")
        self.assertIsNotNone(data["vessels"])
        self.assertIn(data["vessels"]["provenance"], ["ANOMALY-FLAGGED", "MEASURED_HISTORICAL_AIS"])
        self.assertIn("not constitute legal proof", data["vessels"]["disclaimer"])
        self.assertGreater(len(data["vessels"]["candidate_vessels"]), 0)

        # 3. Check alias endpoint /spill/{id}
        alias_res = self.client.get(f"/spill/{spill_id}")
        self.assertEqual(alias_res.status_code, 200)

        print("\nValidated Phase 4 Assembled Spill Payload:")
        print(f"Spill ID: {data['spill_id']}")
        print(f"Detected Area: {data['spill']['area_km2']:.2f} km²")
        print(f"Estimated Origin Centroid: {data['drift']['backward']['origin_centroid']}")
        print(f"Top Suspect: {data['vessels']['candidate_vessels'][0]['vessel_name']} (Score: {data['vessels']['candidate_vessels'][0]['suspect_score']})")


if __name__ == "__main__":
    unittest.main()
