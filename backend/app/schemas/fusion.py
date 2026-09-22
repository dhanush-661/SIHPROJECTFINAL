from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class OpticalFusionRequest(BaseModel):
    max_cloud_cover_pct: Optional[float] = Field(20.0, ge=0.0, le=100.0, description="Maximum allowed scene cloud cover percentage (default 20%)")
    time_window_hours: Optional[float] = Field(48.0, ge=1.0, le=168.0, description="Temporal search window (+/- hours from spill detection)")
    buffer_meters: Optional[float] = Field(300.0, ge=0.0, le=5000.0, description="Buffer distance in meters around SAR polygon for optical clipping")
    force_no_scene: Optional[bool] = Field(False, description="Testing flag to simulate high cloud cover / no clean scene")
    satellite_platform: Optional[str] = Field("AUTO", description="Target satellite constellation: AUTO, SENTINEL_2, LANDSAT_8, or LANDSAT_9")
    include_thermal: Optional[bool] = Field(True, description="Whether to include TIRS thermal radiometry for Landsat 8/9")


class HueCluster(BaseModel):
    cluster_id: int = Field(..., description="Cluster identifier (0-indexed)")
    hue_deg: float = Field(..., description="Cluster center hue in degrees (0 - 360)")
    relative_weight_pct: float = Field(..., description="Percentage of slick area occupied by this hue cluster")
    rgb_hex: str = Field(..., description="Representative hex color code")
    description: str = Field(..., description="Visual color interpretation")


class BonnClassificationDetails(BaseModel):
    code: int = Field(..., ge=1, le=5, description="Bonn Agreement Oil Appearance Code (1 to 5)")
    label: str = Field(..., description="Bonn appearance label")
    thickness_range_um: str = Field(..., description="Documented physical thickness range in micrometers")
    min_thickness_um: float = Field(..., description="Minimum layer thickness in micrometers")
    max_thickness_um: float = Field(..., description="Maximum layer thickness in micrometers")
    optical_appearance: str = Field(..., description="Visual appearance description under natural illumination")
    minimum_volume_m3_km2: float = Field(..., description="Theoretical minimum oil volume per square km")


class ThermalTelemetry(BaseModel):
    brightness_temp_k: float = Field(..., description="Surface brightness temperature in Kelvin")
    ambient_sea_temp_k: float = Field(..., description="Surrounding sea surface temperature in Kelvin")
    thermal_contrast_k: float = Field(..., description="Thermal anomaly contrast delta T (K) over slick")
    sensor_band: str = Field("TIRS Band 10 (10.6-11.19 µm)", description="Thermal infrared band used")
    thermal_signature: str = Field(..., description="Physical interpretation of thermal anomaly")


class OpticalConfirmationResponse(BaseModel):
    spill_id: str = Field(..., description="Unique identifier of the spill event")
    analyzed_at: str = Field(..., description="ISO 8601 timestamp of the optical fusion analysis")
    optical_confirmed: Optional[bool] = Field(
        None,
        description="True if confirmed via clean optical scene, False if unconfirmed/terrestrial rejection, null if no clean scene exists"
    )
    reason: Optional[str] = Field(None, description="Detailed explanatory reason when confirmation cannot be established")
    
    # Constellation & Sensor Metadata
    satellite_platform: str = Field("Sentinel-2 MSI", description="Satellite platform used: Sentinel-2 MSI, Landsat 8 OLI/TIRS, Landsat 9 OLI-2/TIRS-2")
    sensor_name: str = Field("MSI", description="Primary sensor: MSI, OLI, OLI-2, TIRS")
    scene_id: Optional[str] = Field(None, description="Standard scene/granule product ID across platforms")
    resolution_meters: Optional[float] = Field(10.0, description="Spatial resolution in meters (10m for Sentinel-2, 30m for Landsat OLI)")
    
    # Terrestrial Rejection / Audit Codes
    rejection_code: Optional[str] = Field(None, description="Audit rejection code if false positive (e.g. FALSE_POSITIVE_TERRESTRIAL)")
    ndwi: Optional[float] = Field(None, description="Normalized Difference Water Index (Green - NIR) / (Green + NIR)")
    ndvi: Optional[float] = Field(None, description="Normalized Difference Vegetation Index (NIR - Red) / (NIR + Red)")

    # Backward compatible alias for Sentinel-2 scene ID
    sentinel2_scene_id: Optional[str] = Field(None, description="Legacy alias for optical scene ID")
    scene_cloud_cover_pct: Optional[float] = Field(None, description="Cloud cover percentage of the selected optical scene")
    scene_acquisition_time: Optional[str] = Field(None, description="Acquisition timestamp of the optical scene")
    time_difference_hours: Optional[float] = Field(None, description="Time offset between SAR detection and optical pass")
    
    # Bonn Agreement Oil Appearance Code
    bonn_code: Optional[int] = Field(None, ge=1, le=5, description="Bonn Agreement Oil Appearance Code (1 to 5)")
    bonn_label: Optional[str] = Field(None, description="Bonn Agreement class label")
    estimated_thickness_range_um: Optional[str] = Field(None, description="Documented thickness range in micrometers")
    min_thickness_um: Optional[float] = Field(None, description="Lower bound thickness in micrometers")
    max_thickness_um: Optional[float] = Field(None, description="Upper bound thickness in micrometers")
    
    # Spectral and Color Metrics
    mean_reflectance: Optional[Dict[str, float]] = Field(
        None,
        description="Mean surface reflectance across optical bands (B2_blue, B3_green, B4_red, B8_nir or B5_nir)"
    )
    hue_clusters: Optional[List[HueCluster]] = Field(
        None,
        description="KMeans color/hue clusters identified within the masked slick area"
    )
    slick_coverage_pct: Optional[float] = Field(None, description="Estimated percentage of polygon area with optical slick signature")
    
    # Landsat Thermal Infrared Radiometry
    thermal_telemetry: Optional[ThermalTelemetry] = Field(
        None,
        description="Thermal infrared radiometry payload from Landsat 8/9 TIRS (Band 10)"
    )

    # Provenance & Audit
    provenance: str = Field("MEASURED", description="Data provenance classification: MEASURED")
    disclaimer: Optional[str] = Field(
        "Optical appearance codes and thickness estimates are derived according to the Bonn Agreement Oil Appearance Code (BAOAC) standards and USGS Landsat / Copernicus Sentinel radiometry.",
        description="Forensic standard disclaimer"
    )
