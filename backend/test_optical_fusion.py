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
            force_no_scene=True
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertIsNone(result.optical_confirmed, "optical_confirmed must be null when no clean scene exists")
        self.assertIsNotNone(result.reason)
        self.assertIn("No clean Sentinel-2 SR scene found", result.reason)
        self.assertIsNone(result.sentinel2_scene_id)
        self.assertIsNone(result.bonn_code)
        self.assertEqual(result.provenance, "MEASURED")

    def test_clean_scene_fusion_and_kmeans_hue_clustering(self):
        """
        When a clean scene exists, clips to SAR polygon, computes mean reflectance,
        runs KMeans hue clustering, and classifies against Bonn Agreement code.
        """
        request = OpticalFusionRequest(
            max_cloud_cover_pct=50.0, # Accept available scene
            time_window_hours=48.0,
            buffer_meters=300.0
        )
        result = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertEqual(result.provenance, "MEASURED")

        if result.optical_confirmed is True:
            self.assertIsNotNone(result.sentinel2_scene_id)
            self.assertIsNotNone(result.bonn_code)
            self.assertIn(result.bonn_code, [1, 2, 3, 4, 5])
            self.assertIsNotNone(result.bonn_label)
            self.assertIsNotNone(result.estimated_thickness_range_um)
            
            # Verify mean reflectance bands
            self.assertIsNotNone(result.mean_reflectance)
            self.assertIn("B2_blue", result.mean_reflectance)
            self.assertIn("B3_green", result.mean_reflectance)
            self.assertIn("B4_red", result.mean_reflectance)
            self.assertIn("B8_nir", result.mean_reflectance)

            # Verify KMeans Hue Clusters
            self.assertIsNotNone(result.hue_clusters)
            self.assertGreater(len(result.hue_clusters), 0)
            total_weight = sum(c.relative_weight_pct for c in result.hue_clusters)
            self.assertAlmostEqual(total_weight, 100.0, delta=1.0)
            
            first_cluster = result.hue_clusters[0]
            self.assertTrue(0.0 <= first_cluster.hue_deg <= 360.0)
            self.assertTrue(first_cluster.rgb_hex.startswith("#"))
            self.assertGreater(len(first_cluster.description), 0)

    def test_database_persistence(self):
        """
        Tests persisting and reading OpticalConfirmationResponse in optical_confirmations table.
        """
        request = OpticalFusionRequest(max_cloud_cover_pct=100.0)
        confirmation = self.fusion_service.fuse_spill_optical(self.test_spill, request)

        db_service.save_optical_confirmation(self.test_spill.spill_id, confirmation)
        retrieved = db_service.get_optical_confirmation(self.test_spill.spill_id)

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["spill_id"], self.test_spill.spill_id)
        self.assertEqual(retrieved["provenance"], "MEASURED")
        if confirmation.optical_confirmed:
            self.assertEqual(retrieved["bonn_code"], confirmation.bonn_code)
            self.assertEqual(retrieved["bonn_label"], confirmation.bonn_label)

    def test_fastapi_fusion_endpoints(self):
        """
        Tests POST /fusion/{spill_id} and GET /fusion/{spill_id} and alias /api/v1/fusion/{spill_id}.
        """
        spill_id = self.test_spill.spill_id

        # 1. POST /fusion/{spill_id}
        res_post = self.client.post(f"/fusion/{spill_id}", json={"max_cloud_cover_pct": 20.0})
        self.assertEqual(res_post.status_code, 200)
        data_post = res_post.json()
        self.assertEqual(data_post["spill_id"], spill_id)
        self.assertEqual(data_post["provenance"], "MEASURED")

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
        self.assertIn("optical_status", data_assembled["stats"])

        print("\nValidated Phase 5 Optical Fusion Output:")
        print(f"Spill ID: {data_post['spill_id']}")
        print(f"Optical Confirmed: {data_post['optical_confirmed']}")
        print(f"Bonn Code: {data_post.get('bonn_code')} - {data_post.get('bonn_label')}")
        print(f"Estimated Thickness: {data_post.get('estimated_thickness_range_um')}")
        print(f"Sentinel-2 Scene ID: {data_post.get('sentinel2_scene_id')}")
        print(f"Provenance: {data_post['provenance']}")


if __name__ == "__main__":
    unittest.main()
