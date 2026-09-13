"""
Report Renderer Service for AquaSentinel Marine Forensic Dossiers.
Generates server-side static PNG visualizations and QR verification codes:
1. High-precision cartographic spill footprint, drift hindcast probability bands, and vessel track overlays
2. Vessel suspect-score stacked component-breakdown bar chart
3. Cryptographic ledger verification QR code
"""

import io
import math
import logging
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Headless backend
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D
import qrcode
from qrcode.image.pil import PilImage
from typing import Dict, Any, List, Optional

logger = logging.getLogger("aquasentinel.report_renderer")


def render_spill_map_png(spill_data: Dict[str, Any], width_in: float = 7.2, height_in: float = 5.2, dpi: int = 200) -> bytes:
    """
    Renders a cartographic map overlay showing:
    - SAR Detection footprint polygon (Crimson/Red)
    - Modeled drift origin probability contours (p50, p75, p95)
    - Top candidate vessel tracks with positions and labels
    - Spill centroid & origin centroid markers
    - Ocean bathymetry styling, grid graticule, and forensic legend
    """
    fig, ax = plt.subplots(figsize=(width_in, height_in), dpi=dpi)
    
    # Clean modern dark/scientific palette
    fig.patch.set_facecolor('#0f172a')  # Slate 900
    ax.set_facecolor('#0b1329')        # Deep Navy Ocean
    
    # Collect coordinates to establish auto-bounds
    all_lons = []
    all_lats = []
    
    # 1. Parse Spill Geometry
    spill_rec = spill_data.get("spill_record") or {}
    geom = spill_rec.get("geometry") or spill_rec.get("polygon_geojson") or {}
    coords = []
    if geom:
        if geom.get("type") == "Polygon" and geom.get("coordinates"):
            coords = geom["coordinates"][0]
        elif geom.get("type") == "MultiPolygon" and geom.get("coordinates"):
            coords = geom["coordinates"][0][0]
    
    if coords:
        poly_lons = [c[0] for c in coords]
        poly_lats = [c[1] for c in coords]
        all_lons.extend(poly_lons)
        all_lats.extend(poly_lats)
        ax.fill(poly_lons, poly_lats, color='#ef4444', alpha=0.45, label='SAR Detection Footprint', zorder=5)
        ax.plot(poly_lons, poly_lats, color='#dc2626', linewidth=2.0, zorder=6)
    
    # Spill Centroid
    centroid = spill_rec.get("centroid")
    if isinstance(centroid, (list, tuple)) and len(centroid) >= 2:
        sc_lon, sc_lat = centroid[0], centroid[1]
    elif isinstance(centroid, dict):
        sc_lon = centroid.get("lon", 80.25)
        sc_lat = centroid.get("lat", 13.08)
    else:
        sc_lon = poly_lons[0] if coords else 80.25
        sc_lat = poly_lats[0] if coords else 13.08
    all_lons.append(sc_lon)
    all_lats.append(sc_lat)
    ax.scatter([sc_lon], [sc_lat], color='#f87171', s=60, marker='o', edgecolors='#ffffff', linewidths=1.2, zorder=7, label='Spill Centroid')
    
    # 2. Parse Drift Hindcast Contours
    drift_data = spill_data.get("drift_hindcast") or {}
    backward = drift_data.get("backward") or {}
    
    # Helper to plot GeoJSON polygon / MultiPolygon contour
    def plot_contour(contour_geom, fill_color, edge_color, alpha_val, label_text, z_order):
        if not contour_geom:
            return
        c_type = contour_geom.get("type")
        c_coords = contour_geom.get("coordinates", [])
        if c_type == "Polygon" and c_coords:
            p_lons = [pt[0] for pt in c_coords[0]]
            p_lats = [pt[1] for pt in c_coords[0]]
            all_lons.extend(p_lons)
            all_lats.extend(p_lats)
            ax.fill(p_lons, p_lats, color=fill_color, alpha=alpha_val, zorder=z_order, label=label_text)
            ax.plot(p_lons, p_lats, color=edge_color, linestyle='--', linewidth=1.2, zorder=z_order+0.1)
        elif c_type == "MultiPolygon" and c_coords:
            for i, poly in enumerate(c_coords):
                p_lons = [pt[0] for pt in poly[0]]
                p_lats = [pt[1] for pt in poly[0]]
                all_lons.extend(p_lons)
                all_lats.extend(p_lats)
                lbl = label_text if i == 0 else None
                ax.fill(p_lons, p_lats, color=fill_color, alpha=alpha_val, zorder=z_order, label=lbl)
                ax.plot(p_lons, p_lats, color=edge_color, linestyle='--', linewidth=1.2, zorder=z_order+0.1)

    prob_contours = backward.get("probability_contours") or {}
    p95 = prob_contours.get("p95") or backward.get("p95_contour")
    p75 = prob_contours.get("p75") or backward.get("p75_contour")
    p50 = prob_contours.get("p50") or backward.get("p50_contour")
    
    # Fallback to circular/elliptical bands if geometry not explicit
    origin_c = backward.get("origin_centroid") or {}
    oc_lon = origin_c.get("lon")
    oc_lat = origin_c.get("lat")
    
    if p95:
        plot_contour(p95, '#38bdf8', '#0284c7', 0.15, 'Origin 95% Confidence Band', 2)
    if p75:
        plot_contour(p75, '#38bdf8', '#0ea5e9', 0.25, 'Origin 75% Confidence Band', 3)
    if p50:
        plot_contour(p50, '#38bdf8', '#38bdf8', 0.35, 'Origin 50% Confidence Band', 4)
        
    if oc_lon is not None and oc_lat is not None:
        all_lons.append(oc_lon)
        all_lats.append(oc_lat)
        ax.scatter([oc_lon], [oc_lat], color='#38bdf8', s=80, marker='X', edgecolors='#ffffff', linewidths=1.5, zorder=8, label='Modeled Origin Centroid')
        # Draw drift trajectory vector between origin and spill
        ax.annotate('', xy=(sc_lon, sc_lat), xytext=(oc_lon, oc_lat),
                    arrowprops=dict(arrowstyle="->", color='#38bdf8', lw=1.8, linestyle=':'),
                    zorder=7)

    # 3. Parse Vessel Tracks
    vessel_data = spill_data.get("vessel_correlation") or {}
    candidates = vessel_data.get("candidate_vessels") or []
    track_colors = ['#f59e0b', '#10b981', '#a855f7', '#ec4899', '#6366f1']
    
    top_candidates = candidates[:4]
    for idx, v in enumerate(top_candidates):
        color = track_colors[idx % len(track_colors)]
        mmsi = v.get("mmsi", "Unknown")
        name = v.get("name") or f"MMSI {mmsi}"
        score = v.get("suspect_score", 0.0)
        
        # Track line
        track_points = v.get("track") or v.get("trajectory") or []
        if track_points:
            t_lons = [p.get("lon", p.get("longitude", 0)) for p in track_points if "lon" in p or "longitude" in p]
            t_lats = [p.get("lat", p.get("latitude", 0)) for p in track_points if "lat" in p or "latitude" in p]
            if t_lons and t_lats:
                all_lons.extend(t_lons)
                all_lats.extend(t_lats)
                ax.plot(t_lons, t_lats, color=color, linewidth=1.8, linestyle='-', zorder=6, label=f'{name} (Score: {score:.2f})')
                # Start / end / closest points
                ax.scatter([t_lons[-1]], [t_lats[-1]], color=color, marker='^', s=70, edgecolors='#ffffff', linewidths=1.0, zorder=7)
                ax.text(t_lons[-1] + 0.005, t_lats[-1] + 0.003, f"{name}", color=color, fontsize=8, fontweight='bold', zorder=9,
                        bbox=dict(boxstyle="round,pad=0.2", fc="#0f172a", ec=color, lw=0.8, alpha=0.85))

    # Determine Bounding Box with padding
    if all_lons and all_lats:
        min_lon, max_lon = min(all_lons), max(all_lons)
        min_lat, max_lat = min(all_lats), max(all_lats)
        pad_lon = max((max_lon - min_lon) * 0.25, 0.05)
        pad_lat = max((max_lat - min_lat) * 0.25, 0.05)
        ax.set_xlim(min_lon - pad_lon, max_lon + pad_lon)
        ax.set_ylim(min_lat - pad_lat, max_lat + pad_lat)
    else:
        ax.set_xlim(80.1, 80.4)
        ax.set_ylim(12.9, 13.2)

    # Grid, Graticule and Styling
    ax.grid(True, linestyle=':', alpha=0.25, color='#94a3b8')
    ax.tick_params(colors='#94a3b8', labelsize=8)
    for spine in ax.spines.values():
        spine.set_color('#334155')
        spine.set_linewidth(1.0)
        
    ax.set_xlabel('Longitude (°E)', color='#cbd5e1', fontsize=9, fontweight='bold', labelpad=5)
    ax.set_ylabel('Latitude (°N)', color='#cbd5e1', fontsize=9, fontweight='bold', labelpad=5)
    
    # Title & Subtitle banner
    ax.set_title("GEO-FORENSIC HINDCAST & AIS SPATIAL CORRELATION", color='#f8fafc', fontsize=10, fontweight='bold', pad=10)
    
    # Clean compact legend
    legend = ax.legend(loc='lower right', facecolor='#1e293b', edgecolor='#475569', labelcolor='#e2e8f0', fontsize=7.5, framealpha=0.92)
    legend.get_frame().set_linewidth(0.8)
    
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight', dpi=dpi)
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()


