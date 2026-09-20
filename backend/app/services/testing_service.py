import json
import logging
import os
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "fixtures")


class ValidationDatasetMetadata(BaseModel):
    fixture_id: str
    title: str
    region: str
    incident_date: str
    description: str
    tags: List[str] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)


class TestingService:
    """
    Dedicated Testing & Historical Validation Service.
    Loads and serves standalone historical validation datasets and fixtures
    strictly separated from live operational tables and caches.
    """

    def __init__(self, fixtures_dir: str = FIXTURES_DIR):
        self.fixtures_dir = os.path.abspath(fixtures_dir)

    def list_validation_datasets(self) -> List[ValidationDatasetMetadata]:
        """
        Returns a list of all available validation datasets with metadata.
        """
        datasets = []
        if not os.path.exists(self.fixtures_dir):
            return datasets

        for filename in os.listdir(self.fixtures_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(self.fixtures_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        datasets.append(
                            ValidationDatasetMetadata(
                                fixture_id=data.get("fixture_id", filename.replace(".json", "")),
                                title=data.get("title", filename),
                                region=data.get("region", "Global Maritime"),
                                incident_date=data.get("incident_date", ""),
                                description=data.get("description", ""),
                                tags=data.get("tags", []),
                                stats=data.get("stats", {})
                            )
                        )
                except Exception as e:
                    logger.warning(f"Error reading validation fixture {filename}: {e}")

        # Sort by title
        datasets.sort(key=lambda d: d.title)
        return datasets

    def get_fixture_bundle(self, fixture_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a complete assembled fixture bundle for a given fixture_id.
        """
        if not os.path.exists(self.fixtures_dir):
            return None

        # Sanitize fixture_id to prevent directory traversal
        clean_id = os.path.basename(fixture_id).replace(".json", "")
        filepath = os.path.join(self.fixtures_dir, f"{clean_id}.json")

        if not os.path.exists(filepath):
            return None

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load fixture bundle {fixture_id}: {e}")
            return None


testing_service = TestingService()
