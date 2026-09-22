import datetime
import math
import logging
from typing import Any, Dict, List
import numpy as np
from sklearn.ensemble import IsolationForest

from app.schemas.vessel import (
    CandidateVessel,
    ComponentScores,
    VesselCorrelationRequest,
    VesselCorrelationResponse,
    VesselFeatures
)
from app.services.ais_engine import ais_engine

logger = logging.getLogger(__name__)


class AnomalyAttributionScorer:
    """
    Machine Learning Anomaly Detection and Composite Suspect Attribution Engine.
    Uses scikit-learn IsolationForest to evaluate multi-dimensional kinematic behavior
    and rank suspect vessels.
    """

    def __init__(self):
        pass

    def evaluate_and_rank_vessels(
        self,
        spill_id: str,
        origin_centroid: List[float],
        origin_window: Dict[str, str],
        slick_orientation_deg: float = 140.0,
        request: VesselCorrelationRequest = VesselCorrelationRequest()
    ) -> VesselCorrelationResponse:
        """
        Executes full AIS vessel correlation and anomaly attribution pipeline.
        """
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        
        strict_mode = bool(request.strict_real_ais_only)
        eff_radius_km = request.investigation_radius_km if request.investigation_radius_km is not None else (request.origin_buffer_km or 15.0)
        eff_time_hours = request.time_window_hours if request.time_window_hours is not None else (request.time_window_padding_hours or 48.0)

        is_synthetic = (
            spill_id.startswith("synth_") or
            spill_id.startswith("spill_2026") or
            "demo" in spill_id.lower() or
            "synthetic" in spill_id.lower()
        )

        # 1. Query AIS vessels in corridor
        fetch_gfw = request.fetch_online_gfw if request.fetch_online_gfw is not None else (not strict_mode)
        vessels_raw, criteria, total_corridor = ais_engine.query_vessels_in_corridor(
            origin_centroid=origin_centroid,
            origin_window=origin_window,
            slick_orientation_deg=slick_orientation_deg,
            padding_hours=eff_time_hours,
            buffer_km=eff_radius_km,
            investigation_radius_km=eff_radius_km,
            time_window_hours=eff_time_hours,
            spill_id=spill_id,
            strict_real_ais_only=strict_mode,
            fetch_online_gfw=fetch_gfw
        )

        t_likely_str = origin_window.get("most_likely", "2026-09-06T20:00:00Z")
        try:
            t_likely = datetime.datetime.fromisoformat(t_likely_str.replace("Z", "+00:00"))
        except Exception:
            t_likely = datetime.datetime.now(datetime.timezone.utc)

        gfw_count = sum(1 for v in vessels_raw if v.get("data_source") == "GFW_CLOUD_GATEWAY" or v.get("ais_source") == "GFW_CLOUD_GATEWAY")
        total_pings_found = sum(len(v.get("track", [])) for v in vessels_raw)

        # If zero vessels in corridor under strict mode, return clean intentional zero response
        if not vessels_raw:
            return VesselCorrelationResponse(
                spill_id=spill_id,
                analyzed_at=now_utc.isoformat(),
                provenance="NO AIS EVIDENCE",
                evidence_status="NO_AIS_EVIDENCE",
                data_source="REAL_AIS",
                records_found=0,
                investigation_center=[round(origin_centroid[0], 5), round(origin_centroid[1], 5)],
                investigation_radius_km=eff_radius_km,
                time_window_hours=eff_time_hours,
                is_synthetic_incident=is_synthetic,
                evidence_reason="No verified AIS observations were available within the configured spatial-temporal investigation window. Absence of AIS evidence does not prove absence of vessels.",
                disclaimer="Strict Real AIS Only mode active: 0 verified AIS records found within the investigation window. Absence of AIS evidence does not prove absence of vessels.",
                search_criteria=criteria,
                total_vessels_in_corridor=0,
                candidate_vessels_count=0,
                authentic_vessels_count=0,
                is_strict_mode=True,
                gfw_cloud_synced=bool(gfw_count > 0 or fetch_gfw),
                gfw_vessels_fetched=gfw_count,
                candidate_vessels=[],
                scoring_weights={
                    "proximity": request.weight_proximity or 0.35,
                    "temporal": request.weight_temporal or 0.25,
                    "trajectory": request.weight_trajectory or 0.20,
                    "ml_anomaly": request.weight_anomaly or 0.20
                }
            )

        # 2. Extract features for all vessels
        extracted_data = []
        feature_matrix = []

        for v_dict in vessels_raw:
            features, cpa_time = ais_engine.extract_vessel_features(
                vessel_dict=v_dict,
                origin_centroid=origin_centroid,
                t_release=t_likely,
                slick_orientation_deg=slick_orientation_deg
            )
            
            # 8-dimensional feature vector for ML
            feat_vec = [
                features.min_distance_to_origin_km,
                features.time_near_origin_hours,
                features.speed_change_variance,
                features.course_change_frequency,
                features.loitering_score,
                features.route_deviation_score,
                features.ais_gap_duration_hours,
                features.bearing_alignment_with_drift
            ]
            feature_matrix.append(feat_vec)
            extracted_data.append((v_dict, features, cpa_time))

        # 3. Fit and Predict via IsolationForest Machine Learning Model
        X = np.array(feature_matrix)
        
        # Guard against zero variance or empty matrices
        if len(X) >= 3:
            contamination = min(max(1.0 / len(X), 0.1), 0.35)
            clf = IsolationForest(
                n_estimators=100,
                contamination=contamination,
                random_state=42
            )
            clf.fit(X)
            raw_scores = -clf.decision_function(X)
            s_min, s_max = float(raw_scores.min()), float(raw_scores.max())
            if s_max > s_min:
                norm_anomaly = (raw_scores - s_min) / (s_max - s_min)
            else:
                norm_anomaly = np.full(len(X), 0.5)
        else:
            norm_anomaly = [0.65 if d[1].ais_gap_duration_hours > 1.0 or d[1].loitering_score > 0.6 else 0.25 for d in extracted_data]

        # 4. Compute Weighted Composite Suspect Scores
        w_prox = request.weight_proximity or 0.35
        w_temp = request.weight_temporal or 0.25
        w_traj = request.weight_trajectory or 0.20
        w_anom = request.weight_anomaly or 0.20
        total_w = w_prox + w_temp + w_traj + w_anom

        candidates: List[CandidateVessel] = []

        for idx, (v_dict, features, cpa_time) in enumerate(extracted_data):
            ml_anomaly = float(norm_anomaly[idx])
            
            comp_scores = ComponentScores(
                proximity_score=round(float(features.min_distance_to_origin_km <= eff_radius_km and max(0.0, 1.0 - (features.min_distance_to_origin_km / eff_radius_km))), 2),
                temporal_score=round(float(min(max(features.time_near_origin_hours / 4.0, 0.0), 1.0)), 2),
                trajectory_score=round(float(0.4 * features.loitering_score + 0.3 * features.route_deviation_score + 0.3 * min(features.ais_gap_duration_hours / 3.0, 1.0)), 2),
                ml_anomaly_score=round(ml_anomaly, 2)
            )

            # Composite weighted suspect score
            raw_suspect = (
                w_prox * comp_scores.proximity_score +
                w_temp * comp_scores.temporal_score +
                w_traj * comp_scores.trajectory_score +
                w_anom * comp_scores.ml_anomaly_score
            ) / total_w

            suspect_score = round(float(min(max(raw_suspect, 0.05), 0.98)), 2)
            is_ais_dark = v_dict.get("is_ais_dark", False) or features.ais_gap_duration_hours > 1.0

            # Calculate time difference from spill in hours
            try:
                cpa_dt = datetime.datetime.fromisoformat(cpa_time.replace("Z", "+00:00"))
                time_diff_h = round(abs((cpa_dt - t_likely).total_seconds()) / 3600.0, 2)
            except Exception:
                time_diff_h = None

            obs_count = len(v_dict.get("track", []))
            prov_label = v_dict.get("provenance_label")
            if not prov_label:
                prov_label = "REAL AIS" if v_dict.get("is_authentic_real") else "MODELLED"

            cand = CandidateVessel(
                mmsi=v_dict["mmsi"],
                imo=v_dict.get("imo"),
                vessel_name=v_dict["vessel_name"],
                vessel_type=v_dict["vessel_type"],
                flag=v_dict["flag"],
                length_m=v_dict["length_m"],
                deadweight_tonnage=v_dict.get("deadweight_tonnage"),
                suspect_score=suspect_score,
                anomaly_score=round(ml_anomaly, 2),
                component_scores=comp_scores,
                features=features,
                track=v_dict["track"],
                closest_approach_time=cpa_time,
                is_ais_dark_suspect=is_ais_dark,
                is_authentic_real=v_dict.get("is_authentic_real", False),
                data_source=v_dict.get("data_source", "REAL_AIS" if v_dict.get("is_authentic_real") else "MODELLED"),
                provenance_label=prov_label,
                distance_from_spill_km=round(features.min_distance_to_origin_km, 2),
                time_diff_hours_from_spill=time_diff_h,
                observation_count=obs_count,
                ais_source=v_dict.get("ais_source") or v_dict.get("source")
            )
            candidates.append(cand)

        # 5. Rank Candidate Vessels in descending order of suspect_score
        candidates.sort(key=lambda x: x.suspect_score, reverse=True)

        authentic_count = sum(1 for c in candidates if c.is_authentic_real)
        
        if authentic_count > 0:
            evidence_status = "VERIFIED_AIS_EVIDENCE"
            # Categorize predominant source
            has_imported = any(c.provenance_label == "REAL AIS — IMPORTED" for c in candidates)
            has_live = any(c.provenance_label == "REAL AIS — LIVE" for c in candidates)
            if has_imported and not has_live:
                data_source_tag = "IMPORTED_REAL_AIS"
                prov_tag = "REAL AIS — IMPORTED"
            elif has_live and not has_imported:
                data_source_tag = "LIVE_STREAM"
                prov_tag = "REAL AIS — LIVE"
            else:
                data_source_tag = "REAL_AIS"
                prov_tag = "REAL AIS"
            reason_msg = f"{authentic_count} candidate vessels correlated with {total_pings_found} verified historical/live AIS observations within the incident investigation window."
        else:
            evidence_status = "MODELLED_ANALYSIS"
            data_source_tag = "MODELLED"
            prov_tag = "MODELLED"
            reason_msg = "These trajectories are modelled / simulated traffic. These are kinematic simulations and are not historical AIS observations."

        return VesselCorrelationResponse(
            spill_id=spill_id,
            analyzed_at=now_utc.isoformat(),
            provenance=prov_tag,
            evidence_status=evidence_status,
            data_source=data_source_tag,
            records_found=total_pings_found,
            investigation_center=[round(origin_centroid[0], 5), round(origin_centroid[1], 5)],
            investigation_radius_km=eff_radius_km,
            time_window_hours=eff_time_hours,
            is_synthetic_incident=is_synthetic,
            evidence_reason=reason_msg,
            disclaimer="These trajectories are modelled and are not historical AIS observations." if not strict_mode and authentic_count == 0 else "Forensic correlation based on verified AIS observations. Does not constitute legal proof of culpability.",
            search_criteria=criteria,
            total_vessels_in_corridor=total_corridor,
            candidate_vessels_count=len(candidates),
            authentic_vessels_count=authentic_count,
            is_strict_mode=strict_mode,
            gfw_cloud_synced=bool(gfw_count > 0 or fetch_gfw),
            gfw_vessels_fetched=gfw_count,
            candidate_vessels=candidates,
            scoring_weights={
                "proximity": w_prox,
                "temporal": w_temp,
                "trajectory": w_traj,
                "ml_anomaly": w_anom
            }
        )



anomaly_scorer = AnomalyAttributionScorer()
