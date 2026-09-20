from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class AOIMonitorBase(BaseModel):
    name: str = Field(..., description="Descriptive name of the monitored Area of Interest")
    geometry_json: Optional[str] = Field(None, description="GeoJSON geometry string for the AOI boundary")
    bbox_json: Optional[str] = Field(None, description="Bounding box JSON [min_lon, min_lat, max_lon, max_lat]")
    poll_interval_hours: int = Field(default=6, ge=1, le=72, description="Polling interval in hours")
    is_active: bool = Field(default=True, description="Whether monitoring is actively enabled")

class AOIMonitorCreate(AOIMonitorBase):
    pass

class AOIMonitorUpdate(BaseModel):
    name: Optional[str] = None
    geometry_json: Optional[str] = None
    bbox_json: Optional[str] = None
    poll_interval_hours: Optional[int] = Field(None, ge=1, le=72)
    is_active: Optional[bool] = None

class AOIMonitorRecord(AOIMonitorBase):
    id: str = Field(..., description="Unique UUID of the AOI monitor")
    created_at: str = Field(..., description="ISO timestamp of creation")
    last_checked_at: Optional[str] = Field(None, description="ISO timestamp of last polling check")
    last_processed_scene_id: Optional[str] = Field(None, description="ID of the last processed Sentinel-1 scene")
    last_processed_at: Optional[str] = Field(None, description="ISO timestamp of last scene processing")
    spills_detected_count: int = Field(default=0, description="Total spills detected in this AOI")
    last_detection_summary: Optional[Dict[str, Any]] = Field(None, description="Summary info of latest detection")
