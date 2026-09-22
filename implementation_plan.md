# Landsat 8 & Landsat 9 Satellite Integration Implementation Plan

This plan outlines the architecture and changes required to integrate **USGS / NASA Landsat 8 (OLI/TIRS)** and **Landsat 9 (OLI-2/TIRS-2)** satellites into AquaSentinel, alongside the existing **Copernicus Sentinel-1 (C-SAR)** and **Sentinel-2 (MSI)** pipelines.

---

## Architecture & Satellite Constellation Overview

| Satellite Platform | Sensor / Payload | Spatial Resolution | Key Spectral Bands & Radiometry | Role in AquaSentinel |
| :--- | :--- | :--- | :--- | :--- |
| **Sentinel-1 (A/B/C)** *(Copernicus)* | C-band Synthetic Aperture Radar (C-SAR) | 10m - 20m | VV/VH Microwave Backscatter (5.405 GHz) | **Primary Detection & Thickness**: Day/night, all-weather dark spot segmentation, backscatter contrast, GLCM texture. |
| **Sentinel-2 (A/B/C)** *(Copernicus)* | Multispectral Instrument (MSI) | 10m / 20m | B2 (Blue), B3 (Green), B4 (Red), B8 (NIR) | **High-Res Optical Cross-Check**: 10m true-color, NDWI/NDVI land masking, KMeans hue/color clustering & Bonn Agreement (BAOAC 1-5). |
| **Landsat 8** *(USGS / NASA)* | OLI (Operational Land Imager) + TIRS (Thermal Infrared) | 30m Optical / 100m Thermal | B2 (Blue), B3 (Green), B4 (Red), B5 (NIR), B10 (Thermal IR 10.6–11.19 µm) | **Optical & Thermal Radiometry**: Multi-spectral cross-validation + Thermal emissivity anomaly detection (solar absorption heating vs ambient sea). |
| **Landsat 9** *(USGS / NASA)* | OLI-2 + TIRS-2 | 30m Optical / 100m Thermal (14-bit radiometric precision) | B2 (Blue), B3 (Green), B4 (Red), B5 (NIR), B10 (Thermal IR 10.6–11.19 µm) | **Next-Gen Optical/Thermal Fusion**: 14-bit improved signal-to-noise ratio, reduces revisit interval when combined with S2 and L8 to ~2-3 days. |

---

## Key Benefits of Sentinel-1 + Sentinel-2 + Landsat-8 + Landsat-9 Constellation

1. **Drastically Reduced Optical Revisit Interval**: Combining Sentinel-2 (5-day revisit) with Landsat 8 and Landsat 9 (8-day offset, 16-day orbit) shortens optical revisit over any coastal/marine AOI to **~2.3 days average**, greatly reducing the probability that cloud cover prevents confirmation.
2. **Thermal Infrared Radiometry (TIRS Band 10)**: Landsat 8 and 9 measure surface brightness temperature ($ST\_B10$). Thick hydrocarbon emulsions absorb solar radiation differently than clean seawater, creating detectable thermal anomalies ($\Delta T \approx +0.8\text{K to }+3.2\text{K}$ during daytime solar heating, or slight evaporative cooling at night), providing a physical thickness cross-check.
3. **Multi-Mission Sensor Selection**: Users can choose **Auto (Best Available Scene)** or specifically target **Sentinel-2 MSI**, **Landsat 8 OLI/TIRS**, or **Landsat 9 OLI-2/TIRS-2**.

---

## Proposed Changes

### 1. Backend Schemas & Data Models

#### [MODIFY] [fusion.py](file:///c:/Users/dhanu/SIH7926/backend/app/schemas/fusion.py)
- Update `OpticalFusionRequest`:
  - `satellite_platform`: Optional enum/string (`"AUTO"`, `"SENTINEL_2"`, `"LANDSAT_8"`, `"LANDSAT_9"`). Default: `"AUTO"`.
  - `include_thermal`: Optional bool (enables Landsat TIRS Band 10 thermal radiometry analysis). Default: `True`.
- Add `ThermalTelemetry` model:
  - `brightness_temp_k`: Surface temperature over slick in Kelvin.
  - `ambient_sea_temp_k`: Ambient background sea surface temperature in Kelvin.
  - `thermal_contrast_k`: $\Delta T$ (slick temp - ambient sea temp).
  - `thermal_signature`: Human-readable interpretation (e.g., *"Solar absorption heating (+1.8K) indicates thick emulsified core"*).
- Update `OpticalConfirmationResponse`:
  - `satellite_platform`: Name of satellite used (`"Sentinel-2 MSI"`, `"Landsat 8 OLI/TIRS"`, `"Landsat 9 OLI-2/TIRS-2"`).
  - `sensor_name`: Sensor identifier (`"MSI"`, `"OLI"`, `"OLI-2"`, `"TIRS"`).
  - `scene_id`: Canonical product/granule ID (retains `sentinel2_scene_id` for backward compatibility).
  - `resolution_meters`: Ground spatial resolution (e.g. 10m for Sentinel-2, 30m for Landsat OLI).
  - `thermal_telemetry`: Optional `ThermalTelemetry` object populated when Landsat 8/9 is utilized.

---

### 2. Backend Services & GEE Engine

#### [MODIFY] [optical_fusion_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/optical_fusion_service.py)
- Support Earth Engine (GEE) collections for:
  - Sentinel-2: `COPERNICUS/S2_SR_HARMONIZED` (B2, B3, B4, B8)
  - Landsat 8: `LANDSAT/LC08/C02/T1_L2` (SR_B2, SR_B3, SR_B4, SR_B5, ST_B10)
  - Landsat 9: `LANDSAT/LC09/C02/T1_L2` (SR_B2, SR_B3, SR_B4, SR_B5, ST_B10)
