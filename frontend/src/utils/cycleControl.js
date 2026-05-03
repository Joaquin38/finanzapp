function isConfirmedEgreso(mov) {
  return mov?.tipo_movimiento === 'egreso' && mov?.estado_consolidado === 'pagado';
}

function isVariableEgreso(mov) {
  return isConfirmedEgreso(mov) && !mov.esProyectado;
}

function isPendingIngreso(mov) {
  return mov?.tipo_movimiento === 'ingreso' && !['registrado', 'cobrado'].includes(mov?.estado_consolidado);
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
  const porcentajeEgresosPagados = Number(resumenOperativo.porcentajeEgresosPagados || 0);
  const cantidadPendientes = Number(resumenOperativo.pendientes || 0);
  const avanceCicloPorcentaje = Number(cycleContext.avanceCicloPorcentaje || 100);
  const porcentajeEgresosSobreIngresos = ingresosConfirmados > 0
    ? Math.round((egresosConfirmados / ingresosConfirmados) * 100)
    : null;
  const ingresosPendientes = movimientos.filter(isPendingIngreso).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const ingresosTotalesEsperados = ingresosConfirmados + ingresosPendientes;

  const variableConfirmado = movimientos.filter(isVariableEgreso).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const avanceRatio = Math.min(Math.max(avanceCicloPorcentaje / 100, 0.05), 1);
  const variableEsperadoCierre = variableConfirmado / avanceRatio;
  const variablesEstimadasRestantes = Math.max(0, variableEsperadoCierre - variableConfirmado);
  const pesoVariableProyectado = ingresosConfirmados > 0 ? (variableEsperadoCierre / ingresosConfirmados) * 100 : 0;
  const consumoAcelerado = cycleContext.cicloEnCurso && pesoVariableProyectado > 35 && variablesEstimadasRestantes > variableConfirmado * 0.3;
  const baseIngresos = Math.max(ingresosTotalesEsperados, ingresosConfirmados, 1);
  const pendientesRelevantes = egresosPendientes > Math.max(baseIngresos * 0.18, 50000) || cantidadPendientes >= 4;
  const ingresosPendientesRelevantes = ingresosPendientes > Math.max(baseIngresos * 0.2, 50000);
  const margenBajoContraPendientes = balanceProyectado > 0 && egresosPendientes > 0 && balanceProyectado < egresosPendientes * 0.35;
  const pendientesSinCobertura = balanceProyectado <= 0 && egresosPendientes > Math.max(balanceActual, 0);
  const egresosAltos = porcentajeEgresosSobreIngresos != null && porcentajeEgresosSobreIngresos >= 95 && balanceProyectado <= egresosPendientes;
  const pagosCriticosBajos = porcentajeEgresosPagados < 70 && egresosPendientes > 0;
  const cierrePositivo = balanceProyectado > 0;

  let nivelControl = 'Alto';
  if (
    balanceProyectado < 0 ||
    margenBajoContraPendientes ||
    pendientesSinCobertura ||
    egresosAltos ||
    (consumoAcelerado && balanceProyectado < Math.max(egresosPendientes, baseIngresos * 0.05))
  ) {
    nivelControl = 'Bajo';
  } else if (
    cierrePositivo &&
    (pendientesRelevantes || ingresosPendientesRelevantes || pagosCriticosBajos || consumoAcelerado || cycleContext.cicloEnCurso)
  ) {
    nivelControl = 'Medio';
  }

  const texto =
    nivelControl === 'Alto'
      ? 'Ciclo ordenado. El margen proyectado es saludable.'
      : nivelControl === 'Medio'
        ? 'Hay margen proyectado, pero todavia quedan pendientes relevantes.'
        : 'Riesgo real de presion sobre el balance. Revisa pagos e ingresos pendientes.';
  const detalle =
    nivelControl === 'Alto'
      ? 'Sin señales relevantes de presion.'
      : nivelControl === 'Medio'
        ? 'Pendientes altos, pero cierre proyectado positivo.'
        : 'El cierre proyectado puede quedar comprometido.';

  return {
    balanceActual,
    balanceProyectado,
    egresosConfirmados,
    ingresosConfirmados,
    ingresosPendientes,
    egresosPendientes,
    cantidadPendientes,
    porcentajeEgresosPagados,
    porcentajeEgresosSobreIngresos,
    avanceCicloPorcentaje,
    variablesEstimadasRestantes,
    nivelControl,
    texto,
    detalle
  };
}
