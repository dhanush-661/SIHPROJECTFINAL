import os
import io
import hashlib
import pytest
from fastapi.testclient import TestClient

# Set TESTING environment variable before importing main
os.environ["TESTING"] = "1"

from app.main import app
from app.services.db_service import db_service
from app.services.evidence_service import evidence_service
from app.services.report_service import report_service, REPORTS_DIR
from app.services.report_renderer import (
    render_spill_map_png,
    render_vessel_score_chart_png,
    render_qr_code_png
)
from app.schemas.spill import SpillRecord

client = TestClient(app)

SAMPLE_SPILL_ID = "test_spill_phase8_forensic"


@pytest.fixture(autouse=True)
def setup_test_spill():
    """Seed test database with complete mock spill pipeline data for testing."""
    # 1. Create mock spill record
    spill = SpillRecord(
        spill_id=SAMPLE_SPILL_ID,
        detected_at="2026-09-11T12:00:00Z",
        geometry={
            "type": "Polygon",
            "coordinates": [[
                [80.25, 13.06],
                [80.29, 13.06],
                [80.30, 13.10],
                [80.26, 13.11],
                [80.25, 13.06]
            ]]
        },
        area_km2=18.45,
        perimeter_km=24.2,
        centroid=[80.2707, 13.0827],
        length_km=6.2,
        width_km=3.1,
        bbox=[80.25, 13.06, 80.30, 13.11],
        orientation_deg=45.0,
        confidence=0.96,
        estimated_age_hours=[12.0, 24.0],
        source_image="S1A_IW_GRDH_1SDV_20260911T120000_TEST",
        provenance="DETECTED"
    )
    db_service.save_spill(spill)

    # 2. Add mock drift hindcast
    drift_data = {
        "spill_id": SAMPLE_SPILL_ID,
        "backward": {
            "origin_centroid": {"lat": 13.02, "lon": 80.20},
            "duration_hours": 18,
            "metocean_summary": {
                "mean_wind_speed_ms": 6.2,
                "mean_current_speed_ms": 0.35
            },
            "p50_contour": {
                "type": "Polygon",
                "coordinates": [[[80.18, 13.00], [80.22, 13.00], [80.22, 13.04], [80.18, 13.04], [80.18, 13.00]]]
            },
            "p75_contour": {
                "type": "Polygon",
                "coordinates": [[[80.16, 12.98], [80.24, 12.98], [80.24, 13.06], [80.16, 13.06], [80.16, 12.98]]]
            },
            "p95_contour": {
                "type": "Polygon",
                "coordinates": [[[80.14, 12.95], [80.26, 12.95], [80.26, 13.08], [80.14, 13.08], [80.14, 12.95]]]
            }
        }
    }
    db_service.save_drift_simulation(SAMPLE_SPILL_ID, drift_data)

    # 3. Add mock vessel correlation
    vessel_data = {
        "spill_id": SAMPLE_SPILL_ID,
        "candidate_vessels": [
            {
                "mmsi": "419001234",
                "name": "MT OCEAN PHOENIX",
                "vessel_type": "Crude Oil Tanker",
                "flag": "Liberia",
                "suspect_score": 0.885,
                "distance_to_origin_km": 0.84,
                "time_delta_minutes": 14.5,
                "anomaly_type": "Speed Drop & Loitering in Slick Origin",
                "component_scores": {
                    "proximity_score": 0.92,
                    "temporal_score": 0.88,
                    "trajectory_score": 0.85,
                    "ml_anomaly_score": 0.89
                },
                "track": [
                    {"lon": 80.15, "lat": 12.98, "timestamp": "2026-09-11T02:00:00Z"},
                    {"lon": 80.20, "lat": 13.02, "timestamp": "2026-09-11T04:00:00Z"},
                    {"lon": 80.27, "lat": 13.08, "timestamp": "2026-09-11T08:00:00Z"}
                ]
            },
            {
                "mmsi": "353005678",
                "name": "MV STAR BULKER",
                "vessel_type": "Bulk Carrier",
                "flag": "Panama",
                "suspect_score": 0.420,
                "distance_to_origin_km": 4.12,
                "time_delta_minutes": 42.0,
                "anomaly_type": "Minor Course Deviation",
                "component_scores": {
                    "proximity_score": 0.45,
                    "temporal_score": 0.50,
                    "trajectory_score": 0.35,
                    "ml_anomaly_score": 0.38
                },
                "track": [
                    {"lon": 80.12, "lat": 12.90, "timestamp": "2026-09-11T01:00:00Z"},
                    {"lon": 80.22, "lat": 13.00, "timestamp": "2026-09-11T03:30:00Z"}
                ]
            }
        ]
    }
    db_service.save_vessel_correlation(SAMPLE_SPILL_ID, vessel_data)

    # 4. Add mock optical confirmation & thickness
    db_service.save_optical_confirmation(SAMPLE_SPILL_ID, {
        "spill_id": SAMPLE_SPILL_ID,
        "optical_confirmed": True,
        "bonn_code": "Bonn II",
        "bonn_label": "Rainbow Sheen (0.3 - 5.0 µm)",
        "min_thickness_um": 0.3,
        "max_thickness_um": 5.0
    })

    # Record genesis evidence stages
    evidence_service.record_stage(SAMPLE_SPILL_ID, "detection", {"spill_id": SAMPLE_SPILL_ID, "area": 18.45})
    evidence_service.record_stage(SAMPLE_SPILL_ID, "drift", {"origin_lat": 13.02, "origin_lon": 80.20})
    evidence_service.record_stage(SAMPLE_SPILL_ID, "vessel_scoring", {"top_mmsi": "419001234", "score": 0.885})


