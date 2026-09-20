import unittest
import os
import tempfile
import json
from app.services.db_service import DatabaseService
from app.services.ais_importer import AISDatasetImporter
from app.services.ais_engine import AISEngine
from app.services.anomaly_scorer import AnomalyAttributionScorer
from app.schemas.vessel import VesselCorrelationRequest


class TestHistoricalAISIngestion(unittest.TestCase):

    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
        self.temp_db_path = self.temp_db.name
        self.temp_db.close()
        self.db = DatabaseService(db_path=self.temp_db_path)
        # Patch db_service in modules for isolation
        self.importer = AISDatasetImporter()

    def tearDown(self):
        if os.path.exists(self.temp_db_path):
            try:
                os.remove(self.temp_db_path)
            except Exception:
                pass

    def test_direct_db_batch_insert_and_query(self):
        pings = [
            {
                "mmsi": "419001234",
                "vessel_name": "TEST TANKER ALPHA",
                "ship_type": "Crude Oil Tanker",
                "flag": "India",
                "imo": "9384721",
                "length_m": 240.0,
                "deadweight_tonnage": 105000.0,
                "lon": 72.50,
                "lat": 19.20,
                "sog": 12.4,
                "cog": 145.0,
                "heading": 144.0,
                "timestamp": "2026-09-06T18:00:00Z",
                "source": "TEST_STORE"
            },
            {
                "mmsi": "419001234",
                "vessel_name": "TEST TANKER ALPHA",
                "ship_type": "Crude Oil Tanker",
                "flag": "India",
                "imo": "9384721",
                "length_m": 240.0,
                "deadweight_tonnage": 105000.0,
                "lon": 72.55,
                "lat": 19.25,
                "sog": 12.0,
                "cog": 142.0,
                "heading": 142.0,
                "timestamp": "2026-09-06T18:30:00Z",
                "source": "TEST_STORE"
            }
        ]

        inserted = self.db.insert_ais_pings_batch(pings)
        self.assertEqual(inserted, 2)

        tracks = self.db.query_historical_ais_tracks(
            bbox=[72.0, 19.0, 73.0, 20.0],
            start_time_iso="2026-09-06T17:00:00Z",
            end_time_iso="2026-09-06T20:00:00Z"
        )
        self.assertEqual(len(tracks), 1)
        self.assertEqual(tracks[0]["mmsi"], "419001234")
        self.assertEqual(tracks[0]["vessel_name"], "TEST TANKER ALPHA")
        self.assertEqual(len(tracks[0]["track"]), 2)
        self.assertTrue(tracks[0]["is_authentic_real"])

        stats = self.db.get_ais_table_stats()
        self.assertEqual(stats["total_historical_pings"], 2)
        self.assertEqual(stats["unique_vessels_tracked"], 1)

    def test_noaa_csv_import(self):
        # Sample NOAA Marine Cadastre CSV format
        noaa_csv = """MMSI,BaseDateTime,LAT,LON,SOG,COG,Heading,VesselName,IMO,VesselType,Length
538008121,2026-09-06 18:00:00,19.22,72.48,11.5,138.0,138.0,AL GHARIFA,IMO9384721,80,248
538008121,2026-09-06 18:30:00,19.28,72.54,11.8,140.0,140.0,AL GHARIFA,IMO9384721,80,248
622114523,2026-09-06 19:00:00,19.15,72.40,9.2,210.0,210.0,SUEZ MARINER,IMO9215432,80,132
"""
        from app.services.db_service import db_service
        # Temporarily point global db_service to test db
        orig_conn = db_service._mem_conn
        orig_path = db_service.db_path
        db_service.db_path = self.temp_db_path
        db_service._mem_conn = None

        try:
            pings, vessels, meta = AISDatasetImporter.parse_csv_content(noaa_csv, source_label="NOAA_TEST")
            self.assertEqual(pings, 3)
            self.assertEqual(vessels, 2)
            self.assertEqual(meta["columns_mapped"]["mmsi"], "MMSI")
            self.assertEqual(meta["columns_mapped"]["lat"], "LAT")
        finally:
            db_service.db_path = orig_path
            db_service._mem_conn = orig_conn

    def test_gfw_csv_import(self):
        # Sample Global Fishing Watch CSV format
        gfw_csv = """ssvid,timestamp,lat,lon,speed,course,vessel_class
419007621,2026-09-06T18:15:00Z,19.30,72.60,10.2,135.0,tanker
419007621,2026-09-06T18:45:00Z,19.35,72.65,10.0,136.0,tanker
"""
        from app.services.db_service import db_service
        orig_path = db_service.db_path
        db_service.db_path = self.temp_db_path
        db_service._mem_conn = None

        try:
            pings, vessels, meta = AISDatasetImporter.parse_csv_content(gfw_csv, source_label="GFW_TEST")
            self.assertEqual(pings, 2)
            self.assertEqual(vessels, 1)
        finally:
            db_service.db_path = orig_path

    def test_geojson_track_import(self):
        geojson_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [72.45, 19.18],
                            [72.50, 19.22],
                            [72.55, 19.26]
                        ]
                    },
                    "properties": {
                        "mmsi": "354992019",
                        "vessel_name": "RED SEA PIONEER",
                        "ship_type": "Chemical Tanker",
                        "flag": "Panama",
                        "timestamps": [
                            "2026-09-06T18:00:00Z",
                            "2026-09-06T18:30:00Z",
                            "2026-09-06T19:00:00Z"
                        ],
                        "speeds": [12.0, 11.8, 12.2],
                        "courses": [140.0, 142.0, 141.0]
                    }
                }
            ]
        }
        from app.services.db_service import db_service
        orig_path = db_service.db_path
        db_service.db_path = self.temp_db_path
        db_service._mem_conn = None

        try:
            pings, vessels, meta = AISDatasetImporter.parse_geojson_content(geojson_data, source_label="GEOJSON_TEST")
            self.assertEqual(pings, 3)
            self.assertEqual(vessels, 1)
        finally:
            db_service.db_path = orig_path

    def test_strict_real_ais_mode_with_authentic_data(self):
        # Insert authentic tracks
        self.db.insert_ais_pings_batch([
            {
                "mmsi": "419008912",
                "vessel_name": "DESH SHOBHA",
                "ship_type": "Crude Oil Tanker",
                "flag": "India",
                "imo": "9384721",
                "length_m": 244.0,
                "deadweight_tonnage": 115000.0,
                "lon": 72.48,
                "lat": 19.22,
                "sog": 11.2,
                "cog": 140.0,
                "heading": 140.0,
                "timestamp": "2026-09-06T18:00:00Z",
                "source": "REAL_RADAR_FEED"
            },
            {
                "mmsi": "419008912",
                "vessel_name": "DESH SHOBHA",
                "ship_type": "Crude Oil Tanker",
                "flag": "India",
                "imo": "9384721",
                "length_m": 244.0,
                "deadweight_tonnage": 115000.0,
                "lon": 72.52,
                "lat": 19.26,
                "sog": 11.0,
                "cog": 141.0,
                "heading": 141.0,
                "timestamp": "2026-09-06T19:00:00Z",
                "source": "REAL_RADAR_FEED"
            }
        ])

        from app.services.db_service import db_service
        orig_path = db_service.db_path
        db_service.db_path = self.temp_db_path
        db_service._mem_conn = None

        try:
            scorer = AnomalyAttributionScorer()
            req = VesselCorrelationRequest(
                strict_real_ais_only=True,
                origin_buffer_km=30.0,
                time_window_padding_hours=6.0
            )

            response = scorer.evaluate_and_rank_vessels(
                spill_id="spill-test-001",
                origin_centroid=[72.50, 19.24],
                origin_window={
                    "start": "2026-09-06T16:00:00Z",
                    "most_likely": "2026-09-06T18:30:00Z",
                    "end": "2026-09-06T21:00:00Z"
                },
                slick_orientation_deg=140.0,
                request=req
            )

            self.assertTrue(response.is_strict_mode)
            self.assertEqual(len(response.candidate_vessels), 1)
            self.assertEqual(response.candidate_vessels[0].mmsi, "419008912")
            self.assertTrue(response.candidate_vessels[0].is_authentic_real)
            self.assertEqual(response.provenance, "MEASURED_HISTORICAL_AIS")

        finally:
            db_service.db_path = orig_path

    def test_strict_real_ais_mode_zero_vessels(self):
        from app.services.db_service import db_service
        orig_path = db_service.db_path
        db_service.db_path = self.temp_db_path
        db_service._mem_conn = None

        try:
            scorer = AnomalyAttributionScorer()
            req = VesselCorrelationRequest(
                strict_real_ais_only=True,
                origin_buffer_km=20.0,
                time_window_padding_hours=4.0
            )

            # Query an empty area
            response = scorer.evaluate_and_rank_vessels(
                spill_id="spill-test-empty",
                origin_centroid=[10.0, -10.0],
                origin_window={
                    "start": "2026-09-06T16:00:00Z",
                    "most_likely": "2026-09-06T18:30:00Z",
                    "end": "2026-09-06T21:00:00Z"
                },
                slick_orientation_deg=90.0,
                request=req
            )

            self.assertTrue(response.is_strict_mode)
            self.assertEqual(len(response.candidate_vessels), 0)
            self.assertEqual(response.candidate_vessels_count, 0)
            self.assertEqual(response.provenance, "MEASURED_HISTORICAL_ZERO")
        finally:
            db_service.db_path = orig_path


if __name__ == "__main__":
    unittest.main()
