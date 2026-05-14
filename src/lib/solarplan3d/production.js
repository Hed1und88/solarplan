const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(numberOr(value) * factor) / factor;
};

export const SWEDEN_MONTHLY_DISTRIBUTION = [0.02, 0.04, 0.08, 0.11, 0.13, 0.14, 0.14, 0.12, 0.09, 0.06, 0.04, 0.03];

export const calculateInstalledKwp = (panelGroups = [], panelModel = {}) => {
  const totalPanels = panelGroups.reduce((sum, group) => sum + numberOr(group.panelCount), 0);
  const installedKwp = (totalPanels * numberOr(panelModel.powerWp)) / 1000;
  return {
    totalPanels,
    installedKwp: round(installedKwp, 3),
  };
};

export const calculateWeatherLoss = (weather) => ({
  sunny: 0,
  light_clouds: 15,
  cloudy: 45,
  rain: 70,
}[weather] ?? 0);

export const calculateTemperatureLoss = (tempC, panelTempCoeffPmaxPercentPerC = -0.35) => {
  const deltaC = numberOr(tempC, 25) - 25;
  const productionChangePercent = deltaC * numberOr(panelTempCoeffPmaxPercentPerC, -0.35);
  const lossPercent = -productionChangePercent;
  return round(Math.max(-5, Math.min(35, lossPercent)), 1);
};

export const calculateProductionEstimate = ({
  panelGroups = [],
  panelModel = {},
  specificYieldKwhPerKwpYear = 900,
  shadingLossPercent = 0,
  weather,
  ambientTempC = 25,
}) => {
  const { totalPanels, installedKwp } = calculateInstalledKwp(panelGroups, panelModel);
  const weatherLossPercent = calculateWeatherLoss(weather);
  const temperatureLossPercent = calculateTemperatureLoss(ambientTempC, panelModel?.['tempCoeffPmaxPercentPerC']);
  const specificYield = Math.max(0, numberOr(specificYieldKwhPerKwpYear, 900));
  const shadingLoss = Math.max(0, Math.min(100, numberOr(shadingLossPercent)));
  const weatherLoss = Math.max(0, Math.min(100, weatherLossPercent));
  const temperatureLoss = Math.max(-5, Math.min(100, temperatureLossPercent));
  const grossAnnualKwh = installedKwp * specificYield;
  const annualKwh = grossAnnualKwh
    * (1 - shadingLoss / 100)
    * (1 - weatherLoss / 100)
    * (1 - temperatureLoss / 100);
  const monthlyKwh = SWEDEN_MONTHLY_DISTRIBUTION.map((share) => round(annualKwh * share, 0));

  return {
    totalPanels,
    installedKwp,
    specificYieldKwhPerKwpYear: specificYield,
    grossAnnualKwh: round(grossAnnualKwh, 0),
    annualKwh: round(annualKwh, 0),
    monthlyKwh,
    shadingLossPercent: round(shadingLoss, 1),
    weatherLossPercent: round(weatherLoss, 1),
    temperatureLossPercent: round(temperatureLoss, 1),
    netAfterLossesKwh: round(annualKwh, 0),
  };
};
