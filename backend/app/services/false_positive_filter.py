import logging
import os
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import shapely
from shapely.geometry import Point, Polygon, MultiPolygon, shape
from shapely.prepared import prep

logger = logging.getLogger(__name__)

try:
    from global_land_mask import globe
    GLOBE_AVAILABLE = True
except ImportError:
    globe = None
    GLOBE_AVAILABLE = False
    logger.warning("global-land-mask library not available. Offline land masking disabled.")

# Configurable defaults via environment variables
DEFAULT_MAX_LAND_FRACTION = float(os.getenv("LAND_MASK_MAX_FRACTION", "0.20"))
DEFAULT_MIN_WIND_SPEED_MS = float(os.getenv("MIN_WIND_SPEED_MS", "3.0"))
DEFAULT_MAX_WIND_SPEED_MS = float(os.getenv("MAX_WIND_SPEED_MS", "14.0"))

# Fast detection for Shapely C-vectorized contains_xy
HAS_CONTAINS_XY = hasattr(shapely, "contains_xy")


class FalsePositiveFilter:
    """
    Evaluates candidate dark spot detections against environmental conditions (e.g. ERA5 wind speed),
    land-sea masks (GSHHG global coastline), dual-polarization damping, and physical geometry
    to eliminate false positives (natural calm water, inland lakes/reservoirs, radar shadows behind
    terrain, rain downbursts, dry mudflats, and isotropic calm pockets).
    """

    def __init__(
        self,
        min_wind_speed_ms: Optional[float] = None,
        max_wind_speed_ms: Optional[float] = None,
        min_area_km2: float = 0.08,
        min_aspect_ratio: float = 1.8,
        max_circularity: float = 0.60,
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
        self.max_circularity = max_circularity
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
        across a polygon's centroid, boundary, and interior with C-vectorized containment.
        """
        shapely_geom = shape(geom) if isinstance(geom, dict) else geom
        if shapely_geom.is_empty:
            return []

        points: List[Tuple[float, float]] = []

        # 1. Centroid (lat, lon)
        centroid = shapely_geom.centroid
        points.append((float(centroid.y), float(centroid.x)))

        # Handle Polygons and MultiPolygons
        polys = [shapely_geom] if isinstance(shapely_geom, Polygon) else list(shapely_geom.geoms)

        grid_n = int(np.ceil(np.sqrt(num_interior_samples)))

        for poly in polys:
            if poly.is_empty:
                continue

            # 2. Boundary perimeter samples
            ext = poly.exterior
            if ext and ext.length > 0:
                fractions = np.linspace(0.0, 1.0, num_boundary_samples, endpoint=False)
                for frac in fractions:
                    pt = ext.interpolate(frac, normalized=True)
                    points.append((float(pt.y), float(pt.x)))

            # 3. Interior samples (regular grid within bounding box clipped to polygon)
            minx, miny, maxx, maxy = poly.bounds
            if maxx > minx and maxy > miny:
                x_steps = np.linspace(minx, maxx, grid_n + 2)[1:-1]
                y_steps = np.linspace(miny, maxy, grid_n + 2)[1:-1]
                gx_grid, gy_grid = np.meshgrid(x_steps, y_steps)
                gx_flat = gx_grid.ravel()
                gy_flat = gy_grid.ravel()

                if HAS_CONTAINS_XY:
                    # High-speed vectorized C-level containment without Point object allocation
                    mask = shapely.contains_xy(poly, gx_flat, gy_flat)
                    interior_lats = gy_flat[mask]
                    interior_lons = gx_flat[mask]
                    for ilat, ilon in zip(interior_lats, interior_lons):
                        points.append((float(ilat), float(ilon)))
                else:
                    # Fallback to prepared geometry
                    prep_poly = prep(poly)
                    for gx, gy in zip(gx_flat, gy_flat):
                        if prep_poly.contains(Point(gx, gy)):
                            points.append((float(gy), float(gx)))

        return points

    def check_geometry_is_land(
        self,
        geom: Union[Polygon, MultiPolygon, Dict[str, Any]],
        max_land_fraction: Optional[float] = None
    ) -> Tuple[bool, float, int, str]:
        """
        Fast offline land-sea check using GSHHG coastline dataset with vectorized batch queries.
        Returns:
            (is_land, land_fraction, total_samples, reason)
        """
        if not self.enforce_ocean_mask or not GLOBE_AVAILABLE:
            return False, 0.0, 0, "Land-sea mask disabled or global-land-mask unavailable."

        threshold = max_land_fraction if max_land_fraction is not None else self.max_land_fraction
        sampled_points = self.sample_polygon_points(geom)
        if not sampled_points:
            return False, 0.0, 0, "No geometry points to evaluate."

        total_samples = len(sampled_points)
        pts_arr = np.asarray(sampled_points, dtype=np.float64)
        lats = pts_arr[:, 0]
        lons = pts_arr[:, 1]

        # Vectorized lookup across all sampled points in a single C call
        land_mask = np.asarray(globe.is_land(lats, lons), dtype=bool)

        centroid_lat, centroid_lon = float(lats[0]), float(lons[0])
        centroid_is_land = bool(land_mask[0])
        land_count = int(np.count_nonzero(land_mask))
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

    def check_polarization_damping(
        self,
        vv_db: float,
        vh_db: float
    ) -> Tuple[bool, str]:
        """
        Evaluates dual-polarization Sentinel-1 backscatter (VV and VH channels).
        Mineral oil suppresses capillary waves moderately in both VV and VH, exhibiting
        a cross-polarization ratio (VV/VH in dB = VV_dB - VH_dB) typically between 3.5 dB and 13.0 dB.
        Extreme polarization ratios indicate rain squalls (volumetric backscatter) or clean water noise.
        """
        pol_ratio_db = vv_db - vh_db
        if pol_ratio_db < 3.0:
            return False, f"FALSE_POSITIVE_POLARIZATION: High cross-pol scattering (VV/VH={pol_ratio_db:.1f} dB < 3.0 dB) indicative of rain downburst or atmospheric volume scattering."
        if pol_ratio_db > 14.0:
            return False, f"FALSE_POSITIVE_POLARIZATION: Extreme co-to-cross polarization ratio (VV/VH={pol_ratio_db:.1f} dB > 14.0 dB) indicative of calm sea noise floor or instrument artifact."
        return True, f"Passed dual-polarization ratio check (VV/VH={pol_ratio_db:.1f} dB)."

    def evaluate_candidate(
        self,
        metrics: Dict[str, Any],
        wind_speed_ms: float,
        wind_direction_deg: Optional[float] = None,
        candidate_geom: Optional[Union[Polygon, MultiPolygon, Dict[str, Any]]] = None,
        vv_db: Optional[float] = None,
        vh_db: Optional[float] = None
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
            "shape_valid": True,
            "land_valid": True,
            "polarization_valid": True,
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

        # 2. ERA5 Wind speed lower threshold (< 3.0 m/s = discard specular calm water look-alikes)
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

        # 5. Aspect ratio threshold (Elongation test)
        aspect_ratio = metrics.get("aspect_ratio", 1.0)
        if aspect_ratio < self.min_aspect_ratio and area < 1.0:
            filter_details["aspect_valid"] = False
            filter_details["rejection_codes"].append("FALSE_POSITIVE_ISOTROPIC")
            filter_details["rejection_reasons"].append(
                f"Isotropic shape: aspect ratio {aspect_ratio:.2f} (expected >= {self.min_aspect_ratio:.1f}) indicates low-likelihood circular calm-water pocket"
            )

        # 6. Circularity / Isoperimetric Quotient test (Q = 4 * pi * Area / Perimeter^2)
        perimeter = metrics.get("perimeter_km", 0.0)
        if perimeter > 0.0 and area > 0.0:
            circularity = (4.0 * np.pi * area) / (perimeter ** 2)
            filter_details["circularity"] = circularity
            if circularity > self.max_circularity and area < 1.0:
                filter_details["shape_valid"] = False
                if "FALSE_POSITIVE_ISOTROPIC" not in filter_details["rejection_codes"]:
                    filter_details["rejection_codes"].append("FALSE_POSITIVE_ISOTROPIC")
                    filter_details["rejection_reasons"].append(
                        f"High circularity ({circularity:.2f} > {self.max_circularity:.2f}): feature resembles circular natural calm-water pool rather than elongated marine slick"
                    )

        # 7. Dual-Polarization Ratio Check (if VV/VH provided)
        if vv_db is not None and vh_db is not None:
            pol_valid, pol_reason = self.check_polarization_damping(vv_db, vh_db)
            if not pol_valid:
                filter_details["polarization_valid"] = False
                filter_details["rejection_codes"].append("FALSE_POSITIVE_POLARIZATION")
                filter_details["rejection_reasons"].append(pol_reason)

        is_valid = len(filter_details["rejection_reasons"]) == 0
        reason = "Passed all false-positive environmental filters." if is_valid else "; ".join(filter_details["rejection_reasons"])

        return is_valid, reason, filter_details

