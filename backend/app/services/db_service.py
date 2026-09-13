import json
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional
from shapely.geometry import shape, Point, Polygon
from app.schemas.spill import SpillRecord

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get("DB_PATH", "spills_database.sqlite3")


class DatabaseService:
    """
    Manages persistence of detected oil spill events to PostGIS / SQLite with spatial indexing.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS oil_spills (
                    spill_id TEXT PRIMARY KEY,
                    detected_at TEXT NOT NULL,
                    geometry_json TEXT NOT NULL,
                    area_km2 REAL NOT NULL,
                    perimeter_km REAL NOT NULL,
                    centroid_lon REAL NOT NULL,
                    centroid_lat REAL NOT NULL,
                    length_km REAL NOT NULL,
                    width_km REAL NOT NULL,
                    bbox_json TEXT NOT NULL,
                    orientation_deg REAL NOT NULL,
                    confidence REAL NOT NULL,
                    estimated_age_min_h REAL NOT NULL,
                    estimated_age_max_h REAL NOT NULL,
                    source_image TEXT NOT NULL,
                    provenance TEXT NOT NULL,
                    wind_speed_ms REAL,
                    wind_direction_deg REAL,
                    aspect_ratio REAL,
                    radar_band TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS drift_simulations (
                    spill_id TEXT PRIMARY KEY,
                    simulated_at TEXT NOT NULL,
                    provenance TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS vessel_attributions (
                    spill_id TEXT PRIMARY KEY,
                    analyzed_at TEXT NOT NULL,
                    provenance TEXT NOT NULL,
                    top_suspect_name TEXT,
                    top_suspect_score REAL,
                    payload_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS optical_confirmations (
                    spill_id TEXT PRIMARY KEY,
                    analyzed_at TEXT NOT NULL,
                    optical_confirmed INTEGER,
                    reason TEXT,
                    sentinel2_scene_id TEXT,
                    bonn_code INTEGER,
                    bonn_label TEXT,
                    estimated_thickness_range_um TEXT,
                    provenance TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS thickness_estimates (
                    spill_id TEXT PRIMARY KEY,
                    analyzed_at TEXT NOT NULL,
                    classification TEXT NOT NULL,
                    backscatter_contrast_db REAL,
                    fragmentation_index REAL,
                    confidence REAL,
                    cross_validated_with_optical INTEGER,
                    provenance TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS evidence_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    spill_id TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    record_hash TEXT NOT NULL,
                    previous_hash TEXT NOT NULL,
                    stage_timestamp TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    tx_hash TEXT,
                    explorer_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spill_detected_at ON oil_spills(detected_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spill_confidence ON oil_spills(confidence)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spill_centroid ON oil_spills(centroid_lon, centroid_lat)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_evidence_spill_id ON evidence_ledger(spill_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_evidence_stage ON evidence_ledger(spill_id, stage)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_evidence_record_hash ON evidence_ledger(record_hash)")

            # Enforce Append-Only Immutability via Database Engine Triggers (Disallow UPDATE / DELETE)
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS prevent_evidence_ledger_update
                BEFORE UPDATE ON evidence_ledger
                BEGIN
                    SELECT RAISE(ABORT, 'evidence_ledger is an immutable append-only ledger; UPDATE operations are forbidden at database level.');
                END;
            """)
            cursor.execute("""
                CREATE TRIGGER IF NOT EXISTS prevent_evidence_ledger_delete
                BEFORE DELETE ON evidence_ledger
                BEGIN
                    SELECT RAISE(ABORT, 'evidence_ledger is an immutable append-only ledger; DELETE operations are forbidden at database level.');
                END;
            """)

            conn.commit()
            logger.info("Spill, Drift, Vessel, Optical, Thickness & Tamper-Evident Evidence Ledger database initialized.")

    def save_spill(self, record: SpillRecord) -> None:
        """
        Persists a SpillRecord to database.
        """
        geom_json = json.dumps(record.geometry.model_dump() if hasattr(record.geometry, "model_dump") else record.geometry)
        bbox_json = json.dumps(record.bbox)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO oil_spills (
                    spill_id, detected_at, geometry_json, area_km2, perimeter_km,
                    centroid_lon, centroid_lat, length_km, width_km, bbox_json,
                    orientation_deg, confidence, estimated_age_min_h, estimated_age_max_h,
                    source_image, provenance, wind_speed_ms, wind_direction_deg, aspect_ratio, radar_band
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record.spill_id,
                record.detected_at,
                geom_json,
                record.area_km2,
                record.perimeter_km,
                record.centroid[0],
                record.centroid[1],
                record.length_km,
                record.width_km,
                bbox_json,
                record.orientation_deg,
                record.confidence,
                record.estimated_age_hours[0],
                record.estimated_age_hours[1],
                record.source_image,
                record.provenance,
                record.wind_speed_ms,
                record.wind_direction_deg,
                record.aspect_ratio,
                record.radar_band
            ))
            conn.commit()

    def get_all_spills(self, limit: int = 100) -> List[SpillRecord]:
        """
        Retrieves recent spills sorted by detection time.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM oil_spills ORDER BY detected_at DESC LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [self._row_to_record(row) for row in rows]

    def get_spill_by_id(self, spill_id: str) -> Optional[SpillRecord]:
        """
        Retrieves a single spill record by ID.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM oil_spills WHERE spill_id = ?", (spill_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_record(row)
            return None

    def get_statistics(self) -> Dict[str, Any]:
        """
        Calculates aggregate metrics for the dashboard.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_spills,
                    COALESCE(SUM(area_km2), 0) as total_area_km2,
                    COALESCE(AVG(confidence), 0) as avg_confidence,
                    COALESCE(MAX(area_km2), 0) as max_spill_area_km2,
                    COALESCE(AVG(length_km), 0) as avg_length_km
                FROM oil_spills
            """)
            summary = dict(cursor.fetchone())
            
            # Confidence brackets
            cursor.execute("""
                SELECT 
                    CASE 
                        WHEN confidence >= 0.85 THEN 'High (>= 85%)'
                        WHEN confidence >= 0.70 THEN 'Medium (70-84%)'
                        ELSE 'Low (< 70%)'
                    END as bracket,
                    COUNT(*) as count
                FROM oil_spills
                GROUP BY bracket
            """)
            confidence_dist = [dict(r) for r in cursor.fetchall()]

            # Area brackets
            cursor.execute("""
                SELECT 
                    CASE 
                        WHEN area_km2 < 1.0 THEN '< 1.0 km²'
                        WHEN area_km2 < 5.0 THEN '1.0 - 5.0 km²'
                        WHEN area_km2 < 15.0 THEN '5.0 - 15.0 km²'
                        ELSE '> 15.0 km²'
                    END as size_category,
                    COUNT(*) as count
                FROM oil_spills
                GROUP BY size_category
            """)
            area_dist = [dict(r) for r in cursor.fetchall()]

            return {
                "summary": summary,
                "confidence_distribution": confidence_dist,
                "area_distribution": area_dist
            }

    def save_drift_simulation(self, spill_id: str, drift_data: Any) -> None:
        """
        Persists a DriftSimulationResponse to database keyed by spill_id.
        """
        payload_json = json.dumps(drift_data.model_dump() if hasattr(drift_data, "model_dump") else drift_data)
        simulated_at = drift_data.simulated_at if hasattr(drift_data, "simulated_at") else drift_data.get("simulated_at", "")
        provenance = drift_data.provenance if hasattr(drift_data, "provenance") else drift_data.get("provenance", "MODEL-PREDICTED")

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO drift_simulations (
                    spill_id, simulated_at, provenance, payload_json
                ) VALUES (?, ?, ?, ?)
            """, (spill_id, simulated_at, provenance, payload_json))
            conn.commit()

    def get_drift_simulation(self, spill_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves persisted drift simulation for a spill ID.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT payload_json FROM drift_simulations WHERE spill_id = ?", (spill_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row["payload_json"])
            return None

    def save_vessel_correlation(self, spill_id: str, vessel_data: Any) -> None:
        """
        Persists a VesselCorrelationResponse to database keyed by spill_id.
        """
        payload_json = json.dumps(vessel_data.model_dump() if hasattr(vessel_data, "model_dump") else vessel_data)
        analyzed_at = vessel_data.analyzed_at if hasattr(vessel_data, "analyzed_at") else vessel_data.get("analyzed_at", "")
        provenance = vessel_data.provenance if hasattr(vessel_data, "provenance") else vessel_data.get("provenance", "ANOMALY-FLAGGED")
        
        # Extract top suspect
        top_name, top_score = None, None
        cands = vessel_data.candidate_vessels if hasattr(vessel_data, "candidate_vessels") else vessel_data.get("candidate_vessels", [])
        if cands and len(cands) > 0:
            top_cand = cands[0]
            top_name = top_cand.vessel_name if hasattr(top_cand, "vessel_name") else top_cand.get("vessel_name")
            top_score = top_cand.suspect_score if hasattr(top_cand, "suspect_score") else top_cand.get("suspect_score")

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO vessel_attributions (
                    spill_id, analyzed_at, provenance, top_suspect_name, top_suspect_score, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (spill_id, analyzed_at, provenance, top_name, top_score, payload_json))
            conn.commit()

    def get_vessel_correlation(self, spill_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves persisted vessel correlation for a spill ID.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT payload_json FROM vessel_attributions WHERE spill_id = ?", (spill_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row["payload_json"])
            return None

    def save_optical_confirmation(self, spill_id: str, confirmation_data: Any) -> None:
        """
        Persists an OpticalConfirmationResponse to database keyed by spill_id.
        """
        payload_json = json.dumps(confirmation_data.model_dump() if hasattr(confirmation_data, "model_dump") else confirmation_data)
        analyzed_at = confirmation_data.analyzed_at if hasattr(confirmation_data, "analyzed_at") else confirmation_data.get("analyzed_at", "")
        opt_confirmed = confirmation_data.optical_confirmed if hasattr(confirmation_data, "optical_confirmed") else confirmation_data.get("optical_confirmed")
        opt_conf_int = 1 if opt_confirmed is True else (0 if opt_confirmed is False else None)
        reason = confirmation_data.reason if hasattr(confirmation_data, "reason") else confirmation_data.get("reason")
        scene_id = confirmation_data.sentinel2_scene_id if hasattr(confirmation_data, "sentinel2_scene_id") else confirmation_data.get("sentinel2_scene_id")
        bonn_code = confirmation_data.bonn_code if hasattr(confirmation_data, "bonn_code") else confirmation_data.get("bonn_code")
        bonn_label = confirmation_data.bonn_label if hasattr(confirmation_data, "bonn_label") else confirmation_data.get("bonn_label")
        thick_range = confirmation_data.estimated_thickness_range_um if hasattr(confirmation_data, "estimated_thickness_range_um") else confirmation_data.get("estimated_thickness_range_um")
        provenance = confirmation_data.provenance if hasattr(confirmation_data, "provenance") else confirmation_data.get("provenance", "MEASURED")

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO optical_confirmations (
                    spill_id, analyzed_at, optical_confirmed, reason, sentinel2_scene_id,
                    bonn_code, bonn_label, estimated_thickness_range_um, provenance, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (spill_id, analyzed_at, opt_conf_int, reason, scene_id, bonn_code, bonn_label, thick_range, provenance, payload_json))
            conn.commit()

    def get_optical_confirmation(self, spill_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves persisted optical confirmation for a spill ID.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT payload_json FROM optical_confirmations WHERE spill_id = ?", (spill_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row["payload_json"])
            return None

    def save_thickness_estimate(self, spill_id: str, thickness_data: Any) -> None:
        """
        Persists a ThicknessEstimateResponse to database keyed by spill_id.
        """
        payload_json = json.dumps(
            thickness_data.model_dump() if hasattr(thickness_data, "model_dump") else thickness_data
        )
        analyzed_at  = getattr(thickness_data, "analyzed_at",  None) or (thickness_data.get("analyzed_at",  "") if isinstance(thickness_data, dict) else "")
        classification = getattr(thickness_data, "classification", None) or (thickness_data.get("classification", "") if isinstance(thickness_data, dict) else "")
        contrast_db  = getattr(thickness_data, "backscatter_contrast_db", None) or (thickness_data.get("backscatter_contrast_db") if isinstance(thickness_data, dict) else None)
        frag_idx     = getattr(thickness_data, "fragmentation_index",    None) or (thickness_data.get("fragmentation_index")    if isinstance(thickness_data, dict) else None)
        confidence   = getattr(thickness_data, "confidence",             None) or (thickness_data.get("confidence")             if isinstance(thickness_data, dict) else None)
        cross_val    = getattr(thickness_data, "cross_validated_with_optical", None)
        if cross_val is None and isinstance(thickness_data, dict):
            cross_val = thickness_data.get("cross_validated_with_optical")
        cross_val_int = 1 if cross_val is True else (0 if cross_val is False else None)
        provenance   = getattr(thickness_data, "provenance", "MODEL-PREDICTED") or "MODEL-PREDICTED"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO thickness_estimates (
                    spill_id, analyzed_at, classification, backscatter_contrast_db,
                    fragmentation_index, confidence, cross_validated_with_optical, provenance, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                spill_id, analyzed_at, classification, contrast_db,
                frag_idx, confidence, cross_val_int, provenance, payload_json
            ))
            conn.commit()

    def get_thickness_estimate(self, spill_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves persisted SAR thickness estimate for a spill ID.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT payload_json FROM thickness_estimates WHERE spill_id = ?", (spill_id,))
            row = cursor.fetchone()
            if row:
                return json.loads(row["payload_json"])
            return None

    def insert_ledger_entry(
        self,
        spill_id: str,
        stage: str,
        record_hash: str,
        previous_hash: str,
        stage_timestamp: str,
        payload_json: str,
        tx_hash: Optional[str] = None,
        explorer_url: Optional[str] = None
    ) -> int:
        """
        Appends an immutable cryptographic record to evidence_ledger.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO evidence_ledger (
                    spill_id, stage, record_hash, previous_hash, stage_timestamp, payload_json, tx_hash, explorer_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (spill_id, stage, record_hash, previous_hash, stage_timestamp, payload_json, tx_hash, explorer_url))
            conn.commit()
            return cursor.lastrowid

    def get_ledger_entries(self, spill_id: str) -> List[sqlite3.Row]:
        """
        Retrieves all ledger entries for a spill ordered chronologically by ID ascending.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM evidence_ledger WHERE spill_id = ? ORDER BY id ASC
            """, (spill_id,))
            return cursor.fetchall()

    def get_latest_ledger_entry(self, spill_id: str) -> Optional[sqlite3.Row]:
        """
        Retrieves the most recent ledger entry for a spill (used to chain previous_hash).
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM evidence_ledger WHERE spill_id = ? ORDER BY id DESC LIMIT 1
            """, (spill_id,))
            return cursor.fetchone()

    def get_all_ledger_records(self, limit: int = 100) -> List[sqlite3.Row]:
        """
        Retrieves global recent ledger entries for auditing.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM evidence_ledger ORDER BY id DESC LIMIT ?
            """, (limit,))
            return cursor.fetchall()

    def get_assembled_spill(self, spill_id: str) -> Optional[Dict[str, Any]]:
        """
        Assembles all pipeline stages (Detection, Drift, Vessel, Optical Fusion,
        SAR Thickness) for a spill ID and evaluates Phase 7 Evidence Ledger verification.
        """
        spill = self.get_spill_by_id(spill_id)
        if not spill:
            return None

        drift     = self.get_drift_simulation(spill_id)
        vessels   = self.get_vessel_correlation(spill_id)
        optical   = self.get_optical_confirmation(spill_id)
        thickness = self.get_thickness_estimate(spill_id)

        # Lazy import evidence_service to verify tamper-evident chain
        from app.services.evidence_service import evidence_service
        verification = evidence_service.verify_chain(spill_id)
        is_chain_verified = verification.chain_verified and verification.chain_length > 0
        provenance_status = "VERIFIED" if is_chain_verified else "ASSEMBLED"

        import datetime
        now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "spill_id": spill_id,
            "assembled_at": now_utc,
            "provenance": provenance_status,
            "provenance_registry": {
                "detection": "DETECTED",
                "environmental_currents_wind": "MEASURED",
                "drift_hindcast_forecast": "MODEL-PREDICTED",
                "vessel_anomaly_attribution": "ANOMALY-FLAGGED",
                "optical_fusion": "MEASURED",
                "sar_thickness": "MODEL-PREDICTED",
                "evidence_ledger": "VERIFIED" if is_chain_verified else "UNVERIFIED"
            },
            "evidence_summary": {
                "chain_verified": is_chain_verified,
                "chain_length": verification.chain_length,
                "merkle_root": verification.merkle_root,
                "provenance": provenance_status,
                "stages_covered": verification.stages_covered,
                "public_anchor": verification.public_anchor.model_dump()
            },
            "spill": spill.model_dump() if hasattr(spill, "model_dump") else spill,
            "drift": drift,
            "vessels": vessels,
            "optical": optical,
            "sar_thickness": thickness,
            "stats": {
                "area_km2": spill.area_km2,
                "confidence": spill.confidence,
                "has_drift_simulated": drift is not None,
                "has_vessels_correlated": vessels is not None,
                "has_optical_confirmed": optical.get("optical_confirmed") is True if optical else False,
                "optical_status": (
                    "CONFIRMED" if optical and optical.get("optical_confirmed") is True
                    else ("UNCONFIRMED" if optical and optical.get("optical_confirmed") is False
                    else ("NO_CLEAN_SCENE" if optical and optical.get("optical_confirmed") is None
                    else "NOT_EVALUATED"))
                ),
                "sar_thickness_classification": thickness.get("classification") if thickness else None,
                "sar_thickness_cross_validated": thickness.get("cross_validated_with_optical") if thickness else None,
                "total_candidates": len(vessels.get("candidate_vessels", [])) if vessels else 0,
                "evidence_chain_verified": is_chain_verified
            }
        }

    def _row_to_record(self, row: sqlite3.Row) -> SpillRecord:
        return SpillRecord(
            spill_id=row["spill_id"],
            detected_at=row["detected_at"],
            geometry=json.loads(row["geometry_json"]),
            area_km2=row["area_km2"],
            perimeter_km=row["perimeter_km"],
            centroid=[row["centroid_lon"], row["centroid_lat"]],
            length_km=row["length_km"],
            width_km=row["width_km"],
            bbox=json.loads(row["bbox_json"]),
            orientation_deg=row["orientation_deg"],
            confidence=row["confidence"],
            estimated_age_hours=[row["estimated_age_min_h"], row["estimated_age_max_h"]],
            source_image=row["source_image"],
            provenance=row["provenance"],
            wind_speed_ms=row["wind_speed_ms"],
            wind_direction_deg=row["wind_direction_deg"],
            aspect_ratio=row["aspect_ratio"],
            radar_band=row["radar_band"]
        )


db_service = DatabaseService()


