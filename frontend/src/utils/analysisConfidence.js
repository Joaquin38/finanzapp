function hasEnoughData(item, valueKeys) {
  return valueKeys.some((key) => Number(item?.[key] || 0) > 0);
}

export function getAnalysisConfidence({
  series = [],
  cycleContext = null,
  currentCycle = '',
  valueKeys = ['ingresos', 'egresos'],
  includeCurrentIfClosed = true
} = {}) {
  const current = String(currentCycle || '');
  const closedWithData = series.filter((item) => {
    const cycle = String(item?.ciclo || item?.key || '');
    const isCurrent = current && cycle === current;
    if (isCurrent && (!includeCurrentIfClosed || cycleContext?.cicloEnCurso)) return false;
    return hasEnoughData(item, valueKeys);
  }).length;
  const incomplete = Boolean(cycleContext?.cicloEnCurso);
  const nivel = closedWithData >= 3 && !incomplete ? 'alta' : closedWithData >= 2 ? 'media' : 'baja';

  return {
    nivel,
    label: `Confianza ${nivel}`,
    closedWithData,
    isLow: nivel === 'baja',
    note: nivel === 'baja' ? 'Historico insuficiente para una conclusion firme.' : ''
  };
}