def test_render_spill_map_png():
    """Verify server-side cartographic map rendering generates valid PNG bytes."""
    assembled = db_service.get_assembled_spill(SAMPLE_SPILL_ID)
    spill_data = {
        "spill_id": SAMPLE_SPILL_ID,
        "spill_record": assembled["spill"],
        "drift_hindcast": assembled["drift"],
        "vessel_correlation": assembled["vessels"],
        "optical_confirmation": assembled["optical"]
    }
    png_bytes = render_spill_map_png(spill_data)
    assert isinstance(png_bytes, bytes)
    assert len(png_bytes) > 5000  # Valid high-res PNG image
    # PNG signature check (first 8 bytes: 89 50 4E 47 0D 0A 1A 0A)
    assert png_bytes.startswith(b'\x89PNG\r\n\x1a\n')


def test_render_vessel_score_chart_png():
    """Verify component score decomposition chart renders valid stacked bar PNG."""
    vessel_data = db_service.get_vessel_correlation(SAMPLE_SPILL_ID) or {}
    candidates = vessel_data.get("candidate_vessels", [])
    png_bytes = render_vessel_score_chart_png(candidates)
    assert isinstance(png_bytes, bytes)
    assert len(png_bytes) > 3000
    assert png_bytes.startswith(b'\x89PNG\r\n\x1a\n')


def test_render_qr_code_png():
    """Verify verification QR code generator outputs valid PNG."""
    qr_bytes = render_qr_code_png("http://localhost:8000/api/v1/evidence/verify/test_spill")
    assert isinstance(qr_bytes, bytes)
    assert len(qr_bytes) > 200
    assert qr_bytes.startswith(b'\x89PNG\r\n\x1a\n')


def test_report_service_generation():
    """Verify full ReportService generates a valid multi-page PDF, hashes it, and appends to ledger."""
    response = report_service.generate_forensic_report(SAMPLE_SPILL_ID)
    
    assert response.spill_id == SAMPLE_SPILL_ID
    assert response.pdf_url == f"/api/v1/report/{SAMPLE_SPILL_ID}/download"
    assert len(response.report_hash) == 64  # Valid SHA-256 hex string
    assert response.pages_count == 6
    assert response.provenance["forensic_report"] == "VERIFIED"
    assert response.provenance["sar_detection"] == "DETECTED"

    # Check file on disk
    expected_path = os.path.join(REPORTS_DIR, f"{SAMPLE_SPILL_ID}_forensic_report.pdf")
    assert os.path.exists(expected_path)
    
    with open(expected_path, "rb") as f:
        file_bytes = f.read()
    
    # Check PDF magic bytes (%PDF-)
    assert file_bytes.startswith(b'%PDF-')
    # Check SHA-256 matches
    assert hashlib.sha256(file_bytes).hexdigest() == response.report_hash

    # Verify evidence ledger chain has appended 'report' stage
    is_valid, msg = evidence_service.validate_chain(SAMPLE_SPILL_ID)
    assert is_valid is True, f"Evidence chain validation failed: {msg}"
    
    ledger = evidence_service.get_ledger(SAMPLE_SPILL_ID)
    report_entries = [e for e in ledger if getattr(e, "stage", "") == "report"]
    assert len(report_entries) >= 1


def test_endpoint_report_generate():
    """Test POST /api/v1/report/{spill_id}/generate endpoint."""
    resp = client.post(f"/api/v1/report/{SAMPLE_SPILL_ID}/generate")
    assert resp.status_code == 200
    data = resp.json()
    assert data["spill_id"] == SAMPLE_SPILL_ID
    assert "pdf_url" in data
    assert len(data["report_hash"]) == 64
    assert data["provenance"]["forensic_report"] == "VERIFIED"


def test_endpoint_report_download():
    """Test GET /api/v1/report/{spill_id}/download endpoint returns valid PDF."""
    resp = client.get(f"/api/v1/report/{SAMPLE_SPILL_ID}/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b'%PDF-')
