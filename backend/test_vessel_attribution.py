import json
import os
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.schemas.vessel import VesselCorrelationRequest, VesselCorrelationResponse
from app.services.ais_engine import ais_engine
from app.services.anomaly_scorer import anomaly_scorer


class TestAISVesselAttribution(unittest.TestCase):

    def setUp(self):
        self.origin_centroid = [72.65, 19.60]
        self.origin_window = {
            "start": "2026-09-06T14:00:00Z",
            "end": "2026-09-07T01:00:00Z",
            "most_likely": "2026-09-06T21:30:00Z"
        }

    def test_ais_traffic_generation_and_features(self):
        vessels_raw, criteria, total_corridor = ais_engine.query_vessels_in_corridor(
            origin_centroid=self.origin_centroid,
            origin_window=self.origin_window,
            slick_orientation_deg=138.0
        )
        self.assertGreaterEqual(len(vessels_raw), 4)
        self.assertGreaterEqual(total_corridor, len(vessels_raw))

        # Check feature extraction for first vessel (PACIFIC GLORY)
        v1 = vessels_raw[0]
        self.assertEqual(v1["vessel_name"], "PACIFIC GLORY")
        
        import datetime
        t_likely = datetime.datetime.fromisoformat(self.origin_window["most_likely"].replace("Z", "+00:00"))
        features, cpa_time = ais_engine.extract_vessel_features(
            vessel_dict=v1,
            origin_centroid=self.origin_centroid,
            t_release=t_likely,
            slick_orientation_deg=138.0
        )

        self.assertLess(features.min_distance_to_origin_km, 8.0)
        self.assertGreater(features.ais_gap_duration_hours, 1.0)
        self.assertIsNotNone(cpa_time)

    def test_anomaly_scorer_and_ranking_contract(self):
        req = VesselCorrelationRequest(
            origin_buffer_km=25.0,
            time_window_padding_hours=12.0,
            weight_proximity=0.35,
            weight_temporal=0.25,
            weight_trajectory=0.20,
            weight_anomaly=0.20
        )

        res = anomaly_scorer.evaluate_and_rank_vessels(
            spill_id="spill_test_mumbai_001",
            origin_centroid=self.origin_centroid,
            origin_window=self.origin_window,
            slick_orientation_deg=138.0,
            request=req
        )

        self.assertEqual(res.spill_id, "spill_test_mumbai_001")
        self.assertEqual(res.provenance, "ANOMALY-FLAGGED")
        self.assertIn("not constitute legal proof", res.disclaimer)
        self.assertGreaterEqual(len(res.candidate_vessels), 4)

        # Check ranking order (descending by suspect_score)
        scores = [v.suspect_score for v in res.candidate_vessels]
        self.assertEqual(scores, sorted(scores, reverse=True))

        top_suspect = res.candidate_vessels[0]
        self.assertGreaterEqual(top_suspect.suspect_score, 0.70)
        self.assertIsNotNone(top_suspect.mmsi)
        self.assertIsNotNone(top_suspect.anomaly_score)
        self.assertIsNotNone(top_suspect.component_scores.ml_anomaly_score)
        self.assertIsNotNone(top_suspect.features.min_distance_to_origin_km)
        self.assertGreater(len(top_suspect.track), 5)

        print("\nValidated Phase 3 Vessel Attribution Sample:")
        print(f"Top Suspect: {top_suspect.vessel_name} ({top_suspect.vessel_type}, Flag: {top_suspect.flag})")
        print(f"Suspect Score: {top_suspect.suspect_score} (ML Anomaly: {top_suspect.anomaly_score})")
        print(f"Components: {top_suspect.component_scores.model_dump()}")
        print(f"Features: {top_suspect.features.model_dump()}")


if __name__ == "__main__":
    unittest.main()
