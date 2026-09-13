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
        
        # 1. Query AIS vessels in corridor
        vessels_raw, criteria, total_corridor = ais_engine.query_vessels_in_corridor(
            origin_centroid=origin_centroid,
            origin_window=origin_window,
            slick_orientation_deg=slick_orientation_deg,
            padding_hours=request.time_window_padding_hours or 12.0,
            buffer_km=request.origin_buffer_km or 25.0
        )

        t_likely_str = origin_window.get("most_likely", "2026-09-06T20:00:00Z")
        t_likely = datetime.datetime.fromisoformat(t_likely_str.replace("Z", "+00:00"))

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

        # 3. Fit scikit-learn IsolationForest for ML Anomaly Scoring
        X = np.array(feature_matrix, dtype=np.float64)
        if len(X) >= 3:
            # IsolationForest anomaly detection
            iso_forest = IsolationForest(
                n_estimators=100,
                contamination=0.25,
                random_state=42
            )
            iso_forest.fit(X)
            # Decision function (lower = more anomalous), convert to [0.0, 1.0] anomaly score
            raw_scores = -iso_forest.decision_function(X) # higher = more anomalous
            min_s, max_s = np.min(raw_scores), np.max(raw_scores)
            if max_s > min_s:
                norm_anomaly_scores = (raw_scores - min_s) / (max_s - min_s)
            else:
                norm_anomaly_scores = np.ones(len(raw_scores)) * 0.5
        else:
            norm_anomaly_scores = np.ones(len(X)) * 0.5

        # 4. Compute Component Scores & Composite Suspect Score
        w_prox = request.weight_proximity or 0.35
        w_temp = request.weight_temporal or 0.25
        w_traj = request.weight_trajectory or 0.20
        w_anom = request.weight_anomaly or 0.20
        total_w = w_prox + w_temp + w_traj + w_anom

        candidates: List[CandidateVessel] = []

        for idx, (v_dict, features, cpa_time) in enumerate(extracted_data):
            ml_anomaly = float(norm_anomaly_scores[idx])

            # Proximity Score: Exponential decay from origin
            proximity_score = float(math.exp(-features.min_distance_to_origin_km / 7.5))
            
            # Temporal Score: Gaussian proximity to most likely release time
            cpa_dt = datetime.datetime.fromisoformat(cpa_time.replace("Z", "+00:00"))
            time_diff_hours = abs((cpa_dt - t_likely).total_seconds()) / 3600.0
            temporal_score = float(math.exp(-time_diff_hours / 5.0))

            # Trajectory Score: Combination of loitering, speed variance, route deviation & AIS gap
            gap_penalty = min(features.ais_gap_duration_hours / 2.0, 1.0) * 0.40
            traj_score = float(min(
                0.30 * features.loitering_score +
                0.20 * features.route_deviation_score +
                0.10 * min(features.speed_change_variance / 4.0, 1.0) +
                gap_penalty,
                1.0
            ))

            comp_scores = ComponentScores(
                proximity_score=round(min(max(proximity_score, 0.0), 1.0), 2),
                temporal_score=round(min(max(temporal_score, 0.0), 1.0), 2),
                trajectory_score=round(min(max(traj_score, 0.0), 1.0), 2),
                ml_anomaly_score=round(min(max(ml_anomaly, 0.0), 1.0), 2)
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
                is_ais_dark_suspect=is_ais_dark
            )
            candidates.append(cand)

        # 5. Rank Candidate Vessels in descending order of suspect_score
        candidates.sort(key=lambda x: x.suspect_score, reverse=True)

        return VesselCorrelationResponse(
            spill_id=spill_id,
            analyzed_at=now_utc.isoformat(),
            provenance="ANOMALY-FLAGGED",
            disclaimer="This analysis provides probabilistic spatiotemporal and kinematic correlation for maritime enforcement investigation. It does not constitute legal proof of culpability.",
            search_criteria=criteria,
            total_vessels_in_corridor=total_corridor,
            candidate_vessels_count=len(candidates),
            candidate_vessels=candidates,
            scoring_weights={
                "proximity": w_prox,
                "temporal": w_temp,
                "trajectory": w_traj,
                "ml_anomaly": w_anom
            }
        )


anomaly_scorer = AnomalyAttributionScorer()