- Add Landsat-specific spectral processing:
  - Landsat NDWI = $(SR\_B3_{green} - SR\_B5_{nir}) / (SR\_B3_{green} + SR\_B5_{nir})$
  - Landsat NDVI = $(SR\_B5_{nir} - SR\_B4_{red}) / (SR\_B5_{nir} + SR\_B4_{red})$
  - Landsat TIRS thermal processing: Kelvin surface temperature scaling ($ST\_B10 \times 0.00341802 + 149.0$) and thermal contrast $\Delta T$.
- Implement `AUTO` mode sensor ranking: searches across Sentinel-2, Landsat-8, and Landsat-9, choosing the lowest cloud-cover scene closest to the SAR detection time.
- Update realistic high-fidelity simulation engine to produce realistic Landsat 8/9 product IDs (e.g. `LC08_L2SP_148047_20260906_02_T1` and `LC09_L2SP_148047_20260904_02_T1`), 30m resolution reflectance distributions, and TIRS thermal radiometry.

#### [MODIFY] [db_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/db_service.py)
- Update `optical_confirmations` table schema to store `satellite_platform`, `scene_id`, and `thermal_telemetry_json`.
- Maintain backward compatibility for queries fetching `sentinel2_scene_id`.

#### [MODIFY] [evidence_service.py](file:///c:/Users/dhanu/SIH7926/backend/app/services/evidence_service.py)
- Record multi-satellite platform provenance (`Sentinel-2 MSI`, `Landsat 8 OLI/TIRS`, `Landsat 9 OLI-2/TIRS-2`) in the cryptographically chained evidence ledger.

#### [MODIFY] [main.py](file:///c:/Users/dhanu/SIH7926/backend/app/main.py)
- Update `/api/v1/fusion/{spill_id}` endpoint and docs to reflect multi-mission Sentinel & Landsat satellite constellation support.

---

### 3. Frontend UI & Multi-Sensor Visualizations

#### [MODIFY] [types/forensics.ts](file:///c:/Users/dhanu/SIH7926/frontend/src/types/forensics.ts)
- Add `ThermalTelemetry` interface.
- Update `OpticalConfirmationResult` with `satellite_platform`, `sensor_name`, `scene_id`, `resolution_meters`, `thermal_telemetry`.

#### [MODIFY] [services/api.ts](file:///c:/Users/dhanu/SIH7926/frontend/src/services/api.ts)
- Update `runOpticalFusion` to accept `satellite_platform` and `include_thermal` parameters.

#### [MODIFY] [DetectionFusionPage.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Pages/DetectionFusionPage.tsx)
- Add **Satellite Mission Selector**:
  - `Auto (Best Revisit)`
  - `Sentinel-2 MSI (10m · ESA)`
  - `Landsat 8 OLI/TIRS (30m+Thermal · USGS)`
  - `Landsat 9 OLI-2/TIRS-2 (30m+Thermal · USGS)`
- Add **Landsat Thermal Infrared (TIRS Band 10) Telemetry Panel**:
  - Displays Brightness Temperature ($K$ and $^\circ\text{C}$), Ambient Sea Temp, and Thermal Contrast ($\Delta T$).
  - Color-coded thermal emissivity status bar (indicating thick emulsified core heating vs thin sheen).
- Add Constellation Banner showcasing 4-satellite coverage: Sentinel-1 SAR + Sentinel-2 MSI + Landsat-8 + Landsat-9.

#### [MODIFY] [OpticalFusionPanel.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Forensics/OpticalFusionPanel.tsx)
- Integrate Satellite Selector dropdown/toggle (Auto, Sentinel-2, Landsat 8, Landsat 9).
- Render satellite badges (Copernicus ESA vs USGS NASA) and Thermal Infrared section when Landsat is selected or confirmed.

#### [MODIFY] [TopBar.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Navigation/TopBar.tsx) & [Sidebar.tsx](file:///c:/Users/dhanu/SIH7926/frontend/src/components/Navigation/Sidebar.tsx)
- Update satellite constellation status indicators to reflect Copernicus (Sentinel-1, Sentinel-2) & USGS (Landsat 8, Landsat 9) multi-sensor telemetry.

---

## Verification Plan

### Automated Tests
1. **Unit & Integration Tests**:
   - Run `python -m unittest test_optical_fusion.py` in `backend/`.
   - Add test cases in `test_optical_fusion.py` validating:
     - Landsat 8 OLI/TIRS optical + thermal fusion.
     - Landsat 9 OLI-2/TIRS-2 optical + thermal fusion.
     - Sentinel-2 MSI optical fusion.
     - `AUTO` multi-satellite scene selection.
     - Land masking (NDWI/NDVI) across Landsat 8/9 band definitions.
     - Database persistence and backward compatibility.
2. **Frontend Typecheck & Build**:
   - Run `npm run build` or `npx tsc --noEmit` in `frontend/` to verify zero TypeScript errors.

### Manual Verification
1. Launch AquaSentinel frontend & backend.
2. Navigate to **SAR & Optical Fusion** page.
3. Switch between **Auto**, **Sentinel-2**, **Landsat 8**, and **Landsat 9** satellite selectors and trigger Optical Fusion.
4. Verify that Landsat 8 and Landsat 9 display the 30m resolution metadata, band reflectance, and TIRS Thermal Infrared telemetry ($\Delta T$ and surface temp).
5. Verify that Bonn Agreement classification and hue clustering update accurately.
