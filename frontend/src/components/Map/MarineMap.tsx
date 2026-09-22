import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Rectangle,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
  LayersControl,
  ZoomControl
} from 'react-leaflet';
import L from 'leaflet';
import type { DriftSimulationResponse, VectorArrow } from '../../types/drift';
import type { PresetAOI, SpillRecord } from '../../types/spill';
import type { CandidateVessel, VesselPoint } from '../../types/vessel';
import type { LiveAISVessel } from '../../services/api';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || '';

// Custom Centroid Pulsing Marker Icon
const createPulseIcon = (confidence: number) => {
  const color = confidence >= 0.85 ? '#ff2d55' : '#ff9500';
  return L.divIcon({
    className: 'custom-spill-marker',
    html: `
      <div style="
        position: relative;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${color};
          opacity: 0.3;
          animation: pulse-glow 2s infinite ease-in-out;
        "></div>
        <div style="
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid #ffffff;
          box-shadow: 0 0 8px ${color};
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Origin Crosshair Icon
const createOriginIcon = () => {
  return L.divIcon({
    className: 'custom-origin-marker',
    html: `
      <div style="
        width: 26px;
        height: 26px;
        border: 2px solid #ffaa00;
        border-radius: 50%;
        background: rgba(255, 170, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 12px #ffaa00;
      ">
        <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

// Forecast Future Centroid Icon
const createForecastIcon = () => {
  return L.divIcon({
    className: 'custom-forecast-marker',
    html: `
      <div style="
        width: 26px;
        height: 26px;
        border: 2px solid #00f0ff;
        border-radius: 50%;
        background: rgba(0, 240, 255, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 12px #00f0ff;
      ">
        <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

// Vessel Vessel Icon color-coded by suspect score
const createVesselIcon = (vessel: CandidateVessel, isSelected: boolean = false) => {
  const color = vessel.suspect_score >= 0.75 ? '#f43f5e' : vessel.suspect_score >= 0.5 ? '#ffaa00' : '#00e676';
  const size = isSelected ? 28 : 22;
  return L.divIcon({
    className: 'vessel-marker-icon',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 4px;
        background: ${color};
        border: 2px solid #ffffff;
        box-shadow: 0 0 ${isSelected ? '14px' : '8px'} ${color};
        display: flex;
        align-items: center;
        justify-content: center;
        color: #000000;
        font-weight: 800;
        font-size: ${isSelected ? '11px' : '9px'};
      ">
        ▲
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Directional Vector Arrow Icon
const createVectorIcon = (arrow: VectorArrow, type: 'current' | 'wind') => {
  const isCurrent = type === 'current';
  const color = isCurrent ? '#00d2ff' : '#ffaa00';
  const len = Math.min(Math.max(isCurrent ? arrow.speed_ms * 40 : arrow.speed_ms * 3, 12), 28);

  return L.divIcon({
    className: 'vector-arrow-icon',
    html: `
      <div style="
        transform: rotate(${arrow.direction_deg}deg);
        transform-origin: center center;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
      ">
        <svg width="32" height="32" viewBox="0 0 32 32" style="overflow: visible;">
          <defs>
            <marker id="arrow-${type}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />
            </marker>
          </defs>
          <line x1="16" y1="28" x2="16" y2="${32 - len}" stroke="${color}" stroke-width="1.8" marker-end="url(#arrow-${type})" stroke-opacity="0.85" />
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Real-Time Live AIS Ship Icon with Heading Direction and Radar Pulse
const createLiveAISIcon = (vessel: LiveAISVessel) => {
  const rot = vessel.cog || vessel.heading || 0;
  return L.divIcon({
    className: 'live-ais-ship-icon',
    html: `
      <div style="
        position: relative;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          position: absolute;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0, 240, 255, 0.25);
          animation: pulse-glow 1.6s infinite ease-in-out;
        "></div>
        <div style="
          transform: rotate(${rot}deg);
          transform-origin: center center;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 0 6px #00f0ff);">
            <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#00f0ff" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

interface MapControllerProps {
  center: [number, number];
  zoom: number;
  targetKey?: string;
}

const MapController: React.FC<MapControllerProps> = ({ center, zoom, targetKey }) => {
  const map = useMap();
  const prevKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    const key = targetKey || `${center[0].toFixed(5)},${center[1].toFixed(5)},${zoom}`;
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
      map.flyTo(center, zoom, { duration: 0.8 });
    }
  }, [targetKey, center[0], center[1], zoom, map]);

  return null;
};

interface MarineMapProps {
  preset: PresetAOI | null;
  spills: SpillRecord[];
  selectedSpill: SpillRecord | null;
  onSelectSpill: (spill: SpillRecord) => void;
  
  // Drift Layer Props
  driftResult?: DriftSimulationResponse | null;
  showSatelliteFootprint?: boolean;
  showDetectedSlick?: boolean;
  showBackwardContours?: boolean;
  showForwardContours?: boolean;
  showParticleTracks?: boolean;
  showCurrentVectors?: boolean;
  showWindVectors?: boolean;

  // Phase 3 Vessel Correlation Props
  candidateVessels?: CandidateVessel[];
  selectedVessel?: CandidateVessel | null;
  onSelectVessel?: (vessel: CandidateVessel) => void;
  showVesselTracks?: boolean;

  // Live Real-Time AIS Stream Props
  liveAISVessels?: LiveAISVessel[];
  showLiveAIS?: boolean;

  // Incident Investigation Window
  investigationRadiusKm?: number;

  // Phase 4 Timeline Scrubber State
  timelineOffsetHours?: number;
}

export const MarineMap: React.FC<MarineMapProps> = ({
  preset,
  spills,
  selectedSpill,
  onSelectSpill,
  driftResult,
  showSatelliteFootprint = true,
  showDetectedSlick = true,
  showBackwardContours = true,
  showForwardContours = true,
  showParticleTracks = true,
  showCurrentVectors = false,
  showWindVectors = false,
  candidateVessels = [],
  selectedVessel = null,
  onSelectVessel,
  showVesselTracks = true,
  liveAISVessels = [],
  showLiveAIS = true,
  investigationRadiusKm = 15.0,
  timelineOffsetHours = 0,
}) => {
  const defaultCenter: [number, number] = selectedSpill
    ? [selectedSpill.centroid[1], selectedSpill.centroid[0]]
    : preset
    ? [preset.center[1], preset.center[0]]
    : [19.47, 72.40];
  const defaultZoom = preset ? preset.zoom : 11;
  const targetKey = selectedSpill ? `spill-${selectedSpill.spill_id}` : preset ? `preset-${preset.id}` : 'default-view';

  // AOI Bounds for Rectangle (Satellite Scene Footprint)
  const aoiBounds: L.LatLngBoundsExpression | null = preset
    ? [
        [preset.bbox[1], preset.bbox[0]],
        [preset.bbox[3], preset.bbox[2]],
      ]
    : null;

  // Interpolate vessel positions based on timeline offset hours
  const baseDetectionTime = new Date(selectedSpill?.detected_at || '2026-09-07T05:42:00Z').getTime();
  const simulatedTimeMs = baseDetectionTime + timelineOffsetHours * 3600 * 1000;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <MapController center={defaultCenter} zoom={defaultZoom} targetKey={targetKey} />

        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="MapTiler Dark Matter">
            <TileLayer
              attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
              url={`https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="MapTiler Satellite Hybrid HD">
            <TileLayer
              attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>'
              url={`https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="MapTiler Ocean Bathymetry">
            <TileLayer
              attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>'
              url={`https://api.maptiler.com/maps/ocean/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Esri Dark Gray Canvas">
            <TileLayer
              attribution="&copy; Esri, DeLorme, NAVTEQ"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Esri World Imagery (Satellite)">
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* 1. Satellite Scene Footprint (AOI Bounding Box) */}
        {showSatelliteFootprint && aoiBounds && (
          <Rectangle
            bounds={aoiBounds}
            pathOptions={{
              color: '#00f0ff',
              weight: 1.5,
              dashArray: '6, 6',
              fillColor: '#00f0ff',
              fillOpacity: 0.04,
            }}
          />
        )}

        {/* ================= PHASE 2 DRIFT & HINDCAST LAYERS ================= */}
        {driftResult && (
          <>
            {/* 2. Backward Origin Probability Bands (Amber / Orange) */}
            {showBackwardContours && (
              <>
                {driftResult.backward.origin_probability_polygons.p95 && (
                  <GeoJSON
                    key={`bw-p95-${driftResult.spill_id}`}
                    data={{ type: 'Feature', properties: {}, geometry: driftResult.backward.origin_probability_polygons.p95 } as any}
                    style={{ color: '#ffaa00', weight: 1.5, dashArray: '4, 4', fillColor: '#ffaa00', fillOpacity: 0.15 }}
                  />
                )}
                {driftResult.backward.origin_probability_polygons.p75 && (
                  <GeoJSON
                    key={`bw-p75-${driftResult.spill_id}`}
                    data={{ type: 'Feature', properties: {}, geometry: driftResult.backward.origin_probability_polygons.p75 } as any}
                    style={{ color: '#ff7700', weight: 2, fillColor: '#ff7700', fillOpacity: 0.3 }}
                  />
                )}
                {driftResult.backward.origin_probability_polygons.p50 && (
                  <GeoJSON
                    key={`bw-p50-${driftResult.spill_id}`}
                    data={{ type: 'Feature', properties: {}, geometry: driftResult.backward.origin_probability_polygons.p50 } as any}
                    style={{ color: '#ff3300', weight: 2.5, fillColor: '#ff3300', fillOpacity: 0.55 }}
                  />
                )}

                {/* Origin Centroid Marker */}
                <Marker
                  position={[driftResult.backward.origin_centroid[1], driftResult.backward.origin_centroid[0]]}
                  icon={createOriginIcon()}
                >
                  <Popup>
                    <div style={{ fontSize: '0.8rem', padding: '4px' }}>
                      <div style={{ fontWeight: 700, color: '#ffaa00', marginBottom: '4px' }}>
                        Estimated Origin Location (Hindcast)
                      </div>
                      <div>Most Likely Time: <b>{driftResult.backward.estimated_origin_time_window.most_likely.slice(0, 16).replace('T', ' ')} UTC</b></div>
                      <div>Centroid: <b>[{driftResult.backward.origin_centroid[0].toFixed(4)}, {driftResult.backward.origin_centroid[1].toFixed(4)}]</b></div>
                      <div>Spread Radius: <b>{driftResult.backward.origin_spread_radius_km.toFixed(1)} km</b></div>
                    </div>
                  </Popup>
                </Marker>
              </>
            )}

            {/* 3. Forward Spread Probability Bands (Cyan / Emerald) */}
            {showForwardContours && (
              <>
                {driftResult.forward.future_spread_polygons.p95 && (
                  <GeoJSON
                    key={`fw-p95-${driftResult.spill_id}`}
                    data={{ type: 'Feature', properties: {}, geometry: driftResult.forward.future_spread_polygons.p95 } as any}
                    style={{ color: '#00f0ff', weight: 1.5, dashArray: '4, 4', fillColor: '#00f0ff', fillOpacity: 0.15 }}
                  />
                )}
                {driftResult.forward.future_spread_polygons.p75 && (
                  <GeoJSON
                    key={`fw-p75-${driftResult.spill_id}`}
                    data={{ type: 'Feature', properties: {}, geometry: driftResult.forward.future_spread_polygons.p75 } as any}
                    style={{ color: '#00d2ff', weight: 2, fillColor: '#00d2ff', fillOpacity: 0.3 }}
                  />
                )}
                {driftResult.forward.future_spread_polygons.p50 && (
                  <GeoJSON
                    key={`fw-p50-${driftResult.spill_id}`}
                    data={{ type: 'Feature', properties: {}, geometry: driftResult.forward.future_spread_polygons.p50 } as any}
                    style={{ color: '#00e676', weight: 2.5, fillColor: '#00e676', fillOpacity: 0.55 }}
                  />
                )}

                {/* Predicted Future Centroid Marker */}
                <Marker
                  position={[driftResult.forward.predicted_centroid[1], driftResult.forward.predicted_centroid[0]]}
                  icon={createForecastIcon()}
                >
                  <Popup>
                    <div style={{ fontSize: '0.8rem', padding: '4px' }}>
                      <div style={{ fontWeight: 700, color: '#00f0ff', marginBottom: '4px' }}>
                        Forecast Spread Centroid
                      </div>
                      <div>Time Horizon: <b>{driftResult.forward.spread_time_horizon.slice(0, 16).replace('T', ' ')} UTC</b></div>
                      <div>Centroid: <b>[{driftResult.forward.predicted_centroid[0].toFixed(4)}, {driftResult.forward.predicted_centroid[1].toFixed(4)}]</b></div>
                      <div>Spread Radius: <b>{driftResult.forward.predicted_spread_radius_km.toFixed(1)} km</b></div>
                    </div>
                  </Popup>
                </Marker>
              </>
            )}

            {/* 4. Sampled Particle Tracks (Streamlines) */}
            {showParticleTracks && (
              <>
                {/* Backward Tracks (Amber) */}
                {driftResult.backward.sampled_particle_trajectories.map((t) => (
                  <Polyline
                    key={`bw-track-${t.particle_id}`}
                    positions={t.track.map((pt) => [pt[1], pt[0]])}
                    pathOptions={{ color: '#ffaa00', weight: 1.2, opacity: 0.45 }}
                  />
                ))}
                {/* Forward Tracks (Cyan) */}
                {driftResult.forward.sampled_particle_trajectories.map((t) => (
                  <Polyline
                    key={`fw-track-${t.particle_id}`}
                    positions={t.track.map((pt) => [pt[1], pt[0]])}
                    pathOptions={{ color: '#00f0ff', weight: 1.2, opacity: 0.45 }}
                  />
                ))}
              </>
            )}

            {/* 5. Ocean Current Vector Arrows */}
            {showCurrentVectors &&
              driftResult.vector_field.current_vectors.map((vec, i) => (
                <Marker
                  key={`curr-vec-${i}`}
                  position={[vec.lat, vec.lon]}
                  icon={createVectorIcon(vec, 'current')}
                >
                  <Popup>
                    <div style={{ fontSize: '0.75rem' }}>
                      <b style={{ color: '#00d2ff' }}>Copernicus Surface Current</b>
                      <div>Speed: <b>{vec.speed_ms.toFixed(2)} m/s</b> ({vec.direction_deg.toFixed(0)}°)</div>
                      <div>u: {vec.u.toFixed(2)}, v: {vec.v.toFixed(2)}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* 6. Wind Vector Arrows */}
            {showWindVectors &&
              driftResult.vector_field.wind_vectors.map((vec, i) => (
                <Marker
                  key={`wind-vec-${i}`}
                  position={[vec.lat, vec.lon]}
                  icon={createVectorIcon(vec, 'wind')}
                >
                  <Popup>
                    <div style={{ fontSize: '0.75rem' }}>
                      <b style={{ color: '#ffaa00' }}>ERA5 10m Marine Wind</b>
                      <div>Speed: <b>{vec.speed_ms.toFixed(1)} m/s</b> ({vec.direction_deg.toFixed(0)}°)</div>
                      <div>u: {vec.u.toFixed(1)}, v: {vec.v.toFixed(1)}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </>
        )}

        {/* 6.5 Incident Investigation Window Perimeter */}
        {selectedSpill && (
          <Circle
            center={[selectedSpill.centroid[1], selectedSpill.centroid[0]]}
            radius={investigationRadiusKm * 1000}
            pathOptions={{
              color: '#38BDF8',
              fillColor: '#0284C7',
              fillOpacity: 0.05,
              weight: 1.5,
              dashArray: '5, 5',
            }}
          />
        )}

        {/* 7. Candidate Vessel AIS Tracks & Waypoints */}
        {showVesselTracks &&
          candidateVessels.map((vessel) => {
            const isSelected = selectedVessel?.mmsi === vessel.mmsi;
            const prov = vessel.provenance_label || (vessel.is_authentic_real ? 'REAL AIS' : 'MODELLED');
            const isReal = vessel.is_authentic_real;
            const trackColor = isReal ? '#10B981' : '#F59E0B';
            const trackCoords: [number, number][] = vessel.track.map((pt) => [pt.lat, pt.lon]);

            // Find closest position to the simulated scrubbed timestamp
            let interpolatedPos: VesselPoint = vessel.track[0];
            let minDiff = Infinity;
            for (const pt of vessel.track) {
              const ptTime = new Date(pt.timestamp).getTime();
              const diff = Math.abs(ptTime - simulatedTimeMs);
              if (diff < minDiff) {
                minDiff = diff;
                interpolatedPos = pt;
              }
            }

            return (
              <React.Fragment key={`vessel-${vessel.mmsi}`}>
                {/* Full Track Polyline */}
                <Polyline
                  positions={trackCoords}
                  pathOptions={{
                    color: trackColor,
                    weight: isSelected ? 3.5 : 2.0,
                    opacity: isSelected ? 0.95 : 0.65,
                    dashArray: isReal ? undefined : '6, 6',
                  }}
                  eventHandlers={{
                    click: () => onSelectVessel && onSelectVessel(vessel),
                  }}
                />

                {/* Animated Vessel Marker at current timeline offset */}
                <Marker
                  position={[interpolatedPos.lat, interpolatedPos.lon]}
                  icon={createVesselIcon(vessel, isSelected)}
                  eventHandlers={{
                    click: () => onSelectVessel && onSelectVessel(vessel),
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '0.8rem', padding: '4px' }}>
                      <div style={{ fontWeight: 700, color: trackColor, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>{vessel.vessel_name} ({vessel.vessel_type})</span>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: isReal ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
                        PROVENANCE: {prov}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        Flag: <b>{vessel.flag}</b> &bull; MMSI: <b>{vessel.mmsi}</b>
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.72rem' }}>
                        Suspect Score: <b>{vessel.suspect_score.toFixed(2)}</b> (ML Anomaly: <b>{vessel.anomaly_score.toFixed(2)}</b>)
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Speed: <b>{interpolatedPos.sog_knots} kts</b> &bull; Course: <b>{interpolatedPos.cog_deg}°</b> &bull; {vessel.observation_count ?? vessel.track?.length} pings
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}

        {/* 7.5 Real-Time Live AIS Feed Vessels (AISStream.io) */}
        {showLiveAIS &&
          liveAISVessels.map((liveVessel) => {
            const trackPts = liveVessel.track?.map((pt) => [pt[1], pt[0]] as [number, number]) || [];
            return (
              <React.Fragment key={`live-ais-${liveVessel.mmsi}`}>
                {trackPts.length > 1 && (
                  <Polyline
                    positions={trackPts}
                    pathOptions={{
                      color: '#00f0ff',
                      weight: 1.5,
                      opacity: 0.6,
                      dashArray: '2, 4',
                    }}
                  />
                )}
                <Marker
                  position={[liveVessel.lat, liveVessel.lon]}
                  icon={createLiveAISIcon(liveVessel)}
                >
                  <Popup>
                    <div style={{ fontSize: '0.8rem', padding: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f0ff', display: 'inline-block' }}></span>
                        <div style={{ fontWeight: 700, color: '#00f0ff' }}>
                          {liveVessel.name || `MMSI: ${liveVessel.mmsi}`}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        MMSI: <b>{liveVessel.mmsi}</b> &bull; Type: <b>{liveVessel.ship_type || 'Cargo/Tanker'}</b>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px', fontSize: '0.72rem' }}>
                        <div>SOG: <b>{liveVessel.sog} kts</b></div>
                        <div>COG: <b>{liveVessel.cog}°</b></div>
                        <div>Lat: <b>{liveVessel.lat.toFixed(4)}</b></div>
                        <div>Lon: <b>{liveVessel.lon.toFixed(4)}</b></div>
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.65rem', color: 'var(--accent-cyan)', opacity: 0.85 }}>
                        Streamed Live via AISStream.io
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}

        {/* 8. Detected Oil Spills GeoJSON Polygons */}
        {showDetectedSlick &&
          spills.map((spill) => {
            const isSelected = selectedSpill?.spill_id === spill.spill_id;
            const confidence = spill.confidence || 0.8;
            const strokeColor = isSelected ? '#ffffff' : confidence >= 0.85 ? '#ff2d55' : '#ff9500';
            const fillColor = isSelected ? '#ff2d55' : confidence >= 0.85 ? '#ff2d55' : '#ff9500';

            const featureData: any = {
              type: 'Feature',
              properties: { spill_id: spill.spill_id, area: spill.area_km2 },
              geometry: spill.geometry,
            };

            return (
              <React.Fragment key={spill.spill_id}>
                {/* Solid Labeled Polygon */}
                <GeoJSON
                  data={featureData}
                  style={{
                    color: strokeColor,
                    weight: isSelected ? 3.5 : 2,
                    opacity: 0.95,
                    fillColor: fillColor,
                    fillOpacity: isSelected ? 0.65 : 0.45,
                  }}
                  eventHandlers={{
                    click: () => onSelectSpill(spill),
                  }}
                />

                {/* Centroid Marker with Popup */}
                <Marker
                  position={[spill.centroid[1], spill.centroid[0]]}
                  icon={createPulseIcon(spill.confidence)}
                  eventHandlers={{
                    click: () => onSelectSpill(spill),
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '0.8rem', padding: '4px' }}>
                      <div style={{ fontWeight: 700, color: '#00f0ff', marginBottom: '4px' }}>
                        {spill.spill_id}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.72rem' }}>
                        <div>Area: <b>{spill.area_km2.toFixed(2)} km²</b></div>
                        <div>Perimeter: <b>{spill.perimeter_km.toFixed(2)} km</b></div>
                        <div>Length: <b>{spill.length_km.toFixed(2)} km</b></div>
                        <div>Width: <b>{spill.width_km.toFixed(2)} km</b></div>
                        <div>Confidence: <b>{(spill.confidence * 100).toFixed(0)}%</b></div>
                        <div>Orient: <b>{spill.orientation_deg.toFixed(1)}°</b></div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
      </MapContainer>
    </div>
  );
};

