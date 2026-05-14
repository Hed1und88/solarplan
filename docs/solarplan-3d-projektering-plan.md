# SolarPlan 3D Projektering - implementation plan

This plan prepares the `solarplan` GitHub repository for a future feature called **SolarPlan 3D Projektering**. All future work must stay inside the `solarplan` repository. Do not modify Base44 outside this repo, do not connect to Base44 Builder, and do not treat Base44 as the source of truth for feature design.

## Current app architecture summary

- Framework: Vite + React 18, JSX, Tailwind CSS, Radix UI/shadcn-style components, React Router, TanStack Query, Recharts, Framer Motion, lucide-react.
- Package manager: npm, with `package-lock.json`.
- Entry points: `src/main.jsx` renders `src/App.jsx`.
- Routing: `src/App.jsx` uses `BrowserRouter`, `Routes`, and nested routes under `src/components/Layout.jsx`.
- Main routes:
  - `/` -> `src/pages/Dashboard.jsx`
  - `/projects` -> `src/pages/Projects.jsx`
  - `/projects/:id` -> `src/pages/ProjectDetail.jsx`
  - `/solar-shadow`, `/solanalys`, `/3d-solanalys` -> `src/pages/SolarShadowAnalysis.jsx`
  - `/products` -> `src/pages/Products.jsx`
  - `/settings` -> `src/pages/Settings.jsx`
- Navigation: `src/components/Layout.jsx` exposes sidebar/mobile nav and already links `3D Solanalys` to `/solar-shadow`.
- Data access: `src/api/base44Client.js` creates a Base44 SDK client from `src/lib/app-params.js`. Current app code reads/writes `base44.entities.Project`, `base44.entities.Product`, invokes `base44.functions.invoke('solarData')`, and uploads files through Base44 integrations.
- Existing data definitions inside the repo:
  - `base44/entities/Project.jsonc`
  - `base44/entities/Product.jsonc`
  These are useful read-only context for current fields. Future feature implementation should prefer repo-local app code and should not require editing external Base44 systems.
- Existing build output/dependencies: `dist/` and `node_modules/` are present.

## Existing SolarPlan 3D analysis area

The current 3D analysis area exists at:

- Page: `src/pages/SolarShadowAnalysis.jsx`
- Routes: `/solar-shadow`, `/solanalys`, `/3d-solanalys`
- Calculation utilities: `src/lib/solarShadowEngine.js`
- External site/weather helper: `src/lib/geoDataServices.js`

Current behavior:

- Stores a standalone parametric house/roof/panel/shading model in React state.
- Provides simplified 3D/technical SVG visualization rather than a full Three.js scene.
- Saves standalone analysis only to browser `localStorage` key `solarplan_3d_solar_analysis_v3`.
- Exports analysis as JSON.
- Can fetch site data through `fetchSolarPlanSiteData`.
- Is separate from the project-detail workflow and does not write to a Project record.

## Existing project workflow and persistence

Primary project detail page:

- `src/pages/ProjectDetail.jsx`

Current project tabs:

- `Paneler`: `src/components/project/SolarRoofPlanner.jsx`
- `Slingor`: `src/components/project/StringMarkingTab.jsx`
- `Batteri`: `src/components/project/BatteryTab.jsx`
- `Produkter`: `src/components/project/ProductSelectionTab.jsx`
- `Soldata`: `src/components/project/SolarDataPanel.jsx`
- `Enlinje`: `src/components/project/SingleLineSchemaTab.jsx`
- `Montage`: `src/components/project/SolarRoofPlanner.jsx` and `src/components/project/MountingSystemCalculator.jsx`

Project save/load logic:

- Project list: `src/pages/Projects.jsx` calls `base44.entities.Project.list('-created_date')`.
- New project: `src/components/projects/NewProjectModal.jsx` calls `base44.entities.Project.create(form)`.
- Project detail load: `src/pages/ProjectDetail.jsx` calls `base44.entities.Project.list().then(ps => ps.find(p => p.id === id))`.
- Project updates: `src/pages/ProjectDetail.jsx` defines `saveProject(data)` around `base44.entities.Project.update(id, data)` with React Query optimistic cache updates.
- Most project components receive `project` and `onUpdate`, then persist JSON strings or arrays through `onUpdate`.
- `SolarRoofPlanner.jsx` also writes a local backup using key `solarplan:project:${projectId}:solar_roof_planner_data`.

