# Validation & Incident Database Module Implementation Plan

## Overview
This module creates a dedicated **Validation & Incident Database** layer in AquaSentinel. It ingests known real-world oil-spill incidents from public external satellite-surveillance feeds and reference catalogs (such as SkyTruth / Cerulean, NOAA MPSR, CleanSeaNet, and verified historical ground-truth records) **strictly** for auditing and validating the accuracy of AquaSentinel's own Sentinel-1 detection pipeline.

### Core Framing Rules
1. **Never Presented as a Detection Source**: Live AOI Monitoring remains the primary automated detection engine. This module exists exclusively to prove detection credibility against real-world data.
2. **Clear Provenance Tagging**: All external data is tagged `EXTERNAL-REFERENCE` (distinct from `DETECTED`, `MEASURED`, `MODEL-PREDICTED`, `ANOMALY-FLAGGED`, `VERIFIED`).
3. **Database Separation**: External reference incidents are persisted in a dedicated `external_incidents` table and never mixed into the `oil_spills` operational table.
4. **Honest Metric Reporting**: No deceptive "99.9% precision/recall" claims on small incident samples. Instead, plain counts and clear match/miss summaries are presented (e.g. "5 of 6 known reference incidents in monitored AOIs were matched by AquaSentinel's own detection").
5. **Accurate Terminology**: Copy across all pages refers to Live AOI Monitoring as "Automated continuous monitoring of newly available Sentinel-1 acquisitions over user-defined AOIs" (not "24/7 real-time monitoring").

---

## Proposed Changes

### Phase 1: External Incident Ingestion Service & Schemas

#### [NEW] [validation.py](file:///c:/Users/dhanu/SIH7926/backend/app/schemas/validation.py)
- Pydantic models for `ExternalIncident`, `ExternalIncidentCreate`, `ExternalIncidentImportRequest`, `ValidationRunRequest`, `ValidationComparisonRecord`, `ValidationRunResponse`.

#### [NEW] [external_incident_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/external_incident_service.py)
- Ingests real-world incidents from public sources / Cerulean feeds and provides fallback import of GeoJSON/CSV.
- Pre-seeds verified high-confidence real-world reference incidents (e.g., MV Wakashio Mauritius, Dawn Kanchipuram Ennore/Chennai, Taylor Energy / Gulf of Mexico, Malacca Strait bilge dumping, Red Sea tanker spills).
- Normalizes all external incidents to the `EXTERNAL-REFERENCE` schema.

#### [MODIFY] [db_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/db_service.py)
- Add `external_incidents` and `validation_runs` SQLite tables.
- Add query, import, and retrieval methods filterable by bounding box and date range.

#### [MODIFY] [main.py](file:///c:/Users/dhanu/SIH7926/backend/app/main.py)
- Add endpoints:
  - `GET /api/v1/external-incidents`: List/filter external reference incidents.
  - `POST /api/v1/external-incidents/import`: Import GeoJSON/JSON reference records.
  - `POST /api/v1/external-incidents/seed`: Seed reference dataset.

---

### Phase 2: Validation Matching Logic

#### [NEW] [validation_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/validation_service.py)
- Compares AquaSentinel's own detections from `spills` table against `external_incidents` for an AOI and configurable time window (+/- 48h default) and spatial threshold (15 km default).
- Classifies each record into:
  - `MATCHED`: AquaSentinel detected the slick, and the external reference confirmed it.
  - `MISSED`: External source reported a spill in the monitored AOI, but AquaSentinel did not detect it (flagged false negative).
  - `UNVALIDATED_DETECTION`: AquaSentinel detected a candidate spill with no external reference record (flagged for manual review).
- Computes honest plain counts and summary statements.

#### [MODIFY] [main.py](file:///c:/Users/dhanu/SIH7926/backend/app/main.py)
- Add endpoints:
  - `POST /api/v1/validation/run`: Execute a validation matching run for an AOI and date range.
  - `GET /api/v1/validation/results`: Retrieve previous validation runs.

---

### Phase 3: Validation Dashboard UI

#### [NEW] [ValidationPage.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Pages/ValidationPage.tsx)
- Prominent header card explaining that this is a validation & credibility feature testing AquaSentinel's pipeline against public ground-truth incidents.
- Interactive Map showing:
  - AquaSentinel Detections (solid cyan/blue `#00f0ff` polygon).
  - External Reference Incidents (neutral amber/grey dashed outline tagged `EXTERNAL-REFERENCE`).
- Results table with match status badges (`MATCHED`, `MISSED`, `UNVALIDATED_DETECTION`), distance offsets, time deltas, and external source traceability links.
- "Re-run Validation" button + Preset / Date Selector.
- "Seed Reference Incidents" / "Import Incidents" modal.

#### [MODIFY] [Sidebar.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Navigation/Sidebar.tsx) & [App.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/App.tsx)
- Add `validation` to `AppPage` navigation items with a distinct icon (`CheckCircle2` / `ShieldCheck`).
- Route rendering for `ValidationPage`.

#### [MODIFY] [api.ts](file:///c:/Users/dhanu/SIH7926/frontend/src/services/api.ts) & [types](file:///c:/Users/dhanu/SIH7926/frontend/src/types/)
- Add API client calls and TypeScript types for `ExternalIncident`, `ValidationRunResponse`, etc.

---

### Phase 4: Copy Audit & Positioning Verification

#### [MODIFY] Copy across frontend & backend
- Review headers, modals, tooltips, and pitch copy to ensure Live AOI Monitoring is accurately positioned as:
  *"Automated continuous monitoring of newly available Sentinel-1 acquisitions over user-defined AOIs"* (never "24/7 real-time monitoring").
- Ensure no WebSocket/live-alert channel streams external reference incidents.

#### [NEW] [test_validation_module.py](file:///c:/Users/dhanu/SIH7926/backend/test_validation_module.py)
- Tests for:
  1. External incident ingestion and normalization (`EXTERNAL-REFERENCE` provenance).
  2. Database isolation (external incidents never inserted into `oil_spills`).
  3. Spatial & temporal matching logic asserting correct classification of `MATCHED`, `MISSED`, and `UNVALIDATED_DETECTION`.
  4. Real-world incident validation pass (e.g. Ennore, Wakashio, Mumbai High, Malacca Strait).

---

## Verification Plan

### Automated Backend Tests
- Run `test_validation_module.py` covering ingestion, database isolation, matching algorithms, and API endpoints.
- Run full backend test suite (`python -m unittest discover -s . -p "test_*.py"`) to ensure 0 regressions.

### Frontend Verification
- Open `http://localhost:5173`, navigate to the new **Incident Validation** page, execute a validation pass over Mumbai High, Malacca Strait, and Ennore, and verify visual rendering of comparison markers, match badges, and summary counts.
