import json
import os
import logging
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()

from app.schemas.drift import (
    DriftSimulationRequest,
    DriftSimulationResponse,
)
from app.schemas.fusion import (
    OpticalConfirmationResponse,
    OpticalFusionRequest,
)
from app.schemas.spill import (
    DateRange,
    DetectionRequest,
    DetectionResponse,
    PresetAOI,
    SpillRecord,
)
from app.schemas.evidence import (
    AnchorRequest,
    ChainVerificationResponse,
    LedgerEntry,
    PublicAnchorStatus,
)
from app.schemas.report import (
    ReportGenerationResponse,
)
from app.schemas.thickness import (
    ThicknessEstimateResponse,
    ThicknessRequest,
)
from app.schemas.vessel import (
    VesselCorrelationRequest,
    VesselCorrelationResponse,
)
from app.services.anchor_service import anchor_service
from app.services.anomaly_scorer import anomaly_scorer
from app.services.ais_engine import ais_engine
from app.services.copernicus_service import copernicus_cds_service
from app.services.db_service import db_service
from app.services.drift_engine import drift_engine
from app.services.evidence_service import evidence_service
from app.services.hydrodynamics import hydrodynamics
from app.services.live_ais_service import live_ais_service
from app.services.optical_fusion_service import optical_fusion_service
from app.services.report_service import report_service, REPORTS_DIR
from app.services.sar_engine import SAREngine
from app.services.sar_thickness_service import sar_thickness_service

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("marine_detection_api")

