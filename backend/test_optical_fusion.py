import json
import os
import pathlib
import sys
import unittest

os.environ["TESTING"] = "1"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from fastapi.testclient import TestClient
from app.main import app
from app.schemas.fusion import (
    OpticalConfirmationResponse,
    OpticalFusionRequest,
)
from app.schemas.spill import DateRange, DetectionRequest, SpillRecord
from app.services.db_service import db_service
from app.services.optical_fusion_service import (
    BONN_AGREEMENT_CODES,
    OpticalFusionService,
)
from app.services.sar_engine import SAREngine


class TestOpticalFusionService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.sar_engine = SAREngine()
        cls.fusion_service = OpticalFusionService()
        
        # Create and persist a test spill
        req = DetectionRequest(
            aoi=[72.2, 19.3, 72.8, 19.8],
            date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07"),
            sensitivity=0.8
        )
        spills, _ = cls.sar_engine.run_detection(req)
        cls.test_spill = spills[0]
        db_service.save_spill(cls.test_spill)

    def test_bonn_agreement_catalog_standards(self):
        """
        Validates that all 5 Bonn Agreement Oil Appearance Code classes (1-5)
        are properly configured with official thickness ranges.
        """
        self.assertEqual(len(BONN_AGREEMENT_CODES), 5)
        
        expected_ranges = {
            1: ("Sheen", "0.04 - 0.3 µm", 0.04, 0.3),
            2: ("Rainbow", "0.3 - 5.0 µm", 0.3, 5.0),
            3: ("Metallic", "5.0 - 50.0 µm", 5.0, 50.0),
            4: ("Discontinuous True Oil Colour", "50.0 - 200.0 µm", 50.0, 200.0),
            5: ("Continuous True Oil Colour", "> 200.0 µm", 200.0, 1000.0),
        }

        for code, (label, thickness_str, min_um, max_um) in expected_ranges.items():
            bonn = BONN_AGREEMENT_CODES[code]
            self.assertEqual(bonn.code, code)
            self.assertEqual(bonn.label, label)
            self.assertEqual(bonn.thickness_range_um, thickness_str)
            self.assertAlmostEqual(bonn.min_thickness_um, min_um, places=2)
            self.assertAlmostEqual(bonn.max_thickness_um, max_um, places=2)

    def test_zero_hallucination_when_no_clean_scene(self):
        """
        When cloud cover is high or no clean scene (<20% cloud) exists within +/-48h,
        the service must return optical_confirmed: null with reason.
        Never fabricate a confirmation!
        """
        request = OpticalFusionRequest(
            max_cloud_cover_pct=20.0,
            time_window_hours=48.0,
            force_no_scene=True,
            satellite_platform="SENTINEL_2"
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertIsNone(result.optical_confirmed, "optical_confirmed must be null when no clean scene exists")
        self.assertIsNotNone(result.reason)
        self.assertIn("No clean Sentinel-2 MSI scene found", result.reason)
        self.assertIsNone(result.sentinel2_scene_id)
        self.assertIsNone(result.bonn_code)
        self.assertEqual(result.provenance, "MEASURED")

    def test_sentinel2_clean_scene_fusion(self):
        """
        Tests optical fusion targeting Sentinel-2 MSI with KMeans hue clustering.
        """
        request = OpticalFusionRequest(
            max_cloud_cover_pct=50.0,
            time_window_hours=48.0,
            buffer_meters=300.0,
            satellite_platform="SENTINEL_2"
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertEqual(result.provenance, "MEASURED")
        self.assertEqual(result.satellite_platform, "Sentinel-2 MSI")
        self.assertEqual(result.sensor_name, "MSI")
        self.assertEqual(result.resolution_meters, 10.0)

        if result.optical_confirmed is True:
            self.assertIsNotNone(result.scene_id)
            self.assertIsNotNone(result.bonn_code)
            self.assertIn(result.bonn_code, [1, 2, 3, 4, 5])
            self.assertIsNotNone(result.bonn_label)
            
            # Verify mean reflectance bands
            self.assertIsNotNone(result.mean_reflectance)
            self.assertIn("B2_blue", result.mean_reflectance)
            self.assertIn("B3_green", result.mean_reflectance)
            self.assertIn("B4_red", result.mean_reflectance)
            self.assertIn("B8_nir", result.mean_reflectance)

            # Verify KMeans Hue Clusters
            self.assertIsNotNone(result.hue_clusters)
            self.assertGreater(len(result.hue_clusters), 0)

    def test_landsat_8_optical_and_thermal_fusion(self):
        """
        Tests optical and thermal radiometry fusion targeting Landsat 8 (OLI/TIRS).
        """
        request = OpticalFusionRequest(
            max_cloud_cover_pct=50.0,
            time_window_hours=48.0,
            buffer_meters=300.0,
            satellite_platform="LANDSAT_8",
            include_thermal=True
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertEqual(result.satellite_platform, "Landsat 8 OLI/TIRS")
        self.assertEqual(result.sensor_name, "OLI / TIRS")
        self.assertEqual(result.resolution_meters, 30.0)

        if result.optical_confirmed is True:
            self.assertTrue(result.scene_id.startswith("LC08_"))
            self.assertIsNotNone(result.bonn_code)
            self.assertIn("B5_nir", result.mean_reflectance)

            # Verify Thermal Infrared Radiometry (TIRS Band 10)
            self.assertIsNotNone(result.thermal_telemetry)
            self.assertGreater(result.thermal_telemetry.brightness_temp_k, 250.0)
            self.assertGreater(result.thermal_telemetry.ambient_sea_temp_k, 250.0)
            self.assertIsNotNone(result.thermal_telemetry.thermal_contrast_k)
            self.assertIn("TIRS", result.thermal_telemetry.sensor_band)
            self.assertGreater(len(result.thermal_telemetry.thermal_signature), 0)

    def test_landsat_9_optical_and_thermal_fusion(self):
        """
        Tests optical and thermal radiometry fusion targeting Landsat 9 (OLI-2/TIRS-2).
        """
        request = OpticalFusionRequest(
            max_cloud_cover_pct=50.0,
            time_window_hours=48.0,
            buffer_meters=300.0,
            satellite_platform="LANDSAT_9",
            include_thermal=True
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertEqual(result.satellite_platform, "Landsat 9 OLI-2/TIRS-2")
        self.assertEqual(result.sensor_name, "OLI-2 / TIRS-2")
        self.assertEqual(result.resolution_meters, 30.0)

        if result.optical_confirmed is True:
            self.assertTrue(result.scene_id.startswith("LC09_"))
            self.assertIsNotNone(result.bonn_code)
            self.assertIsNotNone(result.thermal_telemetry)
            self.assertIn("Landsat 9", result.thermal_telemetry.sensor_band)

    def test_auto_platform_multi_constellation_ranking(self):
        """
        Tests AUTO mode, which evaluates the best available scene across
        Sentinel-2, Landsat 8, and Landsat 9.
        """
        request = OpticalFusionRequest(
            max_cloud_cover_pct=50.0,
            time_window_hours=48.0,
            satellite_platform="AUTO"
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)
        self.assertIn(result.satellite_platform, ["Sentinel-2 MSI", "Landsat 8 OLI/TIRS", "Landsat 9 OLI-2/TIRS-2"])

    def test_database_persistence(self):
        """
        Tests persisting and reading OpticalConfirmationResponse in optical_confirmations table.
        """
        request = OpticalFusionRequest(max_cloud_cover_pct=100.0, satellite_platform="LANDSAT_8")
        confirmation = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        db_service.save_optical_confirmation(self.test_spill.spill_id, confirmation)
        retrieved = db_service.get_optical_confirmation(self.test_spill.spill_id)

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["spill_id"], self.test_spill.spill_id)
        self.assertEqual(retrieved["provenance"], "MEASURED")
        if confirmation.optical_confirmed:
            self.assertEqual(retrieved["bonn_code"], confirmation.bonn_code)
            self.assertEqual(retrieved["bonn_label"], confirmation.bonn_label)
            self.assertEqual(retrieved["satellite_platform"], "Landsat 8 OLI/TIRS")

    def test_fastapi_fusion_endpoints_with_landsat(self):
        """
        Tests POST /fusion/{spill_id} with satellite_platform parameter and GET /fusion/{spill_id}.
        """
        spill_id = self.test_spill.spill_id

        # 1. POST /fusion/{spill_id} with Landsat 9 request
        res_post = self.client.post(
            f"/fusion/{spill_id}",
            json={"max_cloud_cover_pct": 50.0, "satellite_platform": "LANDSAT_9", "include_thermal": True}
        )
        self.assertEqual(res_post.status_code, 200)
        data_post = res_post.json()
        self.assertEqual(data_post["spill_id"], spill_id)
        self.assertEqual(data_post["provenance"], "MEASURED")
        self.assertEqual(data_post["satellite_platform"], "Landsat 9 OLI-2/TIRS-2")

        # 2. GET /fusion/{spill_id}
        res_get = self.client.get(f"/fusion/{spill_id}")
        self.assertEqual(res_get.status_code, 200)
        data_get = res_get.json()
        self.assertEqual(data_get["spill_id"], spill_id)

        # 3. GET /api/v1/spill/{spill_id} full assembled check
        res_assembled = self.client.get(f"/api/v1/spill/{spill_id}")
        self.assertEqual(res_assembled.status_code, 200)
        data_assembled = res_assembled.json()
        self.assertEqual(data_assembled["provenance_registry"]["optical_fusion"], "MEASURED")
        self.assertIn("optical", data_assembled)

        print("\nValidated Multi-Mission Optical & Thermal Fusion Output:")
        print(f"Spill ID: {data_post['spill_id']}")
        print(f"Platform: {data_post.get('satellite_platform')} ({data_post.get('sensor_name')})")
        print(f"Optical Confirmed: {data_post['optical_confirmed']}")
        print(f"Bonn Code: {data_post.get('bonn_code')} - {data_post.get('bonn_label')}")
        print(f"Scene ID: {data_post.get('scene_id')}")
        if data_post.get("thermal_telemetry"):
            print(f"TIRS Thermal Contrast: {data_post['thermal_telemetry']['thermal_contrast_k']}K")
            print(f"Thermal Signature: {data_post['thermal_telemetry']['thermal_signature']}")


if __name__ == "__main__":
    unittest.main()

