function isConfirmedEgreso(mov) {
  return mov?.tipo_movimiento === 'egreso' && mov?.estado_consolidado === 'pagado';
}

function isVariableEgreso(mov) {
  return isConfirmedEgreso(mov) && !mov.esProyectado;
}

export function calcularNivelControlCiclo({
  resumenFinanciero = {},
  resumenOperativo = {},
  cycleContext = {},
  movimientos = []
}) {
  const balanceActual = Number(resumenFinanciero.balanceActual || 0);
  const balanceProyectado = Number(resumenFinanciero.balanceProyectado || 0);
  const egresosConfirmados = Number(resumenFinanciero.egresosConfirmados || 0);
  const ingresosConfirmados = Number(resumenFinanciero.ingresosConfirmados || 0);
  const egresosPendientes = Number(resumenOperativo.montoPendienteEgresos || 0);
  const avanceCicloPorcentaje = Number(cycleContext.avanceCicloPorcentaje || 100);
  const porcentajeEgresosSobreIngresos = ingresosConfirmados > 0
    ? Math.round((egresosConfirmados / ingresosConfirmados) * 100)
    : null;

  const variableConfirmado = movimientos.filter(isVariableEgreso).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const avanceRatio = Math.min(Math.max(avanceCicloPorcentaje / 100, 0.05), 1);
  const variableEsperadoCierre = variableConfirmado / avanceRatio;
  const variablesEstimadasRestantes = Math.max(0, variableEsperadoCierre - variableConfirmado);
  const pesoVariableProyectado = ingresosConfirmados > 0 ? (variableEsperadoCierre / ingresosConfirmados) * 100 : 0;
  const consumoAcelerado = cycleContext.cicloEnCurso && pesoVariableProyectado > 35 && variablesEstimadasRestantes > variableConfirmado * 0.3;
  const pendientesRelevantes = egresosPendientes > Math.max(ingresosConfirmados * 0.2, 1);
  const pendientesSinCobertura = egresosPendientes > Math.max(balanceActual, 0) && egresosPendientes > 0;
  const egresosAltos = porcentajeEgresosSobreIngresos != null && porcentajeEgresosSobreIngresos >= 90;

  let nivelControl = 'Alto';
  if (balanceProyectado < 0 || egresosAltos || pendientesSinCobertura) {
    nivelControl = 'Bajo';
  } else if (pendientesRelevantes || consumoAcelerado) {
    nivelControl = 'Medio';
  }

  const texto =
    nivelControl === 'Alto'
      ? 'El ciclo viene ordenado.'
      : nivelControl === 'Medio'
        ? 'Hay margen, pero conviene controlar pendientes.'
        : 'Riesgo de presion sobre el balance.';

  return {
    balanceActual,
    balanceProyectado,
    egresosConfirmados,
    ingresosConfirmados,
    egresosPendientes,
    porcentajeEgresosSobreIngresos,
    avanceCicloPorcentaje,
    variablesEstimadasRestantes,
    nivelControl,
    texto
  };
}