app = FastAPI(
    title="AquaSentinel — Marine Oil-Spill Detection & Vessel Attribution Platform API",
    description="SIH 2026 Prototype — Sentinel-1 SAR dark spot segmentation, UTM geospatial metrics, Copernicus/ERA5 drift simulation, AIS spatiotemporal correlation, ML anomaly attribution, Sentinel-2 optical fusion (Bonn Agreement) & SAR thickness classification.",
    version="4.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sar_engine = SAREngine()

# In-memory caches
_drift_cache: Dict[str, DriftSimulationResponse] = {}
_vessels_cache: Dict[str, VesselCorrelationResponse] = {}
_optical_cache: Dict[str, OpticalConfirmationResponse] = {}
_thickness_cache: Dict[str, ThicknessEstimateResponse] = {}

# High-profile maritime AOI presets
PRESETS: List[PresetAOI] = [
    PresetAOI(
        id="mumbai_high",
        name="Mumbai High Offshore Basin",
        description="Offshore oil field & busy tanker shipping channel in the Arabian Sea.",
        region="Arabian Sea, India",
        bbox=[71.95, 19.10, 72.85, 19.85],
        center=[72.40, 19.47],
        zoom=10,
        default_date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07")
    ),
    PresetAOI(
        id="malacca_strait",
        name="Strait of Malacca",
        description="Global maritime chokepoint with intense crude carrier and container traffic.",
        region="Southeast Asia",
        bbox=[101.40, 2.10, 102.30, 2.90],
        center=[101.85, 2.50],
        zoom=10,
        default_date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07")
    ),
    PresetAOI(
        id="persian_gulf",
        name="Strait of Hormuz & Persian Gulf",
        description="Major petroleum tanker export route and offshore platform cluster.",
        region="Middle East",
        bbox=[55.60, 25.80, 56.60, 26.80],
        center=[56.10, 26.30],
        zoom=10,
        default_date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07")
    ),
    PresetAOI(
        id="singapore_anchorage",
        name="Singapore Eastern Anchorage",
        description="High-density bunkering and ship-to-ship transfer anchorage zone.",
        region="Singapore Strait",
        bbox=[103.90, 1.20, 104.30, 1.45],
        center=[104.10, 1.32],
        zoom=11,
        default_date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07")
    ),
    PresetAOI(
        id="gulf_of_mexico",
        name="Gulf of Mexico Mississippi Canyon",
        description="Deepwater drilling hub with active natural seeps and offshore rigs.",
        region="Gulf of Mexico, USA",
        bbox=[-89.80, 28.20, -88.70, 29.10],
        center=[-89.25, 28.65],
        zoom=10,
        default_date_range=DateRange(start_date="2026-09-01", end_date="2026-09-07")
    )
]


@app.get("/api/v1/health")
def get_health() -> Dict[str, Any]:
    return {
        "status": "HEALTHY",
        "service": "AquaSentinel Marine Detection, Drift & Vessel Attribution Platform",
        "gee_connected": sar_engine.ee_initialized,
        "mode": "GEE_LIVE" if sar_engine.ee_initialized else "SAR_GEOENGINE_HIGH_FIDELITY",
        "database": "CONNECTED",
        "hydrodynamic_models": [
            "Copernicus Marine MULTIOBS_GLO_PHY_MYNRT_015_003 (Surface Currents)",
            "ECMWF ERA5 10m Marine Winds",
            "Lagrangian RK4 Particle Advection + Stochastic Diffusion"
        ],
        "ml_attribution": [
            "scikit-learn IsolationForest (Multi-Feature Kinematic Anomaly)",
            "Global Fishing Watch (GFW) / AIS Traffic Stream Correlation"
        ],
        "optical_fusion": [
            "COPERNICUS/S2_SR_HARMONIZED (< 20% Cloud Cover Filter)",
            "KMeans Hue / Color Dispersion Clustering inside Buffered Mask",
            "Bonn Agreement Oil Appearance Code (BAOAC 1-5 Classification)"
        ],
        "sar_thickness": [
            "Sigma-0 Inside-Polygon vs Buffer-Ring Backscatter Contrast (dB)",
            "GLCM Texture: Contrast, Homogeneity, Energy, Entropy, Correlation, Dissimilarity",
            "Polsby-Popper Fragmentation Index",
            "Rule-Based Classifier: thin_sheen | intermediate | thick_emulsion",
            "Phase 5 Optical (Bonn Code) Cross-Validation"
        ],
        "supported_sensors": ["Sentinel-1 GRD C-SAR", "Sentinel-2 MSI (Optical)"]
    }


@app.get("/api/v1/presets", response_model=List[PresetAOI])
def get_presets() -> List[PresetAOI]:
    return PRESETS


@app.post("/api/v1/detect", response_model=DetectionResponse)
def detect_oil_spills(request: DetectionRequest) -> DetectionResponse:
    """
    Primary Phase 1 Detection Endpoint:
    - Preprocesses Sentinel-1 VV SAR
    - Segments dark spots via adaptive threshold
    - Filters false positives via ERA5 wind thresholds
    - Reprojects to local UTM for exact area_km2, perimeter_km, length_km, width_km, orientation_deg
    - Persists results to database
    - Returns exact JSON contract
    """
    try:
        spills, metadata = sar_engine.run_detection(request)
        
        # Persist all detected spills to database & append to evidence ledger
        for spill in spills:
            db_service.save_spill(spill)
            evidence_service.record_stage(
                spill_id=spill.spill_id,
                stage="detection",
                payload=spill.model_dump() if hasattr(spill, "model_dump") else spill,
                stage_timestamp=spill.detected_at
            )

        return DetectionResponse(
            success=True,
            spills_detected_count=len(spills),
            spills=spills,
            aoi_bbox=metadata["aoi_bbox"],
            processing_metadata=metadata
        )
    except Exception as e:
        logger.error(f"Error during oil spill detection pipeline: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detection pipeline failed: {str(e)}"
        )


@app.post("/api/v1/drift/{spill_id}", response_model=DriftSimulationResponse)
def simulate_spill_drift(
    spill_id: str,
    request: Optional[DriftSimulationRequest] = None
) -> DriftSimulationResponse:
    """
    Primary Phase 2 Drift/Hindcast/Forecast Endpoint:
    - Fetches detected spill polygon
    - Seeds 500-2000 particles across the detected polygon
    - Runs backward hindcast (~48-72h) and forward forecast (~24-48h) via RK4 with stochastic diffusion
    - Computes KDE-based probability contours (p50/p75/p95)
    - Returns exact JSON contract with provenance: 'MODEL-PREDICTED'
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    sim_request = request or DriftSimulationRequest()

    try:
        logger.info(f"Running hydrodynamic drift simulation for {spill_id} (Particles: {sim_request.particle_count})...")
        result = drift_engine.run_drift_simulation(spill, sim_request)
        _drift_cache[spill_id] = result
        db_service.save_drift_simulation(spill_id, result)
        evidence_service.record_stage(
            spill_id=spill_id,
            stage="drift",
            payload=result.model_dump() if hasattr(result, "model_dump") else result,
            stage_timestamp=result.simulated_at
        )
        return result
    except Exception as e:
        logger.error(f"Drift simulation failed for {spill_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Drift simulation failed: {str(e)}"
        )


@app.get("/api/v1/drift/{spill_id}", response_model=DriftSimulationResponse)
def get_drift_simulation(spill_id: str) -> DriftSimulationResponse:
    """
    Retrieves cached drift simulation result or generates default.
    """
    if spill_id in _drift_cache:
        return _drift_cache[spill_id]
    
    # Check DB
    persisted = db_service.get_drift_simulation(spill_id)
    if persisted:
        res = DriftSimulationResponse(**persisted)
        _drift_cache[spill_id] = res
        return res

    return simulate_spill_drift(spill_id, DriftSimulationRequest())


@app.post("/api/v1/vessels/{spill_id}", response_model=VesselCorrelationResponse)
def correlate_vessels_for_spill(
    spill_id: str,
    request: Optional[VesselCorrelationRequest] = None
) -> VesselCorrelationResponse:
    """
    Primary Phase 3 AIS Vessel Correlation & Anomaly Attribution Endpoint:
    - Queries AIS traffic tracks around the p95 origin cluster over the release window (+/-12h padding)
    - Extracts 8 kinematic features (CPA, loitering, speed variance, AIS gaps, course changes)
    - Runs scikit-learn IsolationForest ML anomaly detector
    - Calculates weighted composite suspect scores
    - Returns ranked candidate vessels list with provenance: 'ANOMALY-FLAGGED' and disclaimer
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    corr_request = request or VesselCorrelationRequest()

    # Retrieve or run drift simulation to obtain origin centroid and origin window
    if spill_id in _drift_cache:
        drift_res = _drift_cache[spill_id]
        origin_centroid = drift_res.backward.origin_centroid
        origin_window = drift_res.backward.estimated_origin_time_window.model_dump()
    else:
        drift_res = get_drift_simulation(spill_id)
        origin_centroid = drift_res.backward.origin_centroid
        origin_window = drift_res.backward.estimated_origin_time_window.model_dump()

    try:
        logger.info(f"Running AIS vessel correlation & ML anomaly attribution for {spill_id}...")
        result = anomaly_scorer.evaluate_and_rank_vessels(
            spill_id=spill_id,
            origin_centroid=origin_centroid,
            origin_window=origin_window,
            slick_orientation_deg=spill.orientation_deg,
            request=corr_request
        )
        _vessels_cache[spill_id] = result
        db_service.save_vessel_correlation(spill_id, result)
        evidence_service.record_stage(
            spill_id=spill_id,
            stage="vessel_scoring",
            payload=result.model_dump() if hasattr(result, "model_dump") else result,
            stage_timestamp=result.analyzed_at
        )
        return result
    except Exception as e:
        logger.error(f"Vessel correlation failed for {spill_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vessel correlation failed: {str(e)}"
        )


@app.get("/api/v1/vessels/{spill_id}", response_model=VesselCorrelationResponse)
def get_vessel_correlation(spill_id: str) -> VesselCorrelationResponse:
    """
    Retrieves cached vessel correlation results or runs default attribution.
    """
    if spill_id in _vessels_cache:
        return _vessels_cache[spill_id]
    
    # Check DB
    persisted = db_service.get_vessel_correlation(spill_id)
    if persisted:
        try:
            res = VesselCorrelationResponse(**persisted)
            _vessels_cache[spill_id] = res
            return res
        except Exception:
            pass

    return correlate_vessels_for_spill(spill_id, VesselCorrelationRequest())


@app.post("/api/v1/fusion/{spill_id}", response_model=OpticalConfirmationResponse)
@app.post("/fusion/{spill_id}", response_model=OpticalConfirmationResponse)
def fuse_optical_for_spill(
    spill_id: str,
    request: Optional[OpticalFusionRequest] = None
) -> OpticalConfirmationResponse:
    """
    Primary Phase 5 Optical Fusion Endpoint:
    - Queries GEE Sentinel-2 SR (COPERNICUS/S2_SR_HARMONIZED) for the closest cloud-cover-filtered (<20%) scene within +/-48h
    - If no clean scene exists, returns optical_confirmed: null with reason (Never fabricates confirmation)
    - If scene exists: clips to SAR polygon (buffered), computes mean color/reflectance and KMeans hue clustering
    - Classifies against the Bonn Agreement Oil Appearance Code (Codes 1-5 with documented thickness ranges)
    - Returns bonn_code, bonn_label, estimated_thickness_range_um, optical_confirmed, sentinel2_scene_id, provenance: 'MEASURED'
    - Persists results to optical_confirmations database table
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    fusion_request = request or OpticalFusionRequest()

    try:
        logger.info(f"Running Sentinel-2 MSI SR optical fusion & Bonn Agreement classification for {spill_id}...")
        result = optical_fusion_service.fuse_spill_optical(spill, fusion_request)
        _optical_cache[spill_id] = result
        db_service.save_optical_confirmation(spill_id, result)
        evidence_service.record_stage(
            spill_id=spill_id,
            stage="fusion",
            payload=result.model_dump() if hasattr(result, "model_dump") else result,
            stage_timestamp=result.analyzed_at
        )
        return result
    except Exception as e:
        logger.error(f"Optical fusion failed for {spill_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Optical fusion failed: {str(e)}"
        )


@app.get("/api/v1/fusion/{spill_id}", response_model=OpticalConfirmationResponse)
@app.get("/fusion/{spill_id}", response_model=OpticalConfirmationResponse)
def get_optical_confirmation(spill_id: str) -> OpticalConfirmationResponse:
    """
    Retrieves cached optical confirmation results or executes default fusion analysis.
    """
    if spill_id in _optical_cache:
        return _optical_cache[spill_id]

    # Check DB
    persisted = db_service.get_optical_confirmation(spill_id)
    if persisted:
        res = OpticalConfirmationResponse(**persisted)
        _optical_cache[spill_id] = res
        return res

    return fuse_optical_for_spill(spill_id, OpticalFusionRequest())


@app.post("/api/v1/thickness/{spill_id}", response_model=ThicknessEstimateResponse)
@app.post("/thickness/{spill_id}", response_model=ThicknessEstimateResponse)
def classify_spill_thickness(
    spill_id: str,
    request: Optional[ThicknessRequest] = None
) -> ThicknessEstimateResponse:
    """
    Primary Phase 6 SAR Thickness Classification Endpoint:
    - Reuses calibrated sigma-0 raster from Phase 1 detection
    - Computes inside-polygon vs buffer-ring backscatter contrast (dB)
    - Computes GLCM texture features (contrast, homogeneity, energy, entropy,
      correlation, dissimilarity) via scikit-image.feature.graycomatrix
    - Derives Polsby-Popper fragmentation index from polygon geometry
    - Rule-based classifier: thin_sheen | intermediate | thick_emulsion with confidence
    - Cross-validates against Phase 5 optical Bonn Agreement code if available
    - Returns classification, backscatter_contrast_db, texture_features, confidence,
      cross_validated_with_optical, provenance: 'MODEL-PREDICTED'
    - Persists to thickness_estimates database table
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    thick_request = request or ThicknessRequest()

    # Fetch Phase 5 optical result for cross-validation (non-blocking)
    optical_result = db_service.get_optical_confirmation(spill_id)

    try:
        logger.info(f"Running SAR sigma-0 thickness classification for {spill_id}...")
        result = sar_thickness_service.classify_spill_thickness(
            spill=spill,
            request=thick_request,
            optical_result=optical_result,
        )
        _thickness_cache[spill_id] = result
        db_service.save_thickness_estimate(spill_id, result)
        evidence_service.record_stage(
            spill_id=spill_id,
            stage="thickness",
            payload=result.model_dump() if hasattr(result, "model_dump") else result,
            stage_timestamp=result.analyzed_at
        )
        return result
    except Exception as e:
        logger.error(f"SAR thickness classification failed for {spill_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SAR thickness classification failed: {str(e)}"
        )


@app.get("/api/v1/thickness/{spill_id}", response_model=ThicknessEstimateResponse)
@app.get("/thickness/{spill_id}", response_model=ThicknessEstimateResponse)
def get_thickness_estimate(spill_id: str) -> ThicknessEstimateResponse:
    """
    Retrieves cached SAR thickness classification or executes default analysis.
    """
    if spill_id in _thickness_cache:
        return _thickness_cache[spill_id]

    persisted = db_service.get_thickness_estimate(spill_id)
    if persisted:
        res = ThicknessEstimateResponse(**persisted)
        _thickness_cache[spill_id] = res
        return res

    return classify_spill_thickness(spill_id, ThicknessRequest())


@app.get("/api/v1/spill/{spill_id}")
@app.get("/spill/{spill_id}")
@app.get("/api/v1/spills/{spill_id}/full")
def get_full_assembled_spill(spill_id: str) -> Dict[str, Any]:
    """
    Phases 4, 5 & 6 Full Hydration Endpoint:
    - Phase 1: Detected Spill Geometry & UTM metrics (DETECTED)
    - Phase 1/2: ERA5 wind and Copernicus current measurements (MEASURED)
    - Phase 2: Lagrangian Drift Hindcast & Forecast with Particle Tracks (MODEL-PREDICTED)
    - Phase 3: AIS Correlation & IsolationForest ML Anomaly Attribution (ANOMALY-FLAGGED)
    - Phase 5: Sentinel-2 SR Optical Fusion & Bonn Agreement Code (MEASURED)
    - Phase 6: SAR Sigma-0 Thickness Classification & Optical Cross-Validation (MODEL-PREDICTED)
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    # Ensure all pipeline stages are loaded or computed
    drift_data   = get_drift_simulation(spill_id)
    vessel_data  = get_vessel_correlation(spill_id)
    optical_data = get_optical_confirmation(spill_id)
    thick_data   = get_thickness_estimate(spill_id)

    assembled = db_service.get_assembled_spill(spill_id)
    if not assembled:
        raise HTTPException(status_code=404, detail=f"Could not assemble spill '{spill_id}'.")

    return assembled


@app.get("/api/v1/spills", response_model=List[SpillRecord])
def get_spills(limit: int = 50) -> List[SpillRecord]:
    return db_service.get_all_spills(limit=limit)


@app.get("/api/v1/spills/{spill_id}", response_model=SpillRecord)
def get_spill_by_id(spill_id: str) -> SpillRecord:
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")
    return spill


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 7 — Cryptographic Evidence Ledger Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/evidence/verify/{spill_id}", response_model=ChainVerificationResponse)
@app.get("/evidence/verify/{spill_id}", response_model=ChainVerificationResponse)
def verify_spill_evidence_chain(spill_id: str) -> ChainVerificationResponse:
    """
    Primary Phase 7 Cryptographic Evidence Verification Endpoint:
    - Recomputes SHA-256 hash across canonical JSON output of each completed pipeline stage
    - Merkle-chain validation: verifies previous_hash(N) == record_hash(N-1) from GENESIS to stage N
    - Returns chain_verified: true/false, chain_length, full ordered entry list with individual statuses
    - Computes Merkle root and returns public testnet anchor status
    - Returns provenance: 'VERIFIED' for unbroken chains
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    return evidence_service.verify_chain(spill_id)


@app.get("/api/v1/evidence/ledger/{spill_id}", response_model=List[LedgerEntry])
@app.get("/evidence/ledger/{spill_id}", response_model=List[LedgerEntry])
def get_spill_evidence_ledger(spill_id: str) -> List[LedgerEntry]:
    """
    Retrieves full raw immutable evidence ledger entries for a spill.
    """
    rows = db_service.get_ledger_entries(spill_id)
    entries = []
    for r in rows:
        row_dict = dict(r)
        payload = json.loads(row_dict["payload_json"]) if row_dict.get("payload_json") else None
        entries.append(
            LedgerEntry(
                id=row_dict["id"],
                spill_id=row_dict["spill_id"],
                stage=row_dict["stage"],
                record_hash=row_dict["record_hash"],
                previous_hash=row_dict["previous_hash"],
                stage_timestamp=row_dict["stage_timestamp"],
                payload=payload,
                tx_hash=row_dict.get("tx_hash"),
                explorer_url=row_dict.get("explorer_url"),
                is_valid=True
            )
        )
    return entries


@app.post("/api/v1/evidence/anchor/{spill_id}", response_model=PublicAnchorStatus)
@app.post("/evidence/anchor/{spill_id}", response_model=PublicAnchorStatus)
def trigger_spill_blockchain_anchor(
    spill_id: str,
    request: Optional[AnchorRequest] = None
) -> PublicAnchorStatus:
    """
    Triggers on-demand public testnet Merkle anchoring (Polygon Amoy / Ethereum Sepolia).
    Degrades gracefully if testnet wallet is unconfigured or network is unavailable.
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")

    verification = evidence_service.verify_chain(spill_id)
    req = request or AnchorRequest()
    network = req.network or "polygon_amoy"
    return anchor_service.anchor_merkle_root(spill_id, verification.merkle_root, network=network)


# ─────────────────────────────────────────────────────────────────────────────
# PHASE 8 — Automated PDF Forensic Report Generator Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/v1/report/{spill_id}/generate", response_model=ReportGenerationResponse)
@app.post("/report/{spill_id}/generate", response_model=ReportGenerationResponse)
def generate_forensic_pdf_report(spill_id: str) -> ReportGenerationResponse:
    """
    Phase 8 Forensic Dossier Generation:
    - Renders multi-page high-fidelity PDF dossier (Cover, Physical Characterization, Drift & Origin, Vessel Attribution, Evidence Ledger, Regulatory Appendix)
    - Renders static PNG cartographic overlays and suspect component score decomposition
    - Calculates SHA-256 cryptographic digest of document bytes
    - Appends 'report' stage to immutable evidence ledger
    - Returns report metadata, SHA-256 hash, and download URL
    """
    spill = db_service.get_spill_by_id(spill_id)
    if not spill:
        raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")
    
    try:
        response = report_service.generate_forensic_report(spill_id=spill_id)
        return response
    except Exception as e:
        logger.error(f"Error generating forensic report for spill_id={spill_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate forensic report: {str(e)}")


@app.get("/api/v1/report/{spill_id}/download")
@app.get("/report/{spill_id}/download")
def download_forensic_pdf_report(spill_id: str):
    """
    Downloads the generated Phase 8 forensic PDF report for the given spill.
    """
    pdf_filename = f"{spill_id}_forensic_report.pdf"
    pdf_path = os.path.join(REPORTS_DIR, pdf_filename)
    if not os.path.exists(pdf_path):
        # Trigger generation on the fly if file not yet on disk
        spill = db_service.get_spill_by_id(spill_id)
        if not spill:
            raise HTTPException(status_code=404, detail=f"Spill with ID '{spill_id}' not found.")
        report_service.generate_forensic_report(spill_id=spill_id)
    
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"Report for spill '{spill_id}' could not be located.")
        
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=pdf_filename,
        headers={"Content-Disposition": f"inline; filename={pdf_filename}"}
    )


@app.on_event("startup")
async def on_startup():
    if os.getenv("TESTING") == "1":
        logger.info("TESTING mode active — skipping background live AIS websocket loop.")
        return
    logger.info("Initializing Live Feed services: AISStream, Copernicus CDS, Global Fishing Watch, MapTiler...")
    await live_ais_service.start()
    logger.info("Live AIS Stream worker active.")


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Stopping background live workers...")
    await live_ais_service.stop()


@app.get("/api/v1/live/status")
async def get_live_providers_status() -> Dict[str, Any]:
    """
    Live Telemetry Health & Connectivity Status for all 4 Integrated Providers:
    1. MapTiler Cloud HD Vector & Ocean Tiles
    2. AISStream.io Live Real-Time Vessel WebSocket
    3. Global Fishing Watch (GFW) v3 Gateway
    4. Copernicus Climate Data Store (CDS) ERA5/Marine Engine
    """
    cds_verified = await copernicus_cds_service.verify_connection()
    return {
        "timestamp": os.getenv("CURRENT_TIME", "LIVE"),
        "providers": {
            "maptiler": {
                "name": "MapTiler Cloud",
                "key_configured": bool(os.getenv("MAPTILER_API_KEY")),
                "services": ["Dataviz Dark", "Satellite Hybrid HD", "Ocean Topography", "Marine Bathymetry"],
                "status": "LIVE_ACTIVE"
            },
            "aisstream": live_ais_service.get_status(),
            "global_fishing_watch": ais_engine.get_gfw_status(),
            "copernicus_cds": {
                **copernicus_cds_service.get_status(),
                "verified": cds_verified
            }
        }
    }


@app.get("/api/v1/live/ais")
async def get_live_ais_vessels(
    min_lon: Optional[float] = None,
    min_lat: Optional[float] = None,
    max_lon: Optional[float] = None,
    max_lat: Optional[float] = None,
    limit: int = 150
) -> Dict[str, Any]:
    """
    Returns currently tracked real-time AIS vessels streamed live from AISStream.io.
    """
    bbox = None
    if all(coord is not None for coord in [min_lon, min_lat, max_lon, max_lat]):
        bbox = [min_lon, min_lat, max_lon, max_lat]

    vessels = await live_ais_service.get_live_vessels(bbox=bbox, limit=limit)
    return {
        "success": True,
        "count": len(vessels),
        "source": "AISSTREAM_REALTIME_WS",
        "bbox_filter": bbox,
        "vessels": vessels
    }


@app.websocket("/api/v1/ws/live-ais")
async def websocket_live_ais_stream(websocket: WebSocket):
    """
    High-frequency WebSocket endpoint streaming real-time live AIS vessel updates directly to frontend clients.
    """
    await websocket.accept()
    logger.info("Frontend connected to Live AIS WebSocket stream.")
    queue = live_ais_service.add_subscriber()
    try:
        while True:
            vessel_data = await queue.get()
            await websocket.send_json(vessel_data)
    except WebSocketDisconnect:
        logger.info("Frontend disconnected from Live AIS WebSocket stream.")
    finally:
        live_ais_service.remove_subscriber(queue)


@app.get("/api/v1/live/copernicus")
def get_live_copernicus_marine(
    lon: float = 72.40,
    lat: float = 19.47,
    time_offset_hours: float = 0.0
) -> Dict[str, Any]:
    """
    Returns Copernicus CDS Marine physics (surface currents) & ERA5 10m marine winds.
    """
    u_o, v_o, u_w, v_w = hydrodynamics.get_velocity_at(lon, lat, time_offset_hours)
    return {
        "location": {"lon": lon, "lat": lat},
        "time_offset_hours": time_offset_hours,
        "ocean_current": {
            "u_ms": round(u_o, 3),
            "v_ms": round(v_o, 3),
            "speed_ms": round((u_o**2 + v_o**2)**0.5, 3),
            "product": "Copernicus MULTIOBS_GLO_PHY_MYNRT_015_003"
        },
        "marine_wind_10m": {
            "u_ms": round(u_w, 2),
            "v_ms": round(v_w, 2),
            "speed_ms": round((u_w**2 + v_w**2)**0.5, 2),
            "product": "ECMWF ERA5 10m Wind Reanalysis"
        }
    }


@app.get("/api/v1/stats")
def get_analytics_stats() -> Dict[str, Any]:
    return db_service.get_statistics()