Current persisted Project fields used by PV workflow:

- Basic: `name`, `customer_name`, `address`, `status`, `notes`.
- Roof/layout: `roof_width_m`, `roof_height_m`, `roof_image_url`, `panel_layout_data`, `solar_roof_planner_data`.
- Strings/electrical: `string_layout_data`.
- Battery: `battery_image_url`, `battery_layout_data`.
- Mounting: `mounting_data`.
- Production: `solar_data`.
- Products/economy: `selected_products`, `total_cost`.

## Existing calculation utilities

- `src/lib/solarShadowEngine.js`
  - `calculateSolarPosition`
  - `calculateWeatherFactor`
  - `calculateShadeLoss`
  - `calculatePvEstimate`
  - `generateHourlySimulation`
  - `calculateRoofAreas`
  - `calculatePanelLayout`
  - `annualFactorFromDate`
- `src/components/AdvancedStringCalculator.jsx`
  - Maps Product entities into panel/inverter electrical data.
  - Validates panel/inverter data.
  - Simulates string voltage/current/power and MPPT checks.
- `src/components/project/StringMarkingTab.jsx`
  - Builds panel maps from `solar_roof_planner_data` or legacy `panel_layout_data`.
  - Normalizes panel/inverter Product data.
  - Simulates string compatibility per MPPT/string.
- `src/components/project/SolarDataPanel.jsx`
  - Fetches PVGIS/Forecast data through the `solarData` function.
  - Calculates simplified monthly energy balance with optional battery.
- `src/components/project/MountingSystemCalculator.jsx`
  - Calculates mounting quantities and stores `mounting_data`.

## Existing panel, inverter, and project data models

Project model is currently implicit in UI code plus `base44/entities/Project.jsonc`. Many structured submodels are stored as JSON strings on Project fields.

Product model supports:

- Categories: `solpanel`, `batteri`, `vaxelriktare`, `optimerare`, `kabel`, `montagesystem`, `ovrigt`.
- Panel fields: `power_watts`, `width_mm`, `height_mm`, `voc_v`, `isc_a`, `vmp_v`, `imp_a`, `temp_coeff_pmax_percent_c`, `temp_coeff_voc_percent_c`, `temp_coeff_isc_percent_c`, `noct_c`, `bifacial`.
- Inverter fields: `max_dc_power_kw`, `max_dc_voltage_v`, `startup_voltage_v`, `mppt_voltage_min_v`, `mppt_voltage_max_v`, `nominal_dc_voltage_v`, `mppt_count`, `strings_per_mppt`, `max_input_current_a`, `max_short_circuit_current_a`, `battery_supported`, `phase_type`, `inverter_type`.

## Proposed feature shape

SolarPlan 3D Projektering should become a project-attached workflow with these steps:

1. Projekt
2. Byggnad
3. Takytor
4. Paneler
5. Hinder & skuggning
6. Vaxelriktare & strangar
7. Produktion
8. Ekonomi
9. Rapport

The first implementation should not replace existing tabs immediately. It should add a new project-level workflow shell and progressively reuse or migrate existing modules.

## Proposed UI structure

New or changed files by phase:

Phase 1 - workflow shell:

- Change `src/pages/ProjectDetail.jsx`
  - Add a new tab or primary action for `3D Projektering`.
  - Pass `project`, `products`, and `onUpdate` into the new workflow.
- Add `src/components/project/three-d/Project3DWorkflow.jsx`
  - Own step navigation and workflow state.
  - Read/write a single project-scoped JSON payload.
- Add `src/components/project/three-d/steps/ProjectStep.jsx`
- Add `src/components/project/three-d/steps/BuildingStep.jsx`
- Add `src/components/project/three-d/steps/RoofSurfacesStep.jsx`
- Add `src/components/project/three-d/steps/PanelsStep.jsx`
- Add `src/components/project/three-d/steps/ObstaclesShadingStep.jsx`
- Add `src/components/project/three-d/steps/InvertersStringsStep.jsx`
- Add `src/components/project/three-d/steps/ProductionStep.jsx`
- Add `src/components/project/three-d/steps/EconomyStep.jsx`
- Add `src/components/project/three-d/steps/ReportStep.jsx`
- Add `src/components/project/three-d/WorkflowStepper.jsx`
- Add `src/components/project/three-d/WorkflowSummaryPanel.jsx`

