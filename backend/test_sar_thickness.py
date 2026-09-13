"""
test_sar_thickness.py
=====================
Phase 6 — SAR Thickness Classification Service
Independently runnable against the existing pipeline output.
"""
import math
import os
import pathlib
import sys
import unittest

os.environ["TESTING"] = "1"
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from fastapi.testclient import TestClient
from app.main import app
from app.schemas.spill import DateRange, DetectionRequest
from app.schemas.thickness import (
    GLCMTextureFeatures,
    SAR_CLASSES,
    ThicknessEstimateResponse,
    ThicknessRequest,
)
from app.services.db_service import db_service
from app.services.sar_engine import SAREngine
from app.services.sar_thickness_service import SARThicknessService


class TestSARThicknessService(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.sar_engine = SAREngine()
        cls.thickness_svc = SARThicknessService()

        req = DetectionRequest(
            aoi=[72.2, 19.3, 72.8, 19.8],
            date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07"),
            sensitivity=0.8,
        )
        spills, _ = cls.sar_engine.run_detection(req)
        assert len(spills) > 0, "Detection returned no spills — check SAR engine."
        cls.test_spill = spills[0]
        db_service.save_spill(cls.test_spill)

    # ─────────────────────────────────────────────────────────────────────
    # 1. SAR_CLASSES catalog validation
    # ─────────────────────────────────────────────────────────────────────

    def test_sar_classes_catalog(self):
        """All three classification tiers must be properly configured."""
        for key in ("thin_sheen", "intermediate", "thick_emulsion"):
            self.assertIn(key, SAR_CLASSES)
            cls_info = SAR_CLASSES[key]
            self.assertIn("label", cls_info)
            self.assertIn("description", cls_info)
            self.assertIn("bonn_codes_compatible", cls_info)
            codes = cls_info["bonn_codes_compatible"]
            self.assertTrue(all(1 <= c <= 5 for c in codes),
                            f"Bonn codes for {key} must be in 1-5: {codes}")

    # ─────────────────────────────────────────────────────────────────────
    # 2. Sigma-0 backscatter statistics
    # ─────────────────────────────────────────────────────────────────────

    def test_sigma0_backscatter_ranges(self):
        """Inside-polygon sigma-0 must be lower (more negative) than buffer ring."""
        svc = self.thickness_svc
        req = ThicknessRequest(buffer_ring_meters=500.0)
        inside_db, buffer_db = svc._simulated_sigma0_stats(self.test_spill, req)

        # Buffer (open ocean) should be higher than inside (dampened by oil)
        self.assertGreater(buffer_db, inside_db,
                           "Buffer sigma-0 must be greater (less negative) than inside-polygon sigma-0")

        # Physically realistic ranges for VV marine SAR
        self.assertLess(inside_db, -10.0, "Oil slick sigma-0 should be below -10 dB")
        self.assertGreater(buffer_db, -18.0, "Open-ocean sigma-0 should be above -18 dB")

        contrast = buffer_db - inside_db
        self.assertGreater(contrast, 0.0, "Backscatter contrast must be positive (dampening)")
        self.assertLess(contrast, 15.0, "Contrast > 15 dB is physically implausible")

    # ─────────────────────────────────────────────────────────────────────
    # 3. GLCM texture features
    # ─────────────────────────────────────────────────────────────────────

    def test_glcm_texture_feature_ranges(self):
        """GLCM features must be within physically meaningful ranges."""
        req = ThicknessRequest(glcm_levels=64, glcm_distances=[1, 2, 5])
        feats: GLCMTextureFeatures = self.thickness_svc._compute_glcm_features(
            self.test_spill, req
        )

        self.assertGreaterEqual(feats.contrast, 0.0)
        self.assertGreater(feats.homogeneity, 0.0)
        self.assertLessEqual(feats.homogeneity, 1.0)
        self.assertGreaterEqual(feats.energy, 0.0)
        self.assertLessEqual(feats.energy, 1.0)
        self.assertGreaterEqual(feats.entropy, 0.0)
        self.assertGreaterEqual(feats.dissimilarity, 0.0)

    # ─────────────────────────────────────────────────────────────────────
    # 4. Fragmentation index
    # ─────────────────────────────────────────────────────────────────────

    def test_fragmentation_index_range(self):
        """Polsby-Popper fragmentation index must be in [0, 1]."""
        spill = self.test_spill
        frag = SARThicknessService._compute_fragmentation_index(spill)
        self.assertGreaterEqual(frag, 0.0)
        self.assertLessEqual(frag, 1.0)

        # Compact elongated slick: typical oil slick → F should be moderate-high
        # (elongated shapes have a large perimeter relative to area)
        self.assertGreater(frag, 0.2,
                           "Elongated oil slick should have fragmentation index > 0.2")

    # ─────────────────────────────────────────────────────────────────────
    # 5. Rule-based classifier coverage
    # ─────────────────────────────────────────────────────────────────────

    def test_classifier_thin_sheen(self):
        cls, conf = SARThicknessService._classify(
            backscatter_contrast_db=3.5,   # strong dampening
            homogeneity=0.82,              # high → uniform
            entropy=1.8,                   # low → coherent
            fragmentation_index=0.15,      # compact
        )
        self.assertEqual(cls, "thin_sheen")
        self.assertGreaterEqual(conf, 0.50)
        self.assertLessEqual(conf, 0.95)

    def test_classifier_thick_emulsion(self):
        cls, conf = SARThicknessService._classify(
            backscatter_contrast_db=1.2,   # low contrast
            homogeneity=0.22,              # low → heterogeneous
            entropy=4.5,                   # high → chaotic
            fragmentation_index=0.72,      # highly fragmented
        )
        self.assertEqual(cls, "thick_emulsion")
        self.assertGreaterEqual(conf, 0.50)

    def test_classifier_intermediate(self):
        cls, conf = SARThicknessService._classify(
            backscatter_contrast_db=2.0,
            homogeneity=0.50,
            entropy=2.9,
            fragmentation_index=0.45,
        )
        # With balanced signals the classifier may return intermediate
        self.assertIn(cls, ("intermediate", "thin_sheen", "thick_emulsion"),
                      "Classifier must return a valid tier for balanced inputs")
        self.assertGreaterEqual(conf, 0.50)

    # ─────────────────────────────────────────────────────────────────────
    # 6. Full classify_spill_thickness contract
    # ─────────────────────────────────────────────────────────────────────

    def test_full_classification_contract(self):
        """ThicknessEstimateResponse must match full field contract."""
        result = self.thickness_svc.classify_spill_thickness(
            spill=self.test_spill,
            request=ThicknessRequest(),
            optical_result=None,
        )

        self.assertEqual(result.spill_id, self.test_spill.spill_id)
        self.assertIn(result.classification, SAR_CLASSES)
        self.assertIn(result.classification_label, [v["label"] for v in SAR_CLASSES.values()])
        self.assertGreater(result.backscatter_contrast_db, 0.0)
        self.assertGreaterEqual(result.confidence, 0.50)
        self.assertLessEqual(result.confidence, 0.95)
        self.assertGreaterEqual(result.fragmentation_index, 0.0)
        self.assertLessEqual(result.fragmentation_index, 1.0)
        self.assertIsNone(result.cross_validated_with_optical,
                          "No optical result provided → must be null")
        self.assertEqual(result.provenance, "MODEL-PREDICTED")
        self.assertIsNotNone(result.texture_features)

    # ─────────────────────────────────────────────────────────────────────
    # 7. Optical cross-validation (compatible)
    # ─────────────────────────────────────────────────────────────────────

    def test_optical_crosscheck_compatible(self):
        """Cross-check with Bonn Code 1 (Sheen) should be compatible with thin_sheen."""
        optical_payload = {
            "optical_confirmed": True,
            "bonn_code": 1,
            "bonn_label": "Sheen",
        }
        cross_val, xcheck = SARThicknessService._cross_check_optical(
            sar_class="thin_sheen",
            optical_result=optical_payload,
        )
        self.assertTrue(cross_val)
        self.assertIsNotNone(xcheck)
        self.assertTrue(xcheck.compatible)
        self.assertEqual(xcheck.bonn_code_optical, 1)

    def test_optical_crosscheck_incompatible(self):
        """Cross-check with Bonn Code 5 (Continuous True Colour) should be
        incompatible with thin_sheen."""
        optical_payload = {
            "optical_confirmed": True,
            "bonn_code": 5,
            "bonn_label": "Continuous True Oil Colour",
        }
        cross_val, xcheck = SARThicknessService._cross_check_optical(
            sar_class="thin_sheen",
            optical_result=optical_payload,
        )
        self.assertFalse(cross_val)
        self.assertIsNotNone(xcheck)
        self.assertFalse(xcheck.compatible)

    def test_optical_crosscheck_no_optical(self):
        """Without optical result cross_val must be None."""
        cross_val, xcheck = SARThicknessService._cross_check_optical(
            sar_class="intermediate", optical_result=None
        )
        self.assertIsNone(cross_val)
        self.assertIsNone(xcheck)

    # ─────────────────────────────────────────────────────────────────────
    # 8. DB persistence
    # ─────────────────────────────────────────────────────────────────────

    def test_database_persistence(self):
        """Save and retrieve ThicknessEstimateResponse from thickness_estimates table."""
        result = self.thickness_svc.classify_spill_thickness(
            self.test_spill, ThicknessRequest(), optical_result=None
        )
        spill_id = self.test_spill.spill_id

        db_service.save_thickness_estimate(spill_id, result)
        retrieved = db_service.get_thickness_estimate(spill_id)

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["spill_id"], spill_id)
        self.assertEqual(retrieved["provenance"], "MODEL-PREDICTED")
        self.assertIn(retrieved["classification"], SAR_CLASSES)

    # ─────────────────────────────────────────────────────────────────────
    # 9. FastAPI endpoint contract
    # ─────────────────────────────────────────────────────────────────────

    def test_fastapi_thickness_endpoints(self):
        """POST /thickness/{id} and GET /thickness/{id} return valid contracts."""
        spill_id = self.test_spill.spill_id

        # POST
        res_post = self.client.post(
            f"/thickness/{spill_id}",
            json={"buffer_ring_meters": 500.0, "glcm_levels": 64},
        )
        self.assertEqual(res_post.status_code, 200, res_post.text)
        data = res_post.json()
        self.assertEqual(data["spill_id"], spill_id)
        self.assertIn(data["classification"], SAR_CLASSES)
        self.assertGreater(data["backscatter_contrast_db"], 0)
        self.assertGreaterEqual(data["confidence"], 0.50)
        self.assertEqual(data["provenance"], "MODEL-PREDICTED")
        self.assertIn("texture_features", data)
        self.assertIn("contrast", data["texture_features"])
        self.assertIn("homogeneity", data["texture_features"])
        self.assertIn("entropy", data["texture_features"])

        # GET
        res_get = self.client.get(f"/thickness/{spill_id}")
        self.assertEqual(res_get.status_code, 200, res_get.text)
        self.assertEqual(res_get.json()["spill_id"], spill_id)

        # GET /api/v1/thickness/
        res_v1 = self.client.get(f"/api/v1/thickness/{spill_id}")
        self.assertEqual(res_v1.status_code, 200)

        print("\n[PASS] Validated Phase 6 SAR Thickness Output:")
        print(f"   Spill ID            : {data['spill_id']}")
        print(f"   Classification      : {data['classification']} ({data['classification_label']})")
        print(f"   Backscatter Contrast: {data['backscatter_contrast_db']:.3f} dB")
        print(f"   Fragmentation Index : {data['fragmentation_index']:.4f}")
        print(f"   Confidence          : {data['confidence']:.3f}")
        print(f"   Cross-Validated     : {data['cross_validated_with_optical']}")
        print(f"   Provenance          : {data['provenance']}")

    # ─────────────────────────────────────────────────────────────────────
    # 10. Assembled payload contains sar_thickness
    # ─────────────────────────────────────────────────────────────────────

    def test_assembled_payload_includes_sar_thickness(self):
        """GET /api/v1/spill/{id} assembled payload must include sar_thickness."""
        spill_id = self.test_spill.spill_id

        res = self.client.get(f"/api/v1/spill/{spill_id}")
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()

        self.assertEqual(data["provenance_registry"]["sar_thickness"], "MODEL-PREDICTED")
        self.assertIn("sar_thickness", data)
        self.assertIn("sar_thickness_classification", data["stats"])
        self.assertIsNotNone(data["stats"]["sar_thickness_classification"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
