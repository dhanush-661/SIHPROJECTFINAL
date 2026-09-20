import logging
import os
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
from shapely.geometry import Point, Polygon, MultiPolygon, shape

logger = logging.getLogger(__name__)

try:
    from global_land_mask import globe
    GLOBE_AVAILABLE = True
except ImportError:
    globe = None
    GLOBE_AVAILABLE = False
    logger.warning("global-land-mask library not available. Offline land masking disabled.")

# Configurable defaults via environment variables
DEFAULT_MAX_LAND_FRACTION = float(os.getenv("LAND_MASK_MAX_FRACTION", "0.30"))
DEFAULT_MIN_WIND_SPEED_MS = float(os.getenv("MIN_WIND_SPEED_MS", "2.0"))
DEFAULT_MAX_WIND_SPEED_MS = float(os.getenv("MAX_WIND_SPEED_MS", "14.0"))


class FalsePositiveFilter:
    """
    Evaluates candidate dark spot detections against environmental conditions (e.g. ERA5 wind speed),
    land-sea masks (GSHHG global coastline), and physical geometry to eliminate false positives
    (natural calm water, inland lakes/reservoirs, radar shadows behind terrain, dry mudflats, etc.).
    """

    def __init__(
        self,
        min_wind_speed_ms: Optional[float] = None,
        max_wind_speed_ms: Optional[float] = None,
        min_area_km2: float = 0.05,
        min_aspect_ratio: float = 1.2,
        max_land_fraction: Optional[float] = None,
        enforce_ocean_mask: bool = True
    ):
        self.min_wind_speed_ms = (
            min_wind_speed_ms if min_wind_speed_ms is not None else DEFAULT_MIN_WIND_SPEED_MS
        )
        self.max_wind_speed_ms = (
            max_wind_speed_ms if max_wind_speed_ms is not None else DEFAULT_MAX_WIND_SPEED_MS
        )
        self.min_area_km2 = min_area_km2
        self.min_aspect_ratio = min_aspect_ratio
        self.max_land_fraction = (
            max_land_fraction if max_land_fraction is not None else DEFAULT_MAX_LAND_FRACTION
        )
        self.enforce_ocean_mask = enforce_ocean_mask

    def sample_polygon_points(
        self,
        geom: Union[Polygon, MultiPolygon, Dict[str, Any]],
        num_boundary_samples: int = 16,
        num_interior_samples: int = 9
    ) -> List[Tuple[float, float]]:
        """
        Samples a representative set of (latitude, longitude) coordinate points
        across a polygon's centroid, boundary, and interior.
        """
        shapely_geom = shape(geom) if isinstance(geom, dict) else geom
        if shapely_geom.is_empty:
            return []

        points: List[Tuple[float, float]] = []

        # 1. Centroid (lat, lon)
        centroid = shapely_geom.centroid
        points.append((centroid.y, centroid.x))

        # Handle Polygons and MultiPolygons
        polys = [shapely_geom] if isinstance(shapely_geom, Polygon) else list(shapely_geom.geoms)

        for poly in polys:
            if poly.is_empty:
                continue

            # 2. Boundary perimeter samples
            ext = poly.exterior
            if ext and ext.length > 0:
                for frac in np.linspace(0.0, 1.0, num_boundary_samples, endpoint=False):
                    pt = ext.interpolate(frac, normalized=True)
                    points.append((pt.y, pt.x))

            # 3. Interior samples (regular grid within bounding box clipped to polygon)
            minx, miny, maxx, maxy = poly.bounds
            grid_n = int(np.ceil(np.sqrt(num_interior_samples)))
            if maxx > minx and maxy > miny:
                x_steps = np.linspace(minx, maxx, grid_n + 2)[1:-1]
                y_steps = np.linspace(miny, maxy, grid_n + 2)[1:-1]
                for gx in x_steps:
                    for gy in y_steps:
                        pt_obj = Point(gx, gy)
                        if poly.contains(pt_obj):
                            points.append((gy, gx))

        return points

    def check_geometry_is_land(
        self,
        geom: Union[Polygon, MultiPolygon, Dict[str, Any]],
        max_land_fraction: Optional[float] = None
    ) -> Tuple[bool, float, int, str]:
        """
        Fast offline land-sea check using GSHHG coastline dataset.
        Returns:
            (is_land, land_fraction, total_samples, reason)
        """
        if not self.enforce_ocean_mask or not GLOBE_AVAILABLE:
            return False, 0.0, 0, "Land-sea mask disabled or global-land-mask unavailable."

        threshold = max_land_fraction if max_land_fraction is not None else self.max_land_fraction
        sampled_points = self.sample_polygon_points(geom)
        if not sampled_points:
            return False, 0.0, 0, "No geometry points to evaluate."

        centroid_lat, centroid_lon = sampled_points[0]
        centroid_is_land = bool(globe.is_land(centroid_lat, centroid_lon))

        land_count = 0
        for lat, lon in sampled_points:
            if globe.is_land(lat, lon):
                land_count += 1

        total_samples = len(sampled_points)
        land_fraction = land_count / total_samples if total_samples > 0 else 0.0

        is_land_rejected = centroid_is_land or (land_fraction > threshold)
        
        if is_land_rejected:
            reason = (
                f"FALSE_POSITIVE_LAND: Centroid ({centroid_lat:.4f}°N, {centroid_lon:.4f}°E) "
                f"is on land={centroid_is_land}, land fraction {land_fraction*100:.1f}% "
                f"exceeds allowed limit of {threshold*100:.1f}% (GSHHG coastline mask)"
            )
        else:
            reason = f"Passed land-sea mask ({land_fraction*100:.1f}% land, within {threshold*100:.1f}% threshold)."

        return is_land_rejected, land_fraction, total_samples, reason

    def evaluate_candidate(
        self,
        metrics: Dict[str, Any],
        wind_speed_ms: float,
        wind_direction_deg: Optional[float] = None,
        candidate_geom: Optional[Union[Polygon, MultiPolygon, Dict[str, Any]]] = None
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Evaluates a candidate dark spot against false positive rules.
        
        Returns:
            (is_valid, reason, filter_details)
        """
        filter_details = {
            "wind_speed_ms": wind_speed_ms,
            "wind_direction_deg": wind_direction_deg,
            "wind_valid": True,
            "size_valid": True,
            "aspect_valid": True,
            "land_valid": True,
            "rejection_codes": [],
            "rejection_reasons": []
        }

        # 1. Land-Sea Coastline Mask (GSHHG global coastline dataset) - Primary Gate
        geom_to_check = candidate_geom or metrics.get("geometry")
        if self.enforce_ocean_mask and GLOBE_AVAILABLE:
            if geom_to_check:
                is_land_rejected, land_frac, n_samples, land_reason = self.check_geometry_is_land(geom_to_check)
                if is_land_rejected:
                    filter_details["land_valid"] = False
                    filter_details["rejection_codes"].append("FALSE_POSITIVE_LAND")
                    filter_details["rejection_reasons"].append(land_reason)
                    logger.info(f"Rejected candidate via land-sea mask: {land_reason}")
            else:
                centroid = metrics.get("centroid")
                if centroid and len(centroid) >= 2:
                    c_lon, c_lat = float(centroid[0]), float(centroid[1])
                    if globe.is_land(c_lat, c_lon):
                        filter_details["land_valid"] = False
                        filter_details["rejection_codes"].append("FALSE_POSITIVE_LAND")
                        filter_details["rejection_reasons"].append(
                            f"FALSE_POSITIVE_LAND: Centroid ({c_lat:.4f}°N, {c_lon:.4f}°E) lies on landmass or inland water body (GSHHG coastline mask)"
                        )

        # 2. ERA5 Wind speed lower threshold (< 2.0 m/s = discard)
        if wind_speed_ms < self.min_wind_speed_ms:
            filter_details["wind_valid"] = False
            filter_details["rejection_codes"].append("FALSE_POSITIVE_LOW_WIND")
            filter_details["rejection_reasons"].append(
                f"Calm water look-alike: wind speed {wind_speed_ms:.2f} m/s is below detection threshold of {self.min_wind_speed_ms:.1f} m/s (specular reflection / biogenic slick risk)"
            )

        # 3. ERA5 Wind speed upper threshold (> 14.0 m/s = discard or low confidence)
        if wind_speed_ms > self.max_wind_speed_ms:
            filter_details["wind_valid"] = False
            filter_details["rejection_codes"].append("FALSE_POSITIVE_HIGH_WIND")
            filter_details["rejection_reasons"].append(
                f"Severe sea state: wind speed {wind_speed_ms:.2f} m/s exceeds reliable detection threshold of {self.max_wind_speed_ms:.1f} m/s (high wave turbulence/slick dispersion)"
            )

        # 4. Minimum detectable area
        area = metrics.get("area_km2", 0.0)
        if area < self.min_area_km2:
            filter_details["size_valid"] = False
            filter_details["rejection_codes"].append("FALSE_POSITIVE_SUBPIXEL")
            filter_details["rejection_reasons"].append(
                f"Sub-pixel noise: area {area:.4f} km2 is smaller than minimum detectable resolution of {self.min_area_km2} km2"
            )

        # 5. Aspect ratio threshold
        aspect_ratio = metrics.get("aspect_ratio", 1.0)
        if aspect_ratio < self.min_aspect_ratio and area < 0.5:
            filter_details["aspect_valid"] = False
            filter_details["rejection_codes"].append("FALSE_POSITIVE_ISOTROPIC")
            filter_details["rejection_reasons"].append(
                f"Isotropic shape: aspect ratio {aspect_ratio:.2f} indicates low-likelihood circular feature"
            )

        is_valid = len(filter_details["rejection_reasons"]) == 0
        reason = "Passed all false-positive environmental filters." if is_valid else "; ".join(filter_details["rejection_reasons"])

        return is_valid, reason, filter_details
