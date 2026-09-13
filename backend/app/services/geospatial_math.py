import math
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pyproj
from shapely.geometry import Polygon, MultiPolygon, mapping, shape
from shapely.ops import transform


def get_utm_epsg(lon: float, lat: float) -> int:
    """
    Calculate the EPSG code for the local UTM projection based on WGS84 longitude and latitude.
    """
    zone = int((lon + 180) / 6) + 1
    if lat >= 0:
        return 32600 + zone
    else:
        return 32700 + zone


def get_utm_transformers(lon: float, lat: float):
    """
    Returns (to_utm_transformer, to_wgs84_transformer, epsg_code).
    """
    epsg = get_utm_epsg(lon, lat)
    to_utm = pyproj.Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform
    to_wgs84 = pyproj.Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True).transform
    return to_utm, to_wgs84, epsg


def calculate_spill_geospatial_metrics(
    wgs84_geom: Union[Polygon, MultiPolygon, Dict[str, Any]],
    wind_speed_ms: float = 6.0,
    radar_contrast: float = 0.85
) -> Dict[str, Any]:
    """
    Computes rigorous geospatial metrics for an oil spill polygon by reprojecting to local UTM.
    
    Returns:
    - area_km2
    - perimeter_km
    - centroid [lon, lat]
    - length_km
    - width_km
    - bbox [minLon, minLat, maxLon, maxLat]
    - orientation_deg (0-180 relative to True North)
    - confidence (0.0 - 1.0)
    - estimated_age_hours [min_h, max_h]
    - mrr_geometry (Minimum Rotated Rectangle in GeoJSON)
    - utm_epsg
    """
    if isinstance(wgs84_geom, dict):
        shapely_wgs = shape(wgs84_geom)
    else:
        shapely_wgs = wgs84_geom

    # Centroid in WGS84
    centroid_wgs = shapely_wgs.centroid
    c_lon, c_lat = float(centroid_wgs.x), float(centroid_wgs.y)
    
    # Bounding Box in WGS84 [minX, minY, maxX, maxY]
    bounds = shapely_wgs.bounds
    bbox = [round(b, 6) for b in [bounds[0], bounds[1], bounds[2], bounds[3]]]

    # Reproject to Local UTM for Cartesian math
    to_utm, to_wgs84, epsg = get_utm_transformers(c_lon, c_lat)
    shapely_utm = transform(to_utm, shapely_wgs)

    # 1. Exact Area in km2 and Perimeter in km
    area_m2 = shapely_utm.area
    perimeter_m = shapely_utm.length
    
    area_km2 = round(area_m2 / 1_000_000.0, 4)
    perimeter_km = round(perimeter_m / 1_000.0, 3)

    # 2. Minimum Rotated Bounding Box (MRR)
    mrr_utm = shapely_utm.minimum_rotated_rectangle
    mrr_coords = list(mrr_utm.exterior.coords) if hasattr(mrr_utm, "exterior") else []
    
    # Calculate side lengths of the MRR (p0 to p1, and p1 to p2)
    if len(mrr_coords) >= 4:
        p0 = np.array(mrr_coords[0])
        p1 = np.array(mrr_coords[1])
        p2 = np.array(mrr_coords[2])
        
        d1 = float(np.linalg.norm(p1 - p0))
        d2 = float(np.linalg.norm(p2 - p1))
        
        # Major and Minor axes
        if d1 >= d2:
            length_m, width_m = d1, d2
            # Vector along major axis
            vec = p1 - p0
        else:
            length_m, width_m = d2, d1
            # Vector along major axis
            vec = p2 - p1
            
        length_km = round(length_m / 1_000.0, 3)
        width_km = round(max(width_m, 10.0) / 1_000.0, 3) # ensure non-zero width
        
        # 3. Orientation Calculation (0° - 180° clockwise from True North)
        # In Cartesian UTM: dx = East, dy = North
        # Angle from North = arctan2(dx, dy) in degrees
        angle_rad = math.atan2(vec[0], vec[1])
        angle_deg = (math.degrees(angle_rad)) % 180.0
        orientation_deg = round(angle_deg, 1)
    else:
        # Fallback if MRR is degenerate
        length_km = round(math.sqrt(max(area_km2, 0.01)), 3)
        width_km = round(max(area_km2 / max(length_km, 0.001), 0.01), 3)
        orientation_deg = 0.0

    # Reproject MRR back to WGS84 for visual inspection overlay
    mrr_wgs = transform(to_wgs84, mrr_utm) if hasattr(mrr_utm, "exterior") else shapely_wgs
    mrr_geometry = mapping(mrr_wgs)

    # 4. Aspect Ratio
    aspect_ratio = round(length_km / max(width_km, 0.001), 2)

    # 5. Scientific Confidence Score Calculation
    # Factors:
    # - Aspect Ratio: linear/curvilinear streaks (2.5 - 15.0) are typical of ship discharge & wind drift
    # - Area Size: realistic spill size (0.1 km2 to 50 km2)
    # - Wind Speed: 3 - 10 m/s is optimal for SAR detection without false calm look-alikes
    # - Radar Contrast: high contrast ratio against surrounding sea clutter
    conf_factors = []
    
    # Aspect ratio score
    if 2.5 <= aspect_ratio <= 20.0:
        conf_factors.append(0.95)
    elif 1.5 <= aspect_ratio < 2.5:
        conf_factors.append(0.80)
    elif aspect_ratio > 20.0:
        conf_factors.append(0.85)
    else:
        conf_factors.append(0.65)

    # Wind speed suitability score
    if 3.0 <= wind_speed_ms <= 10.0:
        conf_factors.append(0.95)
    elif 2.0 <= wind_speed_ms < 3.0:
        conf_factors.append(0.70)
    elif 10.0 < wind_speed_ms <= 13.0:
        conf_factors.append(0.75)
    else:
        conf_factors.append(0.50)

    # Radar contrast score
    conf_factors.append(min(max(radar_contrast, 0.5), 0.99))
    
    # Combined confidence
    confidence = round(float(np.mean(conf_factors)), 2)

    # 6. Estimated Age Range (hours)
    # Heuristic based on slick length, width expansion, and wind advection rate:
    # In initial hours (0-6h), slicks are narrow and continuous. Over 6-24h, width increases and fragmentation occurs.
    base_min_age = max(1.0, (length_km / max(wind_speed_ms * 0.03 * 3.6, 0.5)) * 0.4)
    base_max_age = base_min_age * 2.8 + (width_km * 3.0)
    estimated_age_hours = [round(base_min_age, 1), round(base_max_age, 1)]

    return {
        "area_km2": max(area_km2, 0.001),
        "perimeter_km": max(perimeter_km, 0.01),
        "centroid": [round(c_lon, 6), round(c_lat, 6)],
        "length_km": length_km,
        "width_km": width_km,
        "bbox": bbox,
        "orientation_deg": orientation_deg,
        "confidence": confidence,
        "estimated_age_hours": estimated_age_hours,
        "aspect_ratio": aspect_ratio,
        "utm_epsg": epsg,
        "mrr_geometry": mrr_geometry,
        "geometry": mapping(shapely_wgs)
    }
