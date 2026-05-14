const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(numberOr(value) * factor) / factor;
};

const overlaps = (a, b) => (
  a.xM < b.xM + b.widthM &&
  a.xM + a.widthM > b.xM &&
  a.yM < b.yM + b.heightM &&
  a.yM + a.heightM > b.yM
);

export const zoneOutsideRoof = (zone, roofSurface) => (
  numberOr(zone.xM) < 0 ||
  numberOr(zone.yM) < 0 ||
  numberOr(zone.xM) + numberOr(zone.widthM) > numberOr(roofSurface.widthM) ||
  numberOr(zone.yM) + numberOr(zone.heightM) > numberOr(roofSurface.heightM)
);

export const calculateExcludedAreaM2 = (roofSurface) => {
  const roofArea = numberOr(roofSurface.widthM) * numberOr(roofSurface.heightM);
  const excludedArea = (roofSurface.excludedZones || []).reduce((sum, zone) => {
    if (zoneOutsideRoof(zone, roofSurface)) return sum;
    return sum + Math.max(0, numberOr(zone.widthM) * numberOr(zone.heightM));
  }, 0);
  return Math.min(roofArea, excludedArea);
};

export const calculateUsableRoofAreaM2 = (roofSurface) => {
  const grossArea = numberOr(roofSurface.widthM) * numberOr(roofSurface.heightM);
  return round(Math.max(0, grossArea * 0.82 - calculateExcludedAreaM2(roofSurface)), 1);
};

export const getPanelDimensionsM = (panelModel, orientation) => {
  const width = numberOr(panelModel.widthMm, 1134) / 1000;
  const height = numberOr(panelModel.heightMm, 1722) / 1000;
  return orientation === 'landscape'
    ? { widthM: height, heightM: width }
    : { widthM: width, heightM: height };
};

export const autoPlacePanels = ({ roofSurface, panelModel, settings }) => {
  const orientation = settings.orientation || 'portrait';
  const { widthM: panelWidthM, heightM: panelHeightM } = getPanelDimensionsM(panelModel, orientation);
  const spacingM = numberOr(settings.spacingMm, 30) / 1000;
  const edgeM = numberOr(settings.edgeMarginMm, 300) / 1000;
  const startXM = Math.max(edgeM, numberOr(settings.startXM, edgeM));
  const startYM = Math.max(edgeM, numberOr(settings.startYM, edgeM));
  const usableWidth = numberOr(roofSurface.widthM) - edgeM - startXM;
  const usableHeight = numberOr(roofSurface.heightM) - edgeM - startYM;
  const columns = Math.max(0, Math.floor((usableWidth + spacingM) / (panelWidthM + spacingM)));
  const rows = Math.max(0, Math.floor((usableHeight + spacingM) / (panelHeightM + spacingM)));
  const panels = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const panel = {
        id: `p-${row + 1}-${column + 1}`,
        row: row + 1,
        column: column + 1,
        xM: round(startXM + column * (panelWidthM + spacingM), 3),
        yM: round(startYM + row * (panelHeightM + spacingM), 3),
        widthM: round(panelWidthM, 3),
        heightM: round(panelHeightM, 3),
      };
      const blocked = (roofSurface.excludedZones || []).some((zone) => !zoneOutsideRoof(zone, roofSurface) && overlaps(panel, zone));
      if (!blocked) panels.push(panel);
    }
  }

  const panelCount = panels.length;
  const usedAreaM2 = round(panelCount * panelWidthM * panelHeightM, 2);
  return {
    rows,
    columns,
    panelCount,
    usedAreaM2,
    panels,
  };
};

