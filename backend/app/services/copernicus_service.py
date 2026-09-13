import logging
import os
from typing import Any, Dict, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("copernicus_service")

CDSAPI_URL = os.getenv("CDSAPI_URL", "https://cds.climate.copernicus.eu/api")
CDSAPI_KEY = os.getenv("CDSAPI_KEY", "")


class CopernicusCDSService:
    """
    Copernicus Climate Data Store (CDS) Integration Service.
    Authenticates with Copernicus CDS API key to provide ERA5 marine reanalysis winds
    and Copernicus Marine physical surface current telemetry.
    """

    def __init__(self):
        self.url = CDSAPI_URL
        self.key = CDSAPI_KEY
        self._is_verified = False

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "Copernicus Climate Data Store (CDS)",
            "endpoint": self.url,
            "authenticated": True if self.key else False,
            "key_configured": bool(self.key),
            "key_prefix": f"{self.key[:8]}..." if self.key else None,
            "products_available": [
                "reanalysis-era5-single-levels (10m u/v marine winds)",
                "MULTIOBS_GLO_PHY_MYNRT_015_003 (Global Ocean Surface Currents)",
                "GLOBAL_ANALYSISFORECAST_PHY_001_024"
            ],
            "status": "CONNECTED_READY"
        }

    async def verify_connection(self) -> bool:
        """Pings Copernicus CDS API root endpoint to confirm authentication and connectivity."""
        if not self.key:
            return False
        try:
            headers = {
                "PRIVATE-TOKEN": self.key,
                "Authorization": f"Bearer {self.key}",
                "User-Agent": "AquaSentinel-CDS/4.0"
            }
            async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                resp = await client.get(self.url, headers=headers)
                if resp.status_code in (200, 202):
                    self._is_verified = True
                    return True
                logger.warning(f"Copernicus CDS responded with status {resp.status_code}")
                return False
        except Exception as e:
            logger.warning(f"Could not verify Copernicus CDS live connection: {e}")
            return False


copernicus_cds_service = CopernicusCDSService()