def render_vessel_score_chart_png(candidate_vessels: List[Dict[str, Any]], width_in: float = 7.0, height_in: float = 3.6, dpi: int = 200) -> bytes:
    """
    Renders a stacked horizontal bar chart showing component score breakdown for candidate vessels:
    - Proximity Score (Blue)
    - Temporal Alignment (Emerald)
    - Trajectory Anomaly (Amber)
    - AIS Behavioral Anomaly (Red)
    """
    fig, ax = plt.subplots(figsize=(width_in, height_in), dpi=dpi)
    
    fig.patch.set_facecolor('#0f172a')  # Slate 900
    ax.set_facecolor('#1e293b')        # Slate 800
    
    # Filter top 5 vessels
    top_vessels = candidate_vessels[:5]
    if not top_vessels:
        # Placeholder empty figure
        ax.text(0.5, 0.5, "No Candidate Vessels Identified in Correlated Window", color="#94a3b8",
                ha='center', va='center', fontsize=11, transform=ax.transAxes)
        ax.set_xticks([])
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_color('#334155')
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', facecolor=fig.get_facecolor(), bbox_inches='tight', dpi=dpi)
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()

    # Reverse order so top rank is at top
    vessels = list(reversed(top_vessels))
    labels = []
    
    prox_scores = []
    temp_scores = []
    traj_scores = []
    anom_scores = []
    total_scores = []
    
    for v in vessels:
        mmsi = v.get("mmsi", "Unknown")
        name = v.get("name") or f"MMSI {mmsi}"
        rank = v.get("rank", "")
        rank_str = f"#{rank} " if rank else ""
        labels.append(f"{rank_str}{name}\n({mmsi})")
        
        c = v.get("component_scores") or {}
        # Component contributions scaled by model weights:
        # Suspect Score = 0.35 * Proximity + 0.25 * Temporal + 0.20 * Trajectory + 0.20 * ML Anomaly
        p = float(c.get("proximity_score", 0.0)) * 0.35
        t = float(c.get("temporal_score", 0.0)) * 0.25
        tr = float(c.get("trajectory_score", 0.0)) * 0.20
        a = float(c.get("ml_anomaly_score", c.get("anomaly_score", 0.0))) * 0.20
        
        prox_scores.append(p)
        temp_scores.append(t)
        traj_scores.append(tr)
        anom_scores.append(a)
        total_scores.append(float(v.get("suspect_score", p + t + tr + a)))

    y_pos = np.arange(len(labels))
    bar_height = 0.48
    
    # Colors
    c_prox = '#3b82f6'  # Blue
    c_temp = '#10b981'  # Emerald
    c_traj = '#f59e0b'  # Amber
    c_anom = '#ef4444'  # Crimson/Red
    
    p1 = ax.barh(y_pos, prox_scores, bar_height, color=c_prox, label='Proximity (35%)', edgecolor='#1e293b')
    p2 = ax.barh(y_pos, temp_scores, bar_height, left=prox_scores, color=c_temp, label='Temporal (25%)', edgecolor='#1e293b')
    p3 = ax.barh(y_pos, traj_scores, bar_height, left=np.add(prox_scores, temp_scores), color=c_traj, label='Trajectory (20%)', edgecolor='#1e293b')
    p4 = ax.barh(y_pos, anom_scores, bar_height, left=np.add(np.add(prox_scores, temp_scores), traj_scores), color=c_anom, label='ML Anomaly (20%)', edgecolor='#1e293b')
    
    # Add numerical score labels at bar ends
    for i, total in enumerate(total_scores):
        ax.text(total + 0.02, y_pos[i], f"{total:.3f}", color='#f8fafc', va='center', ha='left', fontsize=8.5, fontweight='bold')
    
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, color='#e2e8f0', fontsize=8.5, fontweight='bold')
    ax.set_xlim(0, 1.15)
    ax.set_xlabel('Weighted Suspect Contribution Index [0.0 - 1.0]', color='#cbd5e1', fontsize=9, fontweight='bold', labelpad=6)
    
    ax.grid(axis='x', linestyle=':', alpha=0.3, color='#94a3b8')
    ax.tick_params(colors='#94a3b8', labelsize=8)
    for spine in ax.spines.values():
        spine.set_color('#334155')
        spine.set_linewidth(1.0)
        
    ax.set_title("VESSEL SUSPECT-SCORE MULTI-CRITERIA DECOMPOSITION", color='#f8fafc', fontsize=10, fontweight='bold', pad=10)
    
    legend = ax.legend(loc='lower right', facecolor='#0f172a', edgecolor='#475569', labelcolor='#e2e8f0', fontsize=7.5, framealpha=0.92, ncol=2)
    legend.get_frame().set_linewidth(0.8)
    
    plt.tight_layout()
    
    buf = io.BytesIO()
    plt.savefig(buf, format='png', facecolor=fig.get_facecolor(), bbox_inches='tight', dpi=dpi)
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()


def render_qr_code_png(data_url: str, box_size: int = 8, border: int = 2) -> bytes:
    """
    Renders high-contrast QR code for cryptographic chain-of-custody verification.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f172a", back_color="#ffffff")
    
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()
