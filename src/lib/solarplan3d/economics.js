const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(numberOr(value) * factor) / factor;
};

export const calculatePaybackYears = (investmentSek, annualBenefitSek) => {
  const benefit = numberOr(annualBenefitSek);
  if (benefit <= 0) return 0;
  return round(numberOr(investmentSek) / benefit, 1);
};

export const calculateBatterySelfConsumptionImpact = ({
  includeBattery = false,
  baseSelfConsumptionPercent = 50,
  increasePercent = 0,
}) => {
  const base = Math.max(0, Math.min(100, numberOr(baseSelfConsumptionPercent, 50)));
  const increase = includeBattery ? Math.max(0, numberOr(increasePercent)) : 0;
  return {
    baseSelfConsumptionPercent: round(base, 1),
    increasedSelfConsumptionPercent: round(increase, 1),
    adjustedSelfConsumptionPercent: round(Math.min(100, base + increase), 1),
  };
};

export const calculateSolarEconomics = ({
  annualProductionKwh = 0,
  annualElectricityConsumptionKwh = 0,
  electricityPriceSekKwh = 1.5,
  gridFeeSekKwh = 0,
  taxesAndFeesSekKwh = 0,
  sellPriceSekKwh = 0.5,
  selfConsumptionPercent = 50,
  systemCostSek = 0,
  greenDeductionSek = 0,
  includeBattery = false,
  batteryCostSek = 0,
  batterySelfConsumptionIncreasePercent = 0,
}) => {
  const annualProduction = Math.max(0, numberOr(annualProductionKwh));
  const annualConsumption = Math.max(0, numberOr(annualElectricityConsumptionKwh));
  const totalElectricityCostSekKwh = Math.max(0, numberOr(electricityPriceSekKwh) + numberOr(gridFeeSekKwh) + numberOr(taxesAndFeesSekKwh));
  const batteryImpact = calculateBatterySelfConsumptionImpact({
    includeBattery,
    baseSelfConsumptionPercent: selfConsumptionPercent,
    increasePercent: batterySelfConsumptionIncreasePercent,
  });
  const selfConsumedKwh = Math.min(annualProduction * (batteryImpact.adjustedSelfConsumptionPercent / 100), annualConsumption || annualProduction);
  const soldSurplusKwh = Math.max(0, annualProduction - selfConsumedKwh);
  const selfConsumptionSavingsSek = selfConsumedKwh * totalElectricityCostSekKwh;
  const soldElectricityRevenueSek = soldSurplusKwh * Math.max(0, numberOr(sellPriceSekKwh));
  const totalSolarBenefitSek = selfConsumptionSavingsSek + soldElectricityRevenueSek;
  const netSystemCostSek = Math.max(0, numberOr(systemCostSek) + (includeBattery ? numberOr(batteryCostSek) : 0) - numberOr(greenDeductionSek));

  return {
    annualProductionKwh: round(annualProduction, 0),
    annualElectricityConsumptionKwh: round(annualConsumption, 0),
    totalElectricityCostSekKwh: round(totalElectricityCostSekKwh, 2),
    selfConsumptionPercent: batteryImpact.baseSelfConsumptionPercent,
    adjustedSelfConsumptionPercent: batteryImpact.adjustedSelfConsumptionPercent,
    selfConsumedKwh: round(selfConsumedKwh, 0),
    soldSurplusKwh: round(soldSurplusKwh, 0),
    selfConsumptionSavingsSek: round(selfConsumptionSavingsSek, 0),
    soldElectricityRevenueSek: round(soldElectricityRevenueSek, 0),
    totalSolarBenefitSek: round(totalSolarBenefitSek, 0),
    netSystemCostSek: round(netSystemCostSek, 0),
    annualSavingsSek: round(totalSolarBenefitSek, 0),
    paybackYears: calculatePaybackYears(netSystemCostSek, totalSolarBenefitSek),
    batteryImpact,
  };
};

export const calculateHeatPumpReplacementSavings = ({
  currentHeatingConsumptionKwh = 0,
  currentCOP = 1,
  newCOP = 3,
  electricityCostSekKwh = 1.5,
  investmentSek = 0,
}) => {
  const currentConsumption = Math.max(0, numberOr(currentHeatingConsumptionKwh));
  const oldCop = Math.max(0.1, numberOr(currentCOP, 1));
  const replacementCop = Math.max(0.1, numberOr(newCOP, 3));
  const newConsumption = currentConsumption * (oldCop / replacementCop);
  const savedKwh = Math.max(0, currentConsumption - newConsumption);
  const savedSek = savedKwh * Math.max(0, numberOr(electricityCostSekKwh));

  return {
    newConsumptionKwh: round(newConsumption, 0),
    savedKwh: round(savedKwh, 0),
    savedSek: round(savedSek, 0),
    paybackYears: calculatePaybackYears(investmentSek, savedSek),
  };
};
