# SolarPlan – icke-destruktiv filgranskning

Datum: 2026-06-25

Ingen fil har tagits bort. Granskningen kördes fem gånger från `src/main.jsx` och `src/App.jsx`. Samtliga fem körningar gav samma kandidatlista; endast rapporternas tidsstämpel skilde sig.

## Verifieringsmetoder

1. Importgraf från de aktiva startpunkterna.
2. Kontroll av filer utan inkommande statisk referens.
3. Korsning av kontroll 1 och 2 för starkare kandidater.
4. Kontroll av dubbla `.js`/`.jsx`/`.ts`/`.tsx`-basnamn.
5. Kontroll av filnamn som antyder äldre eller alternativa versioner.

Produktionens Vite-bygge kördes separat fem gånger och lyckades fem av fem gånger.

## Resultat

- Totalt analyserade filer i `src`: **205**
- Statiskt nåbara från aktiva startpunkter: **114**
- Filer i både kategorin onåbar och utan inkommande statisk referens: kandidaterna nedan

## Starkare kandidater för manuell granskning

- `src/components/ProtectedRoute.jsx`
- `src/components/kalkylator/KalkylatornSummary.jsx`
- `src/components/kalkylator/RoofCanvas.jsx`
- `src/components/kalkylator/RoofControls.jsx`
- `src/components/layout/AppLayout.jsx`
- `src/components/products/ProductForm.jsx`
- `src/components/project/BatteryEditor.jsx`
- `src/components/project/InverterFullSummary.jsx`
- `src/components/project/PanelMapTraceWorkspace.jsx`
- `src/components/project/PanelPlacementTab.jsx`
- `src/components/project/ProductSelector.jsx`
- `src/components/project/ProjectStringSimulator.jsx`
- `src/components/project/RoofPanelCanvas.jsx`
- `src/components/project/RoofPanelEditor.jsx`
- `src/components/project/SingleLineSchemaTab.jsx`
- `src/components/project/SolarDataPanel.jsx`
- `src/components/project/SolarPlan3DLiveSiteDataShell.jsx`
- `src/components/project/SolarRoofPlanner.jsx`
- `src/components/project/StringDrawingCanvas.jsx`
- `src/components/project/StringEditor.jsx`
- `src/components/project/StringMarkingEntryDirect.jsx`
- `src/components/project/StringMarkingInsideSettings.jsx`
- `src/components/project/StringMarkingTab.jsx`
- `src/components/project/StringMarkingTabV2.jsx`
- `src/components/project/StringMarkingTabV3.jsx`
- `src/components/project/StringMarkingTabV4.jsx`
- `src/components/project/StringMarkingTabV5.jsx`
- `src/components/project/StringMarkingTabV6.jsx`
- `src/components/project/StringMarkingTabV7.jsx`
- `src/components/project/StringMarkingTabV7External.jsx`
- `src/components/project/StringMarkingTabV8.jsx`
- `src/components/project/StringMarkingTabV9.jsx`
- `src/components/project/StringMarkingWorkspace.jsx`
- `src/data/productImageManifest.js`
- `src/lib/flow/flowAssembly.js`
- `src/lib/flow/flowValidation.js`
- `src/lib/geoDataServices.js`
- `src/lib/mountingEngines/nordmountSelfTest.js`
- `src/lib/solarShadowEngine.js`
- `src/lib/solarplan3d/multiImage3dClient.js`
- `src/lib/solarplan3d/openSourceGeoConfig.js`
- `src/pages/AdvancedStringCalculatorPage.jsx`
- `src/pages/Kalkylator.jsx`
- `src/pages/NewProject.jsx`
- `src/utils/index.ts`

## Dubbla basnamn – särskilt hög risk i Base44

- `src/components/project/AutoSingleLineSchemaTab.js`
- `src/components/project/AutoSingleLineSchemaTab.jsx`
- `src/components/project/InverterFullSummary.js`
- `src/components/project/InverterFullSummary.jsx`
- `src/components/project/StringMarkingTabV7.js`
- `src/components/project/StringMarkingTabV7.jsx`

Dessa ska inte tas bort innan den faktiskt importerade filen, Base44-synken och den renderade komponenten har verifierats var för sig.

## Versionsnamn som kräver kontroll

- `src/components/project/BatteryPlannerV3.jsx`
- `src/components/project/InverterFullSummaryV2.jsx`
- `src/components/project/SolarDataPanelV2.jsx`
- `src/components/project/SolarRoofPlannerV2.jsx`
- `src/components/project/StringMarkingTabV2.jsx`
- `src/components/project/StringMarkingTabV3.jsx`
- `src/components/project/StringMarkingTabV4.jsx`
- `src/components/project/StringMarkingTabV5.jsx`
- `src/components/project/StringMarkingTabV6.jsx`
- `src/components/project/StringMarkingTabV7.js`
- `src/components/project/StringMarkingTabV7.jsx`
- `src/components/project/StringMarkingTabV8.jsx`
- `src/components/project/StringMarkingTabV9.jsx`
- `src/pages/ProductsV2.jsx`

## Begränsning

En statisk importgraf kan inte bevisa att en fil aldrig används. Dynamiska importer, strängbaserade anrop och Base44-specifik laddning kan undgå analysen. Därför är alla poster kandidater, inte godkända raderingsobjekt.
