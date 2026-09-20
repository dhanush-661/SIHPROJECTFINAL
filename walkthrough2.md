# Walkthrough: Validation & Incident Database Module

The **Validation & Incident Database** module has been implemented and verified. It provides a dedicated pipeline benchmarking and credibility auditing layer for AquaSentinel without mixing external data into live operational streams.

---

## 1. Architecture & Framing Principles Verified

| Principle | Implementation Details |
| :--- | :--- |
| **Never Presented as a Detection Source** | Live Sentinel-1 AOI monitoring remains the automated operational detection source. The validation module acts strictly as an auditing and credibility benchmark. |
| **Provenance Tagging** | All external ground-truth incidents are marked with strict `provenance: 'EXTERNAL-REFERENCE'`. |
| **Database Isolation** | External reference incidents are persisted in an isolated `external_incidents` SQLite table and never inserted into the `oil_spills` operational table. |
| **Honest Metric Reporting** | Plain count metrics are computed and displayed (e.g., *"1 of 1 known reference incident(s) in monitored AOI were matched by AquaSentinel's detection pipeline"*) instead of deceptive 99.9% claims. |
| **Accurate Terminology** | Clear positioning of Live AOI Monitoring as *"Automated continuous monitoring of newly available Sentinel-1 acquisitions over user-defined AOIs"*. |

---

## 2. Changes Made

### Backend Implementation
- [validation.py](file:///c:/Users/dhanu/SIH7926/backend/app/schemas/validation.py): Pydantic schemas for `ExternalIncident`, `ExternalIncidentCreate`, `ExternalIncidentImportRequest`, `ValidationRunRequest`, `ValidationComparisonRecord`, `ValidationRunResponse`.
- [external_incident_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/external_incident_service.py): Ingests, normalizes, and pre-seeds verified real-world reference incidents (*Ennore Dawn Kanchipuram*, *MV Wakashio Mauritius*, *Mumbai High Sheen*, *Malacca Strait TSS Bilge Dumping*, *Taylor Energy MC20 GoM*, *Red Sea Tanker Passage*).
- [db_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/db_service.py):
  - Created `external_incidents` and `validation_runs` tables.
  - Implemented data access methods: `save_external_incident`, `save_external_incidents_batch`, `get_external_incidents`, `get_external_incident_by_id`, `delete_external_incident`, `seed_external_incidents_force`, `save_validation_run`, `get_validation_runs`.
  - Added spatial & temporal filtering in `get_spills`.
- [validation_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/validation_service.py): Spatial-temporal comparator engine implementing Shapely polygon intersection and Haversine centroid proximity analysis with classification into `MATCHED`, `MISSED`, and `UNVALIDATED_DETECTION`.
- [main.py](file:///c:/Users/dhanu/SIH7926/backend/app/main.py): Registered endpoints:
  - `GET /api/v1/external-incidents`
  - `GET /api/v1/external-incidents/{incident_id}`
  - `POST /api/v1/external-incidents/import`
  - `POST /api/v1/external-incidents/seed`
  - `DELETE /api/v1/external-incidents/{incident_id}`
  - `POST /api/v1/validation/run`
  - `GET /api/v1/validation/results`

### Frontend Implementation
- [validation.ts](file:///c:/Users/dhanu/SIH7926/frontend/src/types/validation.ts): TypeScript type definitions for validation requests, responses, and records.
- [api.ts](file:///c:/Users/dhanu/SIH7926/frontend/src/services/api.ts): Added API client functions for querying, seeding, importing external incidents, and executing validation runs.
- [ValidationPage.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Pages/ValidationPage.tsx):
  - **Forensic Framing Card**: Explains pipeline auditing against public ground-truth records.
  - **Preset Benchmark Selector**: Quick-select presets for Ennore, Mumbai High, Malacca Strait, Mauritius, Taylor Energy GoM, Red Sea, or Global.
  - **Interactive Verification Map**: Split visualization rendering AquaSentinel Detections (cyan polygons) alongside External Reference Ground Truth (amber dashed polygons/markers) with popups and catalog links.
  - **KPI Cards & Summary Callout**: Honest plain counts (`Matched`, `Missed`, `Unvalidated Detection`).
  - **Comparison Results Matrix**: Tab-filtered breakdown with status badges, spatial distances ($\text{km}$), time deltas ($\text{hours}$), and source traceability links.
  - **Import Modal**: Modal to import custom GeoJSON FeatureCollections or JSON records.
- [Sidebar.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Navigation/Sidebar.tsx) & [App.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/App.tsx): Added `Incident Validation` navigation item and route rendering.

---

## 3. Verification & Test Results

### Automated Backend Tests
Ran `test_validation_module.py`:
```
test_api_endpoints ................................... [OK]
test_database_isolation ............................... [OK]
test_external_incident_normalization_and_provenance ... [OK]
test_missed_and_unvalidated_classification ............ [OK]
test_spatial_temporal_matching_logic ................. [OK]

Ran 5 tests in 0.121s — OK
```

Ran full backend test suite:
```
Ran 50 tests in 14.464s — OK (0 failures, 0 errors, 0 regressions)
```

### Frontend Build Verification
Ran `npm run build`:
```
✓ 1901 modules transformed.
dist/index.html                   0.94 kB
dist/assets/index-AuVbw7kW.css   18.92 kB
dist/assets/index-CIWI7_wH.js   546.91 kB
✓ built in 2.49s (0 TypeScript errors)
```
