import json
import os
import pathlib
import sys
import unittest
from shapely.geometry import box, Polygon

os.environ["TESTING"] = "1"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.schemas.spill import DateRange, DetectionRequest, SpillRecord
from app.services.false_positive_filter import FalsePositiveFilter
from app.services.geospatial_math import calculate_spill_geospatial_metrics, get_utm_epsg
from app.services.sar_engine import SAREngine


class TestOilSpillDetectionPipeline(unittest.TestCase):

    def test_utm_epsg_calculation(self):
        # Mumbai (72.8 E, 18.9 N) -> UTM Zone 43N -> EPSG 32643
        epsg = get_utm_epsg(72.8, 18.9)
        self.assertEqual(epsg, 32643)

        # Singapore (103.8 E, 1.3 N) -> UTM Zone 48N -> EPSG 32648
        epsg_sg = get_utm_epsg(103.8, 1.3)
        self.assertEqual(epsg_sg, 32648)

    def test_geospatial_metrics_calculation(self):
        # Create a rectangular test polygon ~1km x 0.2km near Mumbai
        # 1 deg lon ~ 105km, 1 deg lat ~ 111km
        d_lon = 1.0 / 105.0 # ~1km
        d_lat = 0.2 / 111.0 # ~0.2km
        poly = box(72.5, 19.0, 72.5 + d_lon, 19.0 + d_lat)

        metrics = calculate_spill_geospatial_metrics(poly, wind_speed_ms=6.0)

        self.assertIn("area_km2", metrics)
        self.assertIn("perimeter_km", metrics)
        self.assertIn("centroid", metrics)
        self.assertIn("length_km", metrics)
        self.assertIn("width_km", metrics)
        self.assertIn("bbox", metrics)
        self.assertIn("orientation_deg", metrics)
        self.assertIn("confidence", metrics)
        self.assertIn("estimated_age_hours", metrics)

        # Expected area is roughly 0.2 km2
        self.assertAlmostEqual(metrics["area_km2"], 0.2, delta=0.05)
        # Expected length is roughly 1.0 km
        self.assertAlmostEqual(metrics["length_km"], 1.0, delta=0.2)
        # Expected width is roughly 0.2 km
        self.assertAlmostEqual(metrics["width_km"], 0.2, delta=0.1)

    def test_false_positive_filter_low_wind(self):
        fp_filter = FalsePositiveFilter(min_wind_speed_ms=3.0)
        
        # Test candidate with wind speed 2.2 m/s (< 3.0 m/s) -> MUST DISCARD
        metrics = {"area_km2": 2.5, "aspect_ratio": 4.0, "perimeter_km": 10.0}
        is_valid, reason, _ = fp_filter.evaluate_candidate(metrics, wind_speed_ms=2.2)
        self.assertFalse(is_valid, "Candidate with wind speed < 3.0 m/s must be discarded as false positive")
        self.assertIn("Calm water look-alike", reason)

        # Test candidate with wind speed 6.5 m/s -> MUST PASS
        is_valid_pass, _, _ = fp_filter.evaluate_candidate(metrics, wind_speed_ms=6.5)
        self.assertTrue(is_valid_pass)

    def test_false_positive_filter_circularity_and_polarization(self):
        fp_filter = FalsePositiveFilter()
        
        # Test candidate with high circularity (Q = 4*pi*0.5 / (2.6)^2 = 0.93 > 0.60) -> MUST DISCARD
        circular_metrics = {"area_km2": 0.5, "perimeter_km": 2.6, "aspect_ratio": 1.1}
        is_valid_circ, reason_circ, details_circ = fp_filter.evaluate_candidate(circular_metrics, wind_speed_ms=5.0)
        self.assertFalse(is_valid_circ)
        self.assertIn("FALSE_POSITIVE_ISOTROPIC", details_circ["rejection_codes"])

        # Test candidate with anomalous polarization ratio (VV=-15, VH=-13.5 -> VV/VH=1.5 dB < 3.0 dB) -> MUST DISCARD
        elongated_metrics = {"area_km2": 1.5, "perimeter_km": 8.0, "aspect_ratio": 4.2}
        is_valid_pol, reason_pol, details_pol = fp_filter.evaluate_candidate(
            elongated_metrics, wind_speed_ms=5.5, vv_db=-15.0, vh_db=-13.5
        )
        self.assertFalse(is_valid_pol)
        self.assertIn("FALSE_POSITIVE_POLARIZATION", details_pol["rejection_codes"])

    def test_sar_detection_contract(self):
        engine = SAREngine()
        req = DetectionRequest(
            aoi=[71.95, 19.10, 72.85, 19.85],
            date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07"),
            sensitivity=0.8
        )
        spills, meta = engine.run_detection(req)

        self.assertGreaterEqual(len(spills), 1)
        first_spill = spills[0]

        # Verify exact JSON contract fields
        record_dict = first_spill.model_dump()
        required_keys = [
            "spill_id", "detected_at", "geometry", "area_km2",
            "perimeter_km", "centroid", "length_km", "width_km",
            "bbox", "orientation_deg", "confidence", "estimated_age_hours",
            "source_image", "provenance"
        ]
        for key in required_keys:
            self.assertIn(key, record_dict, f"Missing key '{key}' from contract")

        self.assertEqual(record_dict["provenance"], "DETECTED")
        self.assertIsInstance(record_dict["centroid"], list)
        self.assertEqual(len(record_dict["centroid"]), 2)
        self.assertIsInstance(record_dict["bbox"], list)
        self.assertEqual(len(record_dict["bbox"]), 4)
        self.assertIsInstance(record_dict["estimated_age_hours"], list)
        self.assertEqual(len(record_dict["estimated_age_hours"]), 2)
        print("\nValidated contract sample output:")
        print(json.dumps({k: record_dict[k] for k in required_keys}, indent=2))


if __name__ == "__main__":
    unittest.main()
