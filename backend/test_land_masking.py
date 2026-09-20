import json
import os
import pathlib
import sys
import unittest
from shapely.geometry import box, Polygon

os.environ["TESTING"] = "1"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.schemas.fusion import OpticalFusionRequest
from app.schemas.spill import DateRange, DetectionRequest, SpillRecord
from app.services.false_positive_filter import FalsePositiveFilter, GLOBE_AVAILABLE
from app.services.geospatial_math import calculate_spill_geospatial_metrics
from app.services.optical_fusion_service import OpticalFusionService
from app.services.sar_engine import SAREngine


class TestLandSeaMaskingAndFalsePositiveRejection(unittest.TestCase):

    def setUp(self):
        self.fp_filter = FalsePositiveFilter()
        self.sar_engine = SAREngine()
        self.optical_service = OpticalFusionService()

    def test_global_land_mask_dependency_available(self):
        """Validates that global_land_mask is properly installed and usable offline."""
        self.assertTrue(GLOBE_AVAILABLE, "global-land-mask must be installed and importable")

    def test_tasik_kenyir_inland_lake_rejected_phase1(self):
        """
        Tasik Kenyir (Terengganu, Malaysia, ~4.96°N, 102.8°E) produces dark SAR backscatter
        identical to oil slicks on water. It MUST be rejected as FALSE_POSITIVE_LAND at Phase 1.
        """
        # Tasik Kenyir coordinates: Lon 102.80, Lat 4.96
        d_deg = 0.02
        lake_poly = box(102.80 - d_deg, 4.96 - d_deg, 102.80 + d_deg, 4.96 + d_deg)
        
        # 1. Direct geometry check
        is_land, land_frac, samples, reason = self.fp_filter.check_geometry_is_land(lake_poly)
        self.assertTrue(is_land, "Tasik Kenyir geometry must be classified as land/terrestrial")
        self.assertGreater(land_frac, 0.5, "Tasik Kenyir land sample fraction should be high")
        self.assertIn("FALSE_POSITIVE_LAND", reason)

        # 2. Evaluate candidate metrics
        metrics = {
            "area_km2": 1.85,
            "aspect_ratio": 3.2,
            "centroid": [102.80, 4.96],
            "geometry": lake_poly
        }
        is_valid, eval_reason, details = self.fp_filter.evaluate_candidate(
            metrics=metrics,
            wind_speed_ms=6.5,
            candidate_geom=lake_poly
        )
        self.assertFalse(is_valid, "Tasik Kenyir candidate must not pass false-positive filter")
        self.assertFalse(details["land_valid"])
        self.assertIn("FALSE_POSITIVE_LAND", details["rejection_codes"])
        self.assertIn("FALSE_POSITIVE_LAND", eval_reason)

    def test_straddling_coastline_polygon_land_fraction_rejection(self):
        """
        A polygon with > 30% of its sample points over land must be rejected.
        Testing on a polygon overlapping Mumbai coastline (72.82E, 18.95N).
        """
        # Polygon deliberately positioned across the Mumbai urban coast
        straddle_poly = box(72.80, 18.90, 72.86, 18.98)
        
        custom_filter = FalsePositiveFilter(max_land_fraction=0.25)
        is_land, land_frac, samples, reason = custom_filter.check_geometry_is_land(straddle_poly)
        
        self.assertTrue(is_land, "Coastline-straddling candidate exceeding land fraction must be rejected")
        self.assertGreater(land_frac, 0.25)

    def test_offshore_preservation_malacca_and_mumbai(self):
        """
        Legitimate open-water offshore candidates MUST NOT be filtered out.
        - Strait of Malacca international shipping fairway (101.45°E, 2.50°N)
        - Mumbai High offshore basin (72.40°E, 19.47°N)
        """
        # Strait of Malacca shipping fairway polygon
        malacca_poly = box(101.40, 2.45, 101.55, 2.55)
        is_land, land_frac, _, reason = self.fp_filter.check_geometry_is_land(malacca_poly)
        self.assertFalse(is_land, f"Strait of Malacca offshore polygon must NOT be rejected: {reason}")
        self.assertEqual(land_frac, 0.0, "Offshore open-water polygon should have 0% land fraction")

        # Mumbai High offshore polygon
        mumbai_high_poly = box(72.35, 19.40, 72.45, 19.50)
        is_land_mh, land_frac_mh, _, reason_mh = self.fp_filter.check_geometry_is_land(mumbai_high_poly)
        self.assertFalse(is_land_mh, f"Mumbai High offshore polygon must NOT be rejected: {reason_mh}")
        self.assertEqual(land_frac_mh, 0.0)

    def test_sar_engine_detection_inland_lake_vs_offshore(self):
        """
        Tests SAREngine end-to-end:
        - Running detection over an inland AOI (Tasik Kenyir) results in 0 detected spills.
        - Running detection over an offshore AOI (Strait of Malacca) results in >= 1 detected spill.
        """
        # 1. Inland AOI: Tasik Kenyir Lake & Terengganu interior
        inland_req = DetectionRequest(
            aoi=[102.65, 4.80, 102.95, 5.10],
            date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07"),
            sensitivity=0.8
        )
        inland_spills, inland_meta = self.sar_engine.run_detection(inland_req)
        self.assertEqual(len(inland_spills), 0, "No SpillRecords should be created for inland lake AOI")
        self.assertGreaterEqual(inland_meta["false_positives_filtered"], 1, "Inland dark spots must be filtered")

        # 2. Offshore AOI: Strait of Malacca Presets
        offshore_req = DetectionRequest(
            aoi=[101.40, 2.10, 102.30, 2.90],
            date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07"),
            sensitivity=0.8
        )
        offshore_spills, offshore_meta = self.sar_engine.run_detection(offshore_req)
        self.assertGreaterEqual(len(offshore_spills), 1, "Offshore maritime AOI must detect legitimate slicks")
        self.assertGreaterEqual(offshore_meta["detected_spills_count"], 1)

    def test_optical_terrestrial_cross_check_phase3(self):
        """
        Tests Phase 3 Sentinel-2 Optical Cross-Check:
        - When NDWI < 0.0 or NDVI > 0.20 (vegetation/terrestrial), candidate must be rejected with FALSE_POSITIVE_TERRESTRIAL.
        - When NDWI > 0.0 and NDVI <= 0.20 (marine slick), optical confirmation proceeds to Bonn Agreement classification.
        """
        from shapely.geometry import mapping

        # 1. Test calculation of NDWI and NDVI
        # Terrestrial / vegetation: high NIR (B8=0.40), moderate Red (B4=0.15), low Green (B3=0.08)
        ndwi_terr, ndvi_terr = self.optical_service.calculate_spectral_indices(b3_green=0.08, b4_red=0.15, b8_nir=0.40)
        self.assertLess(ndwi_terr, 0.0, "Terrestrial NDWI must be negative")
        self.assertGreater(ndvi_terr, 0.20, "Terrestrial NDVI must be > 0.20")

        # Marine water / slick: low NIR (B8=0.04), Green (B3=0.12), Red (B4=0.08)
        ndwi_marine, ndvi_marine = self.optical_service.calculate_spectral_indices(b3_green=0.12, b4_red=0.08, b8_nir=0.04)
        self.assertGreater(ndwi_marine, 0.0, "Marine NDWI must be positive")
        self.assertLess(ndvi_marine, 0.20, "Marine NDVI must be low")

        # 2. Test optical fusion for a terrestrial spill record
        terr_geom = box(102.75, 4.90, 102.85, 5.00)
        terr_spill = SpillRecord(
            spill_id="spill_test_terrestrial_01",
            detected_at="2026-09-05T05:42:18Z",
            geometry=mapping(terr_geom),
            area_km2=1.5,
            perimeter_km=6.0,
            centroid=[102.80, 4.95],  # Inland Malaysia (Tasik Kenyir vicinity)
            length_km=2.0,
            width_km=0.75,
            bbox=[102.75, 4.90, 102.85, 5.00],
            orientation_deg=45.0,
            confidence=0.85,
            estimated_age_hours=[6.0, 12.0],
            source_image="S1A_IW_GRDH_TEST",
            provenance="DETECTED"
        )
        terr_response = self.optical_service.fuse_spill_optical(terr_spill, OpticalFusionRequest(max_cloud_cover_pct=30.0))
        self.assertFalse(terr_response.optical_confirmed)
        self.assertEqual(terr_response.rejection_code, "FALSE_POSITIVE_TERRESTRIAL")
        self.assertIn("FALSE_POSITIVE_TERRESTRIAL", terr_response.reason)

        # 3. Test optical fusion for an offshore marine spill record
        marine_geom = box(101.40, 2.45, 101.50, 2.55)
        marine_spill = SpillRecord(
            spill_id="spill_test_marine_01",
            detected_at="2026-09-05T05:42:18Z",
            geometry=mapping(marine_geom),
            area_km2=2.4,
            perimeter_km=8.2,
            centroid=[101.45, 2.50],  # Open water Strait of Malacca fairway
            length_km=3.1,
            width_km=0.8,
            bbox=[101.40, 2.45, 101.50, 2.55],
            orientation_deg=120.0,
            confidence=0.92,
            estimated_age_hours=[4.0, 8.0],
            source_image="S1A_IW_GRDH_TEST",
            provenance="DETECTED"
        )
        marine_response = self.optical_service.fuse_spill_optical(marine_spill, OpticalFusionRequest(max_cloud_cover_pct=30.0))
        self.assertTrue(marine_response.optical_confirmed)
        self.assertIsNotNone(marine_response.bonn_code)
        self.assertIn(marine_response.bonn_code, [1, 2, 3, 4, 5])


    def test_configurable_thresholds_override(self):
        """Validates that land-fraction and optical index thresholds can be customized."""
        strict_filter = FalsePositiveFilter(max_land_fraction=0.05)
        self.assertEqual(strict_filter.max_land_fraction, 0.05)

        custom_optical = OpticalFusionService(min_ndwi=0.10, max_ndvi=0.15)
        self.assertEqual(custom_optical.min_ndwi, 0.10)
        self.assertEqual(custom_optical.max_ndvi, 0.15)


if __name__ == "__main__":
    unittest.main()
