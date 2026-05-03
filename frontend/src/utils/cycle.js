export function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCycleContext(cicloSeleccionado = '', cicloEstaCerrado = false, date = new Date()) {
  const [yearText, monthText] = String(cicloSeleccionado || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const valid = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
  const todayIso = toLocalIsoDate(date);

  if (!valid) {
    return {
      cicloSeleccionado,
      fechaInicioCiclo: '',
      fechaFinCiclo: '',
      diasTotalesCiclo: 1,
      diasTranscurridos: 1,
      avanceCicloPorcentaje: 100,
      cicloEstaCerrado: Boolean(cicloEstaCerrado),
      cicloEnCurso: false
    };
  }

  const diasTotalesCiclo = new Date(year, month, 0).getDate();
  const fechaInicioCiclo = `${cicloSeleccionado}-01`;
  const fechaFinCiclo = `${cicloSeleccionado}-${String(diasTotalesCiclo).padStart(2, '0')}`;
  const rawElapsed =
    todayIso < fechaInicioCiclo
      ? 0
      : todayIso > fechaFinCiclo
        ? diasTotalesCiclo
        : Number(todayIso.slice(8, 10));
  const diasTranscurridos = Math.min(Math.max(rawElapsed, 0), diasTotalesCiclo);
  const cicloEnCurso = !cicloEstaCerrado && todayIso >= fechaInicioCiclo && todayIso <= fechaFinCiclo;

  return {
    cicloSeleccionado,
    fechaInicioCiclo,
    fechaFinCiclo,
    diasTotalesCiclo,
    diasTranscurridos,
    avanceCicloPorcentaje: Math.round((diasTranscurridos / diasTotalesCiclo) * 100),
    cicloEstaCerrado: Boolean(cicloEstaCerrado),
    cicloEnCurso
  };
}
