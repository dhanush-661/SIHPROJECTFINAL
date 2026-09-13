from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ThicknessRequest(BaseModel):
    buffer_ring_meters: Optional[float] = Field(
        500.0, ge=100.0, le=5000.0,
        description="Width of the surrounding buffer ring used to compute background sigma-0 reference (metres)"
    )
    glcm_levels: Optional[int] = Field(
        64, ge=16, le=256,
        description="Number of grey levels for GLCM texture computation"
    )
    glcm_distances: Optional[List[int]] = Field(
        default=[1, 2, 5],
        description="Pixel-distance offsets for GLCM computation"
    )


# ---------------------------------------------------------------------------
# SAR Classification tiers
# ---------------------------------------------------------------------------
SAR_CLASSES = {
    "thin_sheen": {
        "label": "Thin Sheen",
        "description": (
            "High uniform contrast with low fragmentation. "
            "Likely fresh surface film (<1 µm – 50 µm). "
            "Corresponds to Bonn Code 1–2 (Sheen / Rainbow)."
        ),
        "bonn_codes_compatible": [1, 2],
    },
    "intermediate": {
        "label": "Intermediate Layer",
        "description": (
            "Moderate backscatter suppression with intermediate texture. "
            "Typical of intermediate-aged emulsions (5–100 µm). "
            "Corresponds to Bonn Code 2–3 (Rainbow / Metallic)."
        ),
        "bonn_codes_compatible": [2, 3],
    },
    "thick_emulsion": {
        "label": "Thick Emulsion / Mousse",
        "description": (
            "Moderate contrast with high texture heterogeneity and fragmentation. "
            "Indicative of heavy crude or weathered emulsion (>50 µm). "
            "Corresponds to Bonn Code 4–5 (True Oil Colour)."
        ),
        "bonn_codes_compatible": [4, 5],
    },
}


class GLCMTextureFeatures(BaseModel):
    contrast: float = Field(..., description="GLCM contrast — measures local intensity variation")
    homogeneity: float = Field(..., description="GLCM homogeneity (inverse difference moment) — closeness to diagonal")
    energy: float = Field(..., description="GLCM energy (angular second moment) — textural uniformity")
    entropy: float = Field(..., description="GLCM entropy — randomness / heterogeneity of the texture")
    correlation: float = Field(..., description="GLCM correlation — linear grey-tone dependency")
    dissimilarity: float = Field(..., description="GLCM dissimilarity — grey-tone distance weighting")


class OpticalCrossCheck(BaseModel):
    bonn_code_optical: int = Field(..., description="Bonn code assigned by Phase 5 optical fusion")
    bonn_label_optical: str = Field(..., description="Phase 5 Bonn label")
    sar_class: str = Field(..., description="This SAR classification (thin_sheen / intermediate / thick_emulsion)")
    compatible: bool = Field(..., description="True if SAR class and optical Bonn code are physically compatible")
    agreement_note: str = Field(..., description="Human-readable cross-validation note")


class ThicknessEstimateResponse(BaseModel):
    spill_id: str = Field(..., description="Unique identifier of the spill event")
    analyzed_at: str = Field(..., description="ISO 8601 timestamp of the SAR thickness analysis")

    # Core classification
    classification: str = Field(
        ...,
        description="SAR thickness class: thin_sheen | intermediate | thick_emulsion"
    )
    classification_label: str = Field(..., description="Human-readable classification label")
    classification_description: str = Field(..., description="Physical interpretation of the SAR class")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Classifier confidence score (0–1)")

    # Backscatter metrics
    sigma0_inside_mean_db: float = Field(..., description="Mean sigma-0 (dB) inside the spill polygon")
    sigma0_buffer_mean_db: float = Field(..., description="Mean sigma-0 (dB) in the surrounding buffer ring")
    backscatter_contrast_db: float = Field(..., description="Contrast = buffer_mean − inside_mean (dB). Positive values indicate dampening.")

    # Texture
    texture_features: GLCMTextureFeatures = Field(..., description="GLCM texture feature set computed inside the polygon mask")

    # Fragmentation index (reused from Phase 1 age estimation heuristics)
    fragmentation_index: float = Field(
        ..., ge=0.0, le=1.0,
        description="Polygon fragmentation index derived from perimeter²/area. 0 = compact, 1 = highly fragmented"
    )

    # Optical cross-validation (Phase 5)
    cross_validated_with_optical: Optional[bool] = Field(
        None,
        description="True if Phase 5 optical result exists and is compatible, False if contradictory, null if no optical result"
    )
    optical_cross_check: Optional[OpticalCrossCheck] = Field(
        None,
        description="Detailed optical ↔ SAR cross-validation result"
    )

    # Provenance
    provenance: str = Field("MODEL-PREDICTED", description="Data provenance: MODEL-PREDICTED")
    source_granule: Optional[str] = Field(None, description="Sentinel-1 GRD granule used for this analysis")
