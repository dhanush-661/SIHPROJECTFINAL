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

        # 1. Query AIS vessels in corridor
        fetch_gfw = request.fetch_online_gfw if request.fetch_online_gfw is not None else (not strict_mode)
        vessels_raw, criteria, total_corridor = ais_engine.query_vessels_in_corridor(
            origin_centroid=origin_centroid,
            origin_window=origin_window,
            slick_orientation_deg=slick_orientation_deg,
            padding_hours=request.time_window_padding_hours or 12.0,
            buffer_km=request.origin_buffer_km or 25.0,
            spill_id=spill_id,
            strict_real_ais_only=strict_mode,
            fetch_online_gfw=fetch_gfw
        )

        t_likely_str = origin_window.get("most_likely", "2026-09-06T20:00:00Z")
        t_likely = datetime.datetime.fromisoformat(t_likely_str.replace("Z", "+00:00"))

        gfw_count = sum(1 for v in vessels_raw if v.get("data_source") == "GFW_CLOUD_GATEWAY")

        # If zero vessels in corridor under strict mode, return clean zero response
        if not vessels_raw:
            return VesselCorrelationResponse(
                spill_id=spill_id,
                analyzed_at=now_utc.isoformat(),
                provenance="MEASURED_HISTORICAL_ZERO",
                disclaimer="Strict Authentic AIS mode enabled. Zero AIS transponders were recorded in this spatial-temporal search corridor.",
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
            # decision_function: lower means more anomalous
            raw_scores = -clf.decision_function(X)
            # Normalize anomaly scores to [0.0, 1.0]
            s_min, s_max = float(raw_scores.min()), float(raw_scores.max())
            if s_max > s_min:
                norm_anomaly = (raw_scores - s_min) / (s_max - s_min)
            else:
                norm_anomaly = np.full(len(X), 0.5)
        else:
            # Heuristic anomaly fallback for small clusters
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
                proximity_score=round(float(features.min_distance_to_origin_km <= 15.0 and max(0.0, 1.0 - (features.min_distance_to_origin_km / 15.0))), 2),
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
                data_source=v_dict.get("data_source", "CORRIDOR_BENCHMARK")
            )
            candidates.append(cand)

        # 5. Rank Candidate Vessels in descending order of suspect_score
        candidates.sort(key=lambda x: x.suspect_score, reverse=True)

        authentic_count = sum(1 for c in candidates if c.is_authentic_real)
        provenance_tag = "MEASURED_HISTORICAL_AIS" if authentic_count > 0 else "ANOMALY-FLAGGED"

        return VesselCorrelationResponse(
            spill_id=spill_id,
            analyzed_at=now_utc.isoformat(),
            provenance=provenance_tag,
            disclaimer="This analysis provides probabilistic spatiotemporal and kinematic correlation for maritime enforcement investigation. It does not constitute legal proof of culpability.",
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
