from typing import Any, Dict, Optional, Tuple


class FalsePositiveFilter:
    """
    Evaluates candidate dark spot detections against environmental conditions (e.g. ERA5 wind speed)
    and physical geometry to eliminate false positives (natural calm water, algal blooms, grease ice).
    """

    def __init__(
        self,
        min_wind_speed_ms: float = 2.0,
        max_wind_speed_ms: float = 14.0,
        min_area_km2: float = 0.05,
        min_aspect_ratio: float = 1.2
    ):
        self.min_wind_speed_ms = min_wind_speed_ms
        self.max_wind_speed_ms = max_wind_speed_ms
        self.min_area_km2 = min_area_km2
        self.min_aspect_ratio = min_aspect_ratio

    def evaluate_candidate(
        self,
        metrics: Dict[str, Any],
        wind_speed_ms: float,
        wind_direction_deg: Optional[float] = None
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
            "rejection_reasons": []
        }

        # 1. ERA5 Wind speed lower threshold (< 2.0 m/s = discard)
        if wind_speed_ms < self.min_wind_speed_ms:
            filter_details["wind_valid"] = False
            filter_details["rejection_reasons"].append(
                f"Calm water look-alike: wind speed {wind_speed_ms:.2f} m/s is below detection threshold of {self.min_wind_speed_ms:.1f} m/s (specular reflection / biogenic slick risk)"
            )

        # 2. ERA5 Wind speed upper threshold (> 14.0 m/s = discard or low confidence)
        if wind_speed_ms > self.max_wind_speed_ms:
            filter_details["wind_valid"] = False
            filter_details["rejection_reasons"].append(
                f"Severe sea state: wind speed {wind_speed_ms:.2f} m/s exceeds reliable detection threshold of {self.max_wind_speed_ms:.1f} m/s (high wave turbulence/slick dispersion)"
            )

        # 3. Minimum detectable area
        area = metrics.get("area_km2", 0.0)
        if area < self.min_area_km2:
            filter_details["size_valid"] = False
            filter_details["rejection_reasons"].append(
                f"Sub-pixel noise: area {area:.4f} km2 is smaller than minimum detectable resolution of {self.min_area_km2} km2"
            )

        # 4. Aspect ratio threshold
        aspect_ratio = metrics.get("aspect_ratio", 1.0)
        if aspect_ratio < self.min_aspect_ratio and area < 0.5:
            filter_details["aspect_valid"] = False
            filter_details["rejection_reasons"].append(
                f"Isotropic shape: aspect ratio {aspect_ratio:.2f} indicates low-likelihood circular feature"
            )

        is_valid = len(filter_details["rejection_reasons"]) == 0
        reason = "Passed all false-positive environmental filters." if is_valid else "; ".join(filter_details["rejection_reasons"])

        return is_valid, reason, filter_details
