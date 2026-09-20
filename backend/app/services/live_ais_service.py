import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional
import websockets
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("live_ais_service")

AISSTREAM_API_KEY = os.getenv("AISSTREAM_API_KEY", "")
AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"


class LiveAISService:
    """
    Real-time AISStream.io WebSocket Ingestion Service.
    Maintains an in-memory live vessel cache and streams real-time AIS telemetry
    for active AOIs (Mumbai High, Malacca Strait, Persian Gulf, Singapore, Gulf of Mexico, etc.).
    """

    def __init__(self):
        self.api_key = AISSTREAM_API_KEY
        self.is_connected = False
        self.last_message_time: Optional[float] = None
        self.total_messages_received = 0
        
        # Store live vessels: mmsi -> vessel_dict
        self._live_vessels: Dict[int, Dict[str, Any]] = {}
        self._lock = asyncio.Lock() if asyncio.get_event_loop().is_running() else None
        self._ws_task: Optional[asyncio.Task] = None
        self._persist_task: Optional[asyncio.Task] = None
        self._subscribers: List[asyncio.Queue] = []
        self._db_ping_buffer: List[Dict[str, Any]] = []

    def get_status(self) -> Dict[str, Any]:
        return {
            "provider": "AISStream.io",
            "connected": self.is_connected,
            "total_messages": self.total_messages_received,
            "tracked_live_vessels_count": len(self._live_vessels),
            "last_message_timestamp": self.last_message_time,
            "status": "LIVE_STREAMING" if self.is_connected else "IDLE_READY"
        }

    async def get_live_vessels(
        self,
        bbox: Optional[List[float]] = None,
        limit: int = 200
    ) -> List[Dict[str, Any]]:
        """
        Returns currently tracked live vessels. Optionally filtered by bounding box [min_lon, min_lat, max_lon, max_lat].
        """
        now = time.time()
        # Filter out stale vessels older than 2 hours
        active_vessels = [
            v for v in self._live_vessels.values()
            if now - v.get("timestamp_epoch", now) < 7200
        ]

        if bbox and len(bbox) == 4:
            min_lon, min_lat, max_lon, max_lat = bbox
            filtered = [
                v for v in active_vessels
                if min_lon <= v.get("lon", 0.0) <= max_lon and min_lat <= v.get("lat", 0.0) <= max_lat
            ]
            return filtered[:limit]

        return active_vessels[:limit]

    def add_subscriber(self) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(queue)
        return queue

    def remove_subscriber(self, queue: asyncio.Queue):
        if queue in self._subscribers:
            self._subscribers.remove(queue)

    async def _broadcast_to_subscribers(self, vessel_data: Dict[str, Any]):
        for q in list(self._subscribers):
            try:
                if not q.full():
                    q.put_nowait(vessel_data)
            except Exception:
                pass

    async def start(self):
        """Starts the background AISStream ingestion loop and persistence flush task."""
        if self._ws_task is None or self._ws_task.done():
            self._ws_task = asyncio.create_task(self._ingestion_loop())
        if self._persist_task is None or self._persist_task.done():
            self._persist_task = asyncio.create_task(self._periodic_persist_loop())

    async def stop(self):
        if self._ws_task and not self._ws_task.done():
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass
        if self._persist_task and not self._persist_task.done():
            self._persist_task.cancel()
            try:
                await self._persist_task
            except asyncio.CancelledError:
                pass
        self._flush_pings_to_db()

    def _flush_pings_to_db(self):
        """Synchronously flushes current buffer to SQLite."""
        if not self._db_ping_buffer:
            return
        try:
            from app.services.db_service import db_service
            pings_to_save = list(self._db_ping_buffer)
            self._db_ping_buffer.clear()
            db_service.insert_ais_pings_batch(pings_to_save)
        except Exception as e:
            logger.debug(f"AIS buffer persist error: {e}")

    async def _periodic_persist_loop(self):
        """Background loop flushing AIS positions to SQLite every 5 seconds."""
        while True:
            try:
                await asyncio.sleep(5)
                if len(self._db_ping_buffer) > 0:
                    await asyncio.to_thread(self._flush_pings_to_db)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.debug(f"Periodic AIS persist error: {e}")

    async def _ingestion_loop(self):
        """Continuous connection & reconnection loop to AISStream.io."""
        logger.info("Starting AISStream.io live connection loop...")
        
        # Bounding boxes covering major global maritime corridors
        # [ [min_lat, min_lon], [max_lat, max_lon] ]
        bounding_boxes = [
            [[10.0, 65.0], [25.0, 78.0]],    # Arabian Sea & Mumbai High
            [[0.0, 95.0], [15.0, 108.0]],    # Malacca & Singapore Strait
            [[20.0, 48.0], [32.0, 60.0]],    # Persian Gulf & Hormuz
            [[22.0, -98.0], [32.0, -80.0]],  # Gulf of Mexico
            [[-10.0, 35.0], [35.0, 125.0]]   # Indian Ocean & Indo-Pacific
        ]

        sub_message = {
            "APIKey": self.api_key,
            "BoundingBoxes": bounding_boxes,
            "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"]
        }

        while True:
            try:
                logger.info(f"Connecting to AISStream WebSocket at {AISSTREAM_URL}...")
                async with websockets.connect(
                    AISSTREAM_URL,
                    ping_interval=20,
                    close_timeout=10,
                    max_size=10_000_000
                ) as ws:
                    await ws.send(json.dumps(sub_message))
                    self.is_connected = True
                    logger.info("AISStream connected & subscribed to live maritime corridors!")

                    while True:
                        raw = await ws.recv()
                        self.last_message_time = time.time()
                        self.total_messages_received += 1

                        try:
                            msg = json.loads(raw)
                            msg_type = msg.get("MessageType")
                            meta = msg.get("MetaData", {})
                            mmsi = meta.get("MMSI")

                            if not mmsi:
                                continue

                            lat = meta.get("latitude")
                            lon = meta.get("longitude")
                            ship_name = (meta.get("ShipName") or "").strip()
                            timestamp_str = meta.get("time_utc")

                            pos_msg = msg.get("Message", {}).get("PositionReport", {}) or msg.get("Message", {}).get("StandardClassBPositionReport", {})
                            sog = pos_msg.get("Sog", 0.0)
                            cog = pos_msg.get("Cog", 0.0)
                            heading = pos_msg.get("TrueHeading", cog)
                            nav_status = pos_msg.get("NavigationalStatus", 0)

                            if lat is not None and lon is not None:
                                vessel_entry = self._live_vessels.get(mmsi, {
                                    "mmsi": mmsi,
                                    "name": ship_name or f"Vessel-{mmsi}",
                                    "ship_type": "Tanker / Cargo",
                                    "track": []
                                })

                                if ship_name:
                                    vessel_entry["name"] = ship_name

                                ts_iso = timestamp_str or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

                                vessel_entry.update({
                                    "mmsi": mmsi,
                                    "lat": round(float(lat), 5),
                                    "lon": round(float(lon), 5),
                                    "sog": round(float(sog), 1),
                                    "cog": round(float(cog), 1),
                                    "heading": round(float(heading), 1),
                                    "nav_status": nav_status,
                                    "timestamp": ts_iso,
                                    "timestamp_epoch": self.last_message_time,
                                    "source": "AISSTREAM_LIVE"
                                })

                                # Keep last 15 track points for live breadcrumb trail
                                current_point = [round(float(lon), 5), round(float(lat), 5)]
                                if "track" not in vessel_entry or not isinstance(vessel_entry["track"], list):
                                    vessel_entry["track"] = []
                                
                                if not vessel_entry["track"] or vessel_entry["track"][-1] != current_point:
                                    vessel_entry["track"].append(current_point)
                                    if len(vessel_entry["track"]) > 15:
                                        vessel_entry["track"].pop(0)

                                self._live_vessels[mmsi] = vessel_entry
                                await self._broadcast_to_subscribers(vessel_entry)

                                # Buffer for SQLite historical persistence
                                self._db_ping_buffer.append({
                                    "mmsi": str(mmsi),
                                    "vessel_name": vessel_entry.get("name"),
                                    "ship_type": vessel_entry.get("ship_type", "Vessel"),
                                    "flag": "International",
                                    "imo": None,
                                    "length_m": 150.0,
                                    "deadweight_tonnage": None,
                                    "lon": round(float(lon), 5),
                                    "lat": round(float(lat), 5),
                                    "sog": round(float(sog), 1),
                                    "cog": round(float(cog), 1),
                                    "heading": round(float(heading), 1),
                                    "timestamp": ts_iso,
                                    "source": "LIVE_STREAM"
                                })

                        except json.JSONDecodeError:
                            continue
                        except Exception as inner_e:
                            logger.debug(f"Error parsing live AIS message: {inner_e}")

            except asyncio.CancelledError:
                self.is_connected = False
                logger.info("AISStream worker cancelled.")
                break
            except Exception as e:
                self.is_connected = False
                logger.warning(f"AISStream connection interrupted: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)


live_ais_service = LiveAISService()