Phase 2 - project-attached 3D model:

- Extract reusable pieces from `src/pages/SolarShadowAnalysis.jsx` into components under `src/components/project/three-d/`.
- Add `src/components/project/three-d/Project3DScene.jsx`.
- Add `src/components/project/three-d/BuildingModelControls.jsx`.
- Add `src/components/project/three-d/RoofSurfaceEditor.jsx`.
- Keep `/solar-shadow` as standalone analysis until the project-attached workflow is stable.

Phase 3 - calculations:

- Add `src/lib/solarplan3d/model.js` for defaults, migrations, validation helpers.
- Add `src/lib/solarplan3d/roofGeometry.js` for roof surfaces, slope planes, usable area, setbacks.
- Add `src/lib/solarplan3d/panelLayout.js` for panel placement, collision checks, row/column packing.
- Add `src/lib/solarplan3d/shading.js` for obstacles, sun path samples, annual shade factors.
- Add `src/lib/solarplan3d/stringing.js` for MPPT/string grouping and electrical checks.
- Add `src/lib/solarplan3d/production.js` for monthly/annual production estimates.
- Add `src/lib/solarplan3d/economy.js` for equipment totals, incentives, payback, LCOE-style summaries.
- Add `src/lib/solarplan3d/report.js` for report-ready summaries consumed by `ProjectPDFExport`.

Phase 4 - report/export integration:

- Change `src/components/project/ProjectPDFExport.jsx` to include SolarPlan 3D Projektering data when present.
- Optionally change `src/components/project/SingleLineSchemaTab.jsx` to generate an initial single-line schema from new stringing data.
- Optionally change `src/components/project/ProductSelectionTab.jsx` to sync bill-of-material quantities from the 3D workflow.

## Proposed data model

Store one versioned JSON payload on Project, ideally a new field when the backend/schema supports it:

- Preferred future field: `solarplan_3d_projektering_data`
- Interim repo-only fallback if no new field is available: store under an existing JSON field with a namespaced key only after verifying compatibility, for example `solar_roof_planner_data.solarplan3d`.

Proposed payload:

```json
{
  "version": 1,
  "workflow": {
    "currentStep": "projekt",
    "completedSteps": []
  },
  "project": {
    "name": "",
    "customerName": "",
    "address": "",
    "coordinates": { "lat": null, "lon": null },
    "status": "planering"
  },
  "building": {
    "type": "villa",
    "lengthM": 12,
    "widthM": 8,
    "eavesHeightM": 4.2,
    "ridgeHeightM": 6.3,
    "rotationDeg": 180
  },
  "roofSurfaces": [
    {
      "id": "roof-1",
      "name": "Tak 1",
      "type": "sadeltak-plane",
      "azimuthDeg": 180,
      "pitchDeg": 27,
      "widthM": 8,
      "heightM": 6,
      "setbacksM": { "top": 0.3, "right": 0.3, "bottom": 0.3, "left": 0.3 },
      "material": "takpannor"
    }
  ],
  "panels": {
    "selectedProductId": "",
    "groups": [
      {
        "id": "group-1",
        "roofSurfaceId": "roof-1",
        "orientation": "portrait",
        "rows": 3,
        "columns": 8,
        "panelIds": [],
        "layout": []
      }
    ]
  },
  "obstacles": [
    {
      "id": "obstacle-1",
      "roofSurfaceId": "roof-1",
      "type": "chimney",
      "xM": 2,
      "yM": 2,
      "widthM": 0.6,
      "lengthM": 0.6,
      "heightM": 1.2
    }
  ],
  "shading": {
    "annualLossPercent": null,
    "monthlyLossPercent": []
  },
  "inverters": [
    {
      "id": "inverter-1",
      "productId": "",
      "mppts": []
    }
  ],
  "strings": [
    {
      "id": "string-1",
      "inverterId": "inverter-1",
      "mppt": 1,
      "panelIds": [],
      "electricalCheck": {}
    }
  ],
  "production": {
    "installedKwp": 0,
    "annualKwh": null,
    "monthlyKwh": [],
    "specificYieldKwhPerKwp": null
  },
  "economy": {
    "equipmentCostSek": 0,
    "installationCostSek": 0,
    "totalCostSek": 0,
    "annualSavingsSek": 0,
    "paybackYears": null
  },
  "report": {
    "notes": "",
    "includeSections": []
  }
}
```

