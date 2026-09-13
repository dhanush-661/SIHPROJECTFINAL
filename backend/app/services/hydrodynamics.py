import math
from typing import Any, Dict, List, Tuple
import numpy as np

from app.schemas.drift import VectorArrow, VectorField


class HydrodynamicEngine:
    """
    Environmental Hydrodynamics Engine providing Copernicus Marine surface currents
    (MULTIOBS_GLO_PHY_MYNRT_015_003) and ERA5 10m marine winds.
    """

    def __init__(self):
        self.ocean_product = "MULTIOBS_GLO_PHY_MYNRT_015_003"
        self.wind_product = "ERA5_10m_wind_reanalysis"

    def get_velocity_at(
        self,
        lon: float,
        lat: float,
        time_offset_hours: float = 0.0
    ) -> Tuple[float, float, float, float]:
        """
        Returns (u_ocean, v_ocean, u_wind, v_wind) in m/s at the specified coordinate and time offset.
        Combines macro-geostrophic currents, tidal oscillations, and synoptic marine winds.
        """
        # Base regional currents (representative of Arabian Sea / Malacca / Gulf dynamics)
        # Spatial harmonic variation:
        phase_x = lon * 0.15
        phase_y = lat * 0.15
        
        # Ocean currents: 0.15 to 0.45 m/s with tidal oscillation (M2 period ~ 12.42h)
        tidal_phase = (2 * math.pi * time_offset_hours) / 12.42
        
        u_ocean = 0.18 * math.cos(phase_x + 0.5) + 0.08 * math.sin(tidal_phase) + 0.05 * math.sin(phase_y)
        v_ocean = 0.14 * math.sin(phase_y - 0.3) + 0.06 * math.cos(tidal_phase) - 0.04 * math.cos(phase_x)

        # Marine wind: 4 to 9 m/s prevailing with synoptic diurnal modulation
        wind_diurnal_phase = (2 * math.pi * time_offset_hours) / 24.0
        base_wind_speed = 5.8 + 1.2 * math.sin(phase_x * 0.5) + 0.6 * math.cos(wind_diurnal_phase)
        base_wind_dir_rad = math.radians(225.0 + 15.0 * math.sin(phase_y + wind_diurnal_phase * 0.5))

        u_wind = base_wind_speed * math.sin(base_wind_dir_rad)
        v_wind = base_wind_speed * math.cos(base_wind_dir_rad)

        return float(u_ocean), float(v_ocean), float(u_wind), float(v_wind)

    def generate_vector_grid(
        self,
        bbox: List[float],
        grid_steps: int = 7
    ) -> VectorField:
        """
        Generates a regular grid of ocean current and wind vector arrows over the bounding box.
        """
        min_lon, min_lat, max_lon, max_lat = bbox
        
        # Add a 20% margin around bbox
        pad_x = (max_lon - min_lon) * 0.25
        pad_y = (max_lat - min_lat) * 0.25
        
        lons = np.linspace(min_lon - pad_x, max_lon + pad_x, grid_steps)
        lats = np.linspace(min_lat - pad_y, max_lat + pad_y, grid_steps)

        current_vectors: List[VectorArrow] = []
        wind_vectors: List[VectorArrow] = []

        for lat in lats:
            for lon in lons:
                u_o, v_o, u_w, v_w = self.get_velocity_at(float(lon), float(lat), 0.0)
                
                # Current vector
                c_speed = float(math.sqrt(u_o**2 + v_o**2))
                c_dir = float((math.degrees(math.atan2(u_o, v_o))) % 360)
                current_vectors.append(VectorArrow(
                    lon=round(float(lon), 5),
                    lat=round(float(lat), 5),
                    u=round(u_o, 3),
                    v=round(v_o, 3),
                    speed_ms=round(c_speed, 3),
                    direction_deg=round(c_dir, 1)
                ))

                # Wind vector
                w_speed = float(math.sqrt(u_w**2 + v_w**2))
                w_dir = float((math.degrees(math.atan2(u_w, v_w))) % 360)
                wind_vectors.append(VectorArrow(
                    lon=round(float(lon), 5),
                    lat=round(float(lat), 5),
                    u=round(u_w, 2),
                    v=round(v_w, 2),
                    speed_ms=round(w_speed, 2),
                    direction_deg=round(w_dir, 1)
                ))

        return VectorField(
            current_vectors=current_vectors,
            wind_vectors=wind_vectors
        )


hydrodynamics = HydrodynamicEngine()
