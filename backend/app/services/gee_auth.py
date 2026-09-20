import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

try:
    import ee
    EE_AVAILABLE = True
except ImportError:
    EE_AVAILABLE = False
    logger.warning("earthengine-api not installed. Running in standalone GeoEngine simulation mode.")


class GEEAuthService:
    """
    Manages Google Earth Engine authentication.
    Supports:
    1. Service Account authentication (for non-interactive background/scheduled jobs)
       via GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY_PATH (or EE_SERVICE_ACCOUNT_*).
    2. User/Interactive credentials fallback for local development.
    3. Graceful degradation to high-fidelity SAR GeoEngine simulation if unauthenticated.
    """

    def __init__(self):
        self.initialized = False
        self.auth_mode: str = "UNINITIALIZED"
        self.service_account_email: Optional[str] = None
        self.project_id: Optional[str] = None
        self.init_error: Optional[str] = None
        self.initialize()

    def initialize(self) -> bool:
        """
        Attempts to initialize Earth Engine with the highest priority authentication path available.
        """
        if not EE_AVAILABLE or os.getenv("TESTING") == "1":
            self.auth_mode = "SIMULATION" if os.getenv("TESTING") == "1" else "SIMULATION_NO_EE_LIB"
            self.initialized = False
            return False

        # Load environment configuration
        sa_email = (
            os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL")
            or os.getenv("EE_SERVICE_ACCOUNT_EMAIL")
        )
        sa_key_path = (
            os.getenv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")
            or os.getenv("EE_SERVICE_ACCOUNT_KEY_PATH")
            or os.getenv("EE_SERVICE_ACCOUNT_JSON")
        )
        project_id = (
            os.getenv("EE_PROJECT_ID")
            or os.getenv("GOOGLE_CLOUD_PROJECT")
            or os.getenv("GCP_PROJECT")
        )

        self.project_id = project_id
        self.service_account_email = sa_email

        # ─── PATH 1: Service Account Authentication ───────────────────────────
        if sa_email and sa_key_path:
            try:
                if os.path.isfile(sa_key_path):
                    logger.info(f"Authenticating GEE via Service Account key file: {sa_key_path} for {sa_email}...")
                    credentials = ee.ServiceAccountCredentials(sa_email, key_file=sa_key_path)
                elif sa_key_path.strip().startswith("{"):
                    logger.info(f"Authenticating GEE via inline Service Account JSON for {sa_email}...")
                    key_data = json.loads(sa_key_path)
                    credentials = ee.ServiceAccountCredentials(sa_email, key_data=key_data)
                else:
                    raise FileNotFoundError(f"Service account key path does not exist: {sa_key_path}")

                if project_id:
                    ee.Initialize(credentials, project=project_id)
                else:
                    ee.Initialize(credentials)

                self.initialized = True
                self.auth_mode = "SERVICE_ACCOUNT"
                self.init_error = None
                logger.info(f"✓ GEE Service Account Auth SUCCEEDED for {sa_email} (Project: {project_id or 'default'}).")
                return True
            except Exception as e:
                self.init_error = str(e)
                logger.error(f"✗ GEE Service Account Auth FAILED: {e}. Attempting user auth fallback...", exc_info=True)

        # ─── PATH 2: Standard User / Interactive Auth Fallback ─────────────────
        try:
            if project_id:
                ee.Initialize(project=project_id)
            else:
                ee.Initialize()

            self.initialized = True
            self.auth_mode = "USER_CREDENTIALS"
            self.init_error = None
            logger.info(f"✓ GEE User Credentials Auth SUCCEEDED (Project: {project_id or 'default'}).")
            return True
        except Exception as e:
            self.initialized = False
            self.auth_mode = "SIMULATION"
            self.init_error = str(e)
            logger.warning(
                f"GEE authentication not available ({e}). Live pipelines will utilize High-Fidelity SAR GeoEngine simulation."
            )
            return False

    def get_status(self) -> Dict[str, Any]:
        """
        Returns structured health & auth metadata.
        """
        return {
            "initialized": self.initialized,
            "auth_mode": self.auth_mode,
            "project_id": self.project_id,
            "service_account_email": self.service_account_email,
            "error": self.init_error,
            "ee_library_available": EE_AVAILABLE,
        }


# Singleton instance
gee_auth_service = GEEAuthService()