## Proposed persistence approach

- Keep a single project-level JSON payload for the full workflow to avoid scattering step state across many fields.
- Add read/write helpers in `src/lib/solarplan3d/model.js`:
  - `createDefaultProject3DData(project)`
  - `parseProject3DData(project)`
  - `serializeProject3DData(data)`
  - `migrateProject3DData(data)`
  - `mergeProject3DPatch(current, patch)`
- Save through the existing `onUpdate` callback from `ProjectDetail.jsx`, so optimistic React Query cache behavior stays centralized.
- Keep a localStorage draft backup per project only as a recovery mechanism, using a namespaced key such as `solarplan:project:${projectId}:solarplan_3d_projektering_data:draft`.
- During migration, read existing `solar_roof_planner_data`, `panel_layout_data`, `string_layout_data`, `solar_data`, and `selected_products` as import sources, but do not silently overwrite them until the user saves or confirms migration.

## Proposed calculation modules

- `roofGeometry.js`: roof planes, active/usable areas, ridge/eaves geometry, setbacks, obstacle collision bounds.
- `panelLayout.js`: panel physical size from Product, portrait/landscape packing, manual overrides, collision/outside-roof warnings.
- `shading.js`: reuse `calculateSolarPosition` from `src/lib/solarShadowEngine.js`, then add roof-surface-aware obstacle shadows and monthly/annual samples.
- `stringing.js`: reuse logic from `AdvancedStringCalculator.jsx` and `StringMarkingTab.jsx`; expose pure functions for validation and MPPT assignment.
- `production.js`: use PVGIS/Forecast when available through existing `SolarDataPanel` pattern; otherwise provide deterministic fallback estimate from local model.
- `economy.js`: derive costs from Product prices, selected quantities, installation assumptions, self-consumption inputs, and battery option.
- `report.js`: convert workflow state into compact report sections and export-friendly tables.

## Test/build commands discovered

From `package.json`:

- `npm run dev` -> `vite`
- `npm run build` -> `vite build`
- `npm run lint` -> `eslint . --quiet`
- `npm run lint:fix` -> `eslint . --fix`
- `npm run typecheck` -> `tsc -p ./jsconfig.json`
- `npm run preview` -> `vite preview`

Recommended verification for each future phase:

1. `npm run lint`
2. `npm run build`
3. `npm run typecheck` if TypeScript/jsconfig issues are in scope

## Risks and missing dependencies

- The app currently depends on Base44 SDK calls for Project/Product persistence. Future implementation must stay in the GitHub repo and avoid external Base44 Builder changes unless explicitly approved.
- The current package name is `base44-app`, and `@base44/vite-plugin` is configured in `vite.config.js`. This should be treated as existing infrastructure, not the feature source of truth.
- There is no automated test runner script in `package.json`; only lint, typecheck, build, dev, and preview are available.
- Three.js is installed, but `@react-three/fiber` and `@react-three/drei` are not installed. If a true interactive 3D scene is needed, either implement directly with `three` or add React Three dependencies inside this repo in a later phase.
- Several UI strings show mojibake/encoding artifacts in existing files, especially Swedish characters. New files should use clean UTF-8 or ASCII consistently.
- Current 3D analysis stores only local standalone data and is not attached to a Project.
- Current Project fields store many nested models as JSON strings; migration and backward compatibility need careful parsing and versioning.
- Existing calculation logic is mixed into UI components. Extract pure functions before expanding complexity.
- Production estimates are simplified; professional-grade output will require clear assumptions and disclaimers unless validated against external sources.

## Next recommended implementation step

Implement Phase 1: create a project-attached `Project3DWorkflow` shell with the nine steps, backed by a versioned payload parser/serializer in `src/lib/solarplan3d/model.js`. Reuse current Project/Product loading and `onUpdate` from `ProjectDetail.jsx`, but avoid changing existing tabs' behavior until the shell can save and reload its own draft safely.

