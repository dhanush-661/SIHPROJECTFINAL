import json
import os
import pathlib
import sys
import unittest
from shapely.geometry import box, Polygon, shape

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from app.schemas.drift import DriftSimulationRequest, DriftSimulationResponse
from app.schemas.spill import SpillRecord
from app.services.drift_engine import drift_engine
from app.services.hydrodynamics import hydrodynamics


class TestDriftAndHindcastEngine(unittest.TestCase):

    def setUp(self):
        # Create a mock detected spill near Mumbai High (72.6 E, 19.5 N)
        self.test_poly = box(72.58, 19.48, 72.64, 19.53)
        self.mock_spill = SpillRecord(
            spill_id="spill_test_mumbai_001",
            detected_at="2026-09-07T06:00:00Z",
            geometry=json.loads(json.dumps(self.test_poly.__geo_interface__)),
            area_km2=5.2,
            perimeter_km=14.0,
            centroid=[72.61, 19.505],
            length_km=6.5,
            width_km=0.8,
            bbox=[72.58, 19.48, 72.64, 19.53],
            orientation_deg=135.0,
            confidence=0.92,
            estimated_age_hours=[4.0, 12.0],
            source_image="S1A_IW_GRDH_1SDV_20260907T060000_...",
            provenance="DETECTED",
            wind_speed_ms=6.8,
            wind_direction_deg=225.0
        )

    def test_particle_seeding(self):
        particles = drift_engine.seed_particles_in_polygon(self.mock_spill.geometry, n_particles=500)
        self.assertEqual(len(particles), 500)
        
        # Verify all particles are inside the bounding box
        shapely_geom = shape(self.mock_spill.geometry.model_dump())
        for p in particles[:50]:
            from shapely.geometry import Point
            self.assertTrue(shapely_geom.contains(Point(p[0], p[1])) or shapely_geom.touches(Point(p[0], p[1])))

    def test_hydrodynamic_vector_field(self):
        vfield = hydrodynamics.generate_vector_grid(bbox=self.mock_spill.bbox, grid_steps=5)
        self.assertGreaterEqual(len(vfield.current_vectors), 25)
        self.assertGreaterEqual(len(vfield.wind_vectors), 25)
        
        # Check current speed range (0.05 to 1.0 m/s)
        first_current = vfield.current_vectors[0]
        self.assertGreater(first_current.speed_ms, 0.0)
        self.assertLess(first_current.speed_ms, 2.0)

    def test_drift_simulation_full_contract(self):
        req = DriftSimulationRequest(
            backward_hours=48.0,
            forward_hours=24.0,
            particle_count=500,
            wind_factor=0.03,
            diffusion_coef_m2s=5.0
        )
        res = drift_engine.run_drift_simulation(self.mock_spill, req)

        self.assertEqual(res.spill_id, self.mock_spill.spill_id)
        self.assertEqual(res.provenance, "MODEL-PREDICTED")
        
        # Backward Hindcast assertions
        self.assertIsNotNone(res.backward.origin_probability_polygons)
        self.assertIsNotNone(res.backward.estimated_origin_time_window.most_likely)
        self.assertGreaterEqual(len(res.backward.sampled_particle_trajectories), 10)
        self.assertEqual(len(res.backward.origin_centroid), 2)

        # Forward Forecast assertions
        self.assertIsNotNone(res.forward.future_spread_polygons)
        self.assertIsNotNone(res.forward.spread_time_horizon)
        self.assertGreaterEqual(len(res.forward.sampled_particle_trajectories), 10)
        self.assertEqual(len(res.forward.predicted_centroid), 2)

        # Vector field assertions
        self.assertGreater(len(res.vector_field.current_vectors), 0)
        self.assertGreater(len(res.vector_field.wind_vectors), 0)

        print("\nValidated Phase 2 Drift Output Sample:")
        print(f"Origin Centroid: {res.backward.origin_centroid}")
        print(f"Predicted Future Centroid: {res.forward.predicted_centroid}")
        print(f"Origin Window: {res.backward.estimated_origin_time_window.model_dump()}")


if __name__ == "__main__":
    unittest.main()
