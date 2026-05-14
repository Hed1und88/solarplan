const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(numberOr(value) * factor) / factor;
};

const statusRank = { ok: 0, warning: 1, error: 2 };

const worseStatus = (current, next) => (statusRank[next] > statusRank[current] ? next : current);

export const createDefaultStringDesign = ({ id, panelGroupId = '', mpptIndex = 1, panelCount = 0 }) => ({
  id,
  mpptIndex,
  panelGroupId,
  panelCount,
  parallelGroupIds: [],
  calculatedVocCold: 0,
  calculatedVmpOperating: 0,
  calculatedIsc: 0,
  calculatedDcPowerW: 0,
  status: 'warning',
  messages: ['Välj panelgrupp och antal paneler i serie.'],
});

export const calculateStringElectrical = ({
  panelModel,
  inverterModel,
  stringDesign,
  panelGroups = [],
  roofSurfaces = [],
  coldTempC = -20,
  operatingTempC = 45,
}) => {
  const messages = [];
  let status = 'ok';
  const primaryGroup = panelGroups.find((group) => group.id === stringDesign.panelGroupId) || null;
  const parallelGroups = (stringDesign.parallelGroupIds || [])
    .map((id) => panelGroups.find((group) => group.id === id))
    .filter(Boolean);
  const allGroups = [primaryGroup, ...parallelGroups].filter(Boolean);
  const panelCount = Math.max(0, numberOr(stringDesign.panelCount || primaryGroup?.panelCount, 0));
  const parallelCount = Math.max(1, allGroups.length || 1);

  const vocCold = numberOr(panelModel.voc) * panelCount * (1 + (numberOr(panelModel.tempCoeffVocPercentPerC) / 100) * (coldTempC - 25));
  const vmpOperating = numberOr(panelModel.vmp) * panelCount * (1 + (numberOr(panelModel.tempCoeffPmaxPercentPerC) / 100) * (operatingTempC - 25));
  const isc = numberOr(panelModel.isc) * parallelCount;
  const operatingCurrent = numberOr(panelModel.imp) * parallelCount;
  const dcPowerW = numberOr(panelModel.powerWp) * panelCount * parallelCount;

  const add = (nextStatus, message) => {
    status = worseStatus(status, nextStatus);
    messages.push(message);
  };

  if (!primaryGroup) add('error', 'Välj en panelgrupp för strängen.');
  if (panelCount <= 0) add('error', 'Ange antal paneler i serie.');
  if (vocCold > numberOr(inverterModel.maxDcVoltage)) add('error', 'Voc kallt överstiger växelriktarens max DC-spänning.');
  if (vmpOperating < numberOr(inverterModel.mpptVoltageMin)) add('warning', 'Vmp drift ligger under MPPT-minspänning.');
  if (vmpOperating > numberOr(inverterModel.mpptVoltageMax)) add('warning', 'Vmp drift ligger över MPPT-maxspänning.');
  if (vmpOperating < numberOr(inverterModel.startupVoltage)) add('error', 'Vmp drift ligger under växelriktarens startspänning.');
  if (isc > numberOr(inverterModel.maxShortCircuitCurrentPerMppt)) add('error', 'Kortslutningsströmmen överstiger max kortslutningsström per MPPT.');
  if (operatingCurrent > numberOr(inverterModel.maxCurrentPerMppt)) add('error', 'Driftströmmen överstiger max ström per MPPT.');
  if (dcPowerW > numberOr(inverterModel.maxDcPowerW)) add('warning', 'Total DC-effekt överstiger växelriktarens max DC-effekt.');

  if (parallelGroups.length > 0) {
    const roofById = Object.fromEntries(roofSurfaces.map((surface) => [surface.id, surface]));
    const surfaces = allGroups.map((group) => roofById[group.roofSurfaceId]).filter(Boolean);
    const firstSurface = surfaces[0];
    const mixedRoof = surfaces.some((surface) => Math.abs(numberOr(surface.orientationDeg) - numberOr(firstSurface?.orientationDeg)) > 3 || Math.abs(numberOr(surface.tiltDeg) - numberOr(firstSurface?.tiltDeg)) > 3);
    if (mixedRoof) add('warning', 'Panelgrupper med olika riktning eller lutning bör normalt inte parallellkopplas på samma MPPT utan verifiering.');

    const firstCount = numberOr(primaryGroup?.panelCount, panelCount);
    if (allGroups.some((group) => numberOr(group.panelCount) !== firstCount)) add('warning', 'Parallellkopplade panelgrupper har olika antal paneler.');

    const modelIds = new Set(allGroups.map((group) => group.panelModelId || panelModel.id || 'active-panel-model'));
    if (modelIds.size > 1) add('error', 'Parallellkopplade panelgrupper har olika panelmodeller.');
  }

  if (status === 'ok') messages.push('Strängen ligger inom angivna växelriktargränser.');

  return {
    ...stringDesign,
    panelCount,
    parallelGroupIds: parallelGroups.map((group) => group.id),
    calculatedVocCold: round(vocCold, 1),
    calculatedVmpOperating: round(vmpOperating, 1),
    calculatedIsc: round(isc, 2),
    calculatedOperatingCurrent: round(operatingCurrent, 2),
    calculatedDcPowerW: round(dcPowerW, 0),
    status,
    messages,
  };
};

export const calculateStringDesigns = ({
  panelModel,
  inverterModel,
  strings = [],
  panelGroups = [],
  roofSurfaces = [],
  coldTempC = -20,
  operatingTempC = 45,
}) => {
  const calculated = strings.map((stringDesign) => calculateStringElectrical({
    panelModel,
    inverterModel,
    stringDesign,
    panelGroups,
    roofSurfaces,
    coldTempC,
    operatingTempC,
  }));
  const mpptCounts = calculated.reduce((counts, item) => ({
    ...counts,
    [item.mpptIndex]: numberOr(counts[item.mpptIndex]) + 1,
  }), {});

  return calculated.map((item) => {
    const messages = [...item.messages];
    let status = item.status;
    const add = (nextStatus, message) => {
      status = worseStatus(status, nextStatus);
      messages.push(message);
    };

    if (numberOr(item.mpptIndex) < 1 || numberOr(item.mpptIndex) > numberOr(inverterModel.mpptCount, 1)) {
      add('error', 'Vald MPPT finns inte på växelriktaren.');
    }
    if (numberOr(mpptCounts[item.mpptIndex]) > numberOr(inverterModel.stringsPerMppt, 1)) {
      add('error', 'Antalet strängar på vald MPPT överskrider växelriktarens gräns.');
    }

    return { ...item, status, messages };
  });
};
