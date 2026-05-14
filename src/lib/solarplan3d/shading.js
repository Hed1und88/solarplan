const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const degToRad = (deg) => (Number(deg) * Math.PI) / 180;
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(numberOr(value) * factor) / factor;
};

export const approximateSunPosition = ({ month = 6, hour = 12 }) => {
  const monthNumber = Math.max(1, Math.min(12, numberOr(month, 6)));
  const hourNumber = Math.max(4, Math.min(22, numberOr(hour, 12)));
  const seasonalAltitude = 18 + Math.sin(((monthNumber - 3) / 12) * Math.PI * 2) * 32;
  const hourOffset = Math.abs(hourNumber - 12);
  const altitudeDeg = Math.max(5, seasonalAltitude - hourOffset * 5);
  const azimuthDeg = (180 + (hourNumber - 12) * 15 + 360) % 360;
  return {
    altitudeDeg: round(altitudeDeg, 0),
    azimuthDeg: round(azimuthDeg, 0),
    vector: {
      x: Math.sin(degToRad(azimuthDeg)),
      y: Math.cos(degToRad(azimuthDeg)),
    },
  };
};

const panelCenter = (panel) => ({
  xM: numberOr(panel.xM) + numberOr(panel.widthM) / 2,
  yM: numberOr(panel.yM) + numberOr(panel.heightM) / 2,
});

export const calculateIndicativeShading = ({ panelGroups = [], obstacles = [], month = 6, hour = 12 }) => {
  const sun = approximateSunPosition({ month, hour });
  const affectedPanels = [];
  const relevantObstacles = obstacles.filter((obstacle) => obstacle.shadowRelevant !== false);
  const roofPanels = panelGroups.flatMap((group) => (group.panels || []).map((panel) => ({ ...panel, groupId: group.id, roofSurfaceId: group.roofSurfaceId })));

  relevantObstacles.forEach((obstacle) => {
    const shadowLength = Math.max(0.8, numberOr(obstacle.heightM, 1) / Math.tan(degToRad(Math.max(8, sun.altitudeDeg))));
    const shadow = {
      xM: numberOr(obstacle.xM) - sun.vector.x * shadowLength,
      yM: numberOr(obstacle.yM) - sun.vector.y * shadowLength,
      widthM: Math.max(numberOr(obstacle.widthM, 0.5), numberOr(obstacle.depthM, 0.5)) + Math.abs(sun.vector.x) * shadowLength,
      heightM: Math.max(numberOr(obstacle.depthM, 0.5), numberOr(obstacle.widthM, 0.5)) + Math.abs(sun.vector.y) * shadowLength,
    };

    roofPanels
      .filter((panel) => panel.roofSurfaceId === obstacle.roofSurfaceId)
      .forEach((panel) => {
        const center = panelCenter(panel);
        const inShadow = center.xM >= shadow.xM &&
          center.xM <= shadow.xM + shadow.widthM &&
          center.yM >= shadow.yM &&
          center.yM <= shadow.yM + shadow.heightM;
        if (inShadow) affectedPanels.push({ panelId: panel.id, groupId: panel.groupId, obstacleId: obstacle.id });
      });
  });

  const uniqueAffected = new Set(affectedPanels.map((panel) => `${panel.groupId}:${panel.panelId}`));
  const panelCount = roofPanels.length;
  const shadingLossPercent = panelCount ? Math.min(35, round((uniqueAffected.size / panelCount) * 22, 1)) : 0;

  return {
    label: 'Indikativ skuggningsanalys - kräver verifiering på plats',
    sun,
    affectedPanelCount: uniqueAffected.size,
    totalPanelCount: panelCount,
    shadingLossPercent,
    affectedPanels,
    messages: uniqueAffected.size
      ? [`${uniqueAffected.size} av ${panelCount} paneler ligger indikativt i skuggzon.`]
      : ['Inga paneler flaggades i den förenklade skuggningskontrollen.'],
  };
};

