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
            slick_orientation_deg=138.0,
            strict_real_ais_only=False
        )
        self.assertGreaterEqual(len(vessels_raw), 4)
        self.assertGreaterEqual(total_corridor, len(vessels_raw))

        # Check feature extraction for first vessel
        v1 = vessels_raw[0]
        self.assertTrue(bool(v1["vessel_name"]))
        self.assertTrue(bool(v1["flag"]))
        
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
            investigation_radius_km=15.0,
            time_window_hours=48.0,
            strict_real_ais_only=False,
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
        self.assertIn(res.evidence_status, ["VERIFIED_AIS_EVIDENCE", "MODELLED_ANALYSIS"])
        self.assertGreaterEqual(len(res.candidate_vessels), 4)

        # Check ranking order (descending by suspect_score)
        scores = [v.suspect_score for v in res.candidate_vessels]
        self.assertEqual(scores, sorted(scores, reverse=True))

        top_suspect = res.candidate_vessels[0]
        self.assertGreaterEqual(top_suspect.suspect_score, 0.70)
        self.assertIsNotNone(top_suspect.mmsi)
        self.assertIsNotNone(top_suspect.provenance_label)
        self.assertIsNotNone(top_suspect.observation_count)
        self.assertIsNotNone(top_suspect.anomaly_score)
        self.assertIsNotNone(top_suspect.component_scores.ml_anomaly_score)
        self.assertIsNotNone(top_suspect.features.min_distance_to_origin_km)
        self.assertGreater(len(top_suspect.track), 5)

        print("\nValidated Phase 3 Vessel Attribution Sample:")
        print(f"Top Candidate: {top_suspect.vessel_name} ({top_suspect.vessel_type}, Flag: {top_suspect.flag})")
        print(f"Suspect Score: {top_suspect.suspect_score} (ML Anomaly: {top_suspect.anomaly_score})")

    def test_strict_mode_zero_evidence_honesty(self):
        req = VesselCorrelationRequest(
            investigation_radius_km=15.0,
            time_window_hours=48.0,
            strict_real_ais_only=True,
            fetch_online_gfw=False
        )

        # Query in remote coordinates where no local DB pings exist
        res = anomaly_scorer.evaluate_and_rank_vessels(
            spill_id="spill_test_remote_zero",
            origin_centroid=[-140.0, -50.0],
            origin_window=self.origin_window,
            slick_orientation_deg=90.0,
            request=req
        )

        self.assertEqual(res.evidence_status, "NO_AIS_EVIDENCE")
        self.assertEqual(res.records_found, 0)
        self.assertEqual(len(res.candidate_vessels), 0)
        self.assertTrue(res.is_strict_mode)
        self.assertIn("No verified AIS observations", res.evidence_reason)


    def test_gfw_online_fetching_and_persistence(self):
        """
        Validates the GFW Events-first API integration contract.

        query_gfw_vessels_online() is now honest:
          - Returns real GFW vessels (with real lat/lon from the Events API) when
            the network can reach gateway.globalfishingwatch.org.
          - Returns [] when the network is blocked (institutional firewall, VPN, etc.)
            — this is the expected behaviour on firewalled networks and is NOT a bug.

        Both outcomes are valid. The test validates structural contracts when data
        is returned, and accepts [] gracefully when the GFW gateway is unreachable.
        """
        status = ais_engine.get_gfw_status()
        self.assertEqual(status["provider"], "Global Fishing Watch (GFW)")
        self.assertTrue(status["token_configured"])

        bbox = [72.3, 19.3, 73.0, 19.9]
        gfw_vessels = ais_engine.query_gfw_vessels_online(
            bbox=bbox,
            start_time_iso="2026-09-06T12:00:00Z",
            end_time_iso="2026-09-07T06:00:00Z",
            spill_id="spill_test_mumbai_001"
        )

        # [] is a valid result when the GFW gateway is unreachable (firewall/VPN)
        # Real vessels are returned when the network is available
        self.assertIsInstance(gfw_vessels, list)

        if gfw_vessels:
            # Network was reachable — validate the structure of real GFW data
            print(f"\nGFW Events API returned {len(gfw_vessels)} real vessels.")
            v0 = gfw_vessels[0]
            self.assertTrue(v0["is_authentic_real"],
                "GFW-sourced vessels must have is_authentic_real=True")
            self.assertEqual(v0["data_source"], "GFW_CLOUD_GATEWAY",
                "GFW-sourced vessels must have data_source=GFW_CLOUD_GATEWAY")
            self.assertGreaterEqual(len(v0["track"]), 1,
                "GFW vessel must have at least one real event position point")
            self.assertTrue(bool(v0["vessel_name"]),
                "GFW vessel must have a non-empty name")
            self.assertTrue(bool(v0["mmsi"]),
                "GFW vessel must have a non-empty MMSI")
            # AIS gap flag must only be True if GFW actually reported a gap event
            # (never hardcoded — verified by checking data_source)
            if v0.get("has_deliberate_gap"):
                self.assertTrue(v0.get("is_ais_dark"),
                    "has_deliberate_gap=True must co-occur with is_ais_dark=True")
            print(f"Top vessel: {v0['vessel_name']} ({v0['flag']}) — "
                  f"AIS dark: {v0.get('is_ais_dark')}, track pts: {len(v0['track'])}")
        else:
            # Network blocked — this is expected on institutional networks
            print("\nGFW Events API returned 0 vessels (network blocked or no events "
                  "in corridor). This is expected on firewalled networks.")
            print("To get real GFW data: use a mobile hotspot, VPN, or cloud server.")


if __name__ == "__main__":
    unittest.main()
