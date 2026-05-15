import { getCycleContext } from '../utils/cycle.js';

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  return <em className={`decision-status decision-confidence ${confidence.nivel}`}>{confidence.label}</em>;
}

function DecisionCard({ title, metric, text, recommendation, tone = 'balance' }) {
  return (
    <article className={`card decision-card card-${tone}`}>
      <DecisionCardHeader
        title={title}
        help={`Mide ${title.toLowerCase()} con datos consolidados del ciclo. Ayuda a interpretar el estado operativo antes de cerrar o tomar decisiones.`}
      />
      <p>{metric}</p>
      <small>{text}</small>
      <strong>{recommendation}</strong>
    </article>
  );
}

function DecisionCardHeader({ title, help, showDetail = false }) {
  return (
    <div className="decision-card-header">
      <h3>{title}</h3>
      <span className="decision-help" tabIndex="0" aria-label={help}>
        ?
        <span className="decision-help-tooltip" role="tooltip">{help}</span>
      </span>
      {showDetail && <button type="button" className="decision-detail-btn">Ver detalle</button>}
    </div>
  );
}

function DecisionSection({ title, className = '', children }) {
  return (
    <section className={`decision-section ${className}`}>
      <h3 className="decision-section-title">{title}</h3>
      {children}
    </section>
  );
}

function DecisionAccordion({ title, headerSummary, defaultOpen = false, children }) {
  return (
    <details className="decision-accordion" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <small>{headerSummary}</small>
      </summary>
      <div className="decision-accordion-body">
        {children}
      </div>
    </details>
  );
}

const CATEGORY_KIND = {
  vivienda: 'fijo',
  servicios: 'fijo',
  prestamos: 'fijo',
  tarjeta: 'recurrente_variable',
  alimentos: 'variable',
  transporte: 'variable',
  mascotas: 'variable',
  salud: 'recurrente_variable',
  ocio: 'variable',
  herramientas: 'extraordinario',
  otros: 'extraordinario',
  ahorro: 'fijo',
  'ajuste de cierre': 'extraordinario',
  'arrastre de cierre': 'extraordinario',
  sueldo: 'extraordinario'
};

function normalizeCategoryName(category) {
  return String(category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getCategoryKind(category) {
  return CATEGORY_KIND[normalizeCategoryName(category)] || 'variable';
}

function getVariation(actual, anterior) {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

function getVariationTone(tipo, variacion) {
  if (variacion == null || variacion === 0) return 'muted';
  if (tipo === 'ingresos') return variacion > 0 ? 'positive' : 'negative';
  if (tipo === 'egresos') return variacion > 0 ? 'warning' : 'positive';
  return variacion > 0 ? 'positive' : 'warning';
}

function formatVariation(variacion) {
  if (variacion == null) return 'Sin referencia';
  return `${variacion > 0 ? '+' : ''}${variacion.toFixed(1)}%`;
}

function formatPartialReference(actual, anterior, formatMoney) {
  if (Number(anterior || 0) > 0) return `${Math.round((Number(actual || 0) / Number(anterior || 0)) * 100)}% del mes anterior`;
  return formatMoney(actual);
}

function hasFinancialSignal(item) {
  return ['ingresos', 'egresos', 'balance'].some((key) => Math.abs(Number(item?.[key] || 0)) > 0);
}

function countConfirmedMovements(movimientos = []) {
  return movimientos.filter((mov) => {
    if (mov.tipo_movimiento === 'egreso') return mov.estado_consolidado === 'pagado';
    if (['ingreso', 'ahorro'].includes(mov.tipo_movimiento)) return ['registrado', 'cobrado'].includes(mov.estado_consolidado);
    return false;
  }).length;
}

function ComparisonRow({ label, tipo, actual, anterior, formatMoney, cycleContext }) {
  const variacion = getVariation(actual, anterior);
  const isPartial = cycleContext?.cicloEnCurso;
  const tone = isPartial ? 'muted' : getVariationTone(tipo, variacion);
  const partialLabel = tipo === 'ingresos' ? 'Ingresos confirmados al momento' : `${label} al momento`;

  return (
    <div className="decision-comparison-row">
      <span>{label}</span>
      <strong>{formatMoney(actual)}</strong>
      <small>{isPartial ? 'Anterior completo' : 'Anterior'}: {formatMoney(anterior)}</small>
      <em className={`decision-variation ${tone}`}>
        {isPartial ? `${partialLabel}: ${formatPartialReference(actual, anterior, formatMoney)}. Ciclo en curso.` : formatVariation(variacion)}
      </em>
    </div>
  );
}

function getComparisonRecommendation(actual, anterior, cycleContext) {
  if (cycleContext?.cicloEnCurso) {
    return 'Lectura parcial: faltan movimientos por confirmar antes de comparar el ciclo completo.';
  }

  const sinHistorial = !anterior || ['ingresos', 'egresos', 'balance'].every((key) => Number(anterior[key] || 0) === 0);
  if (sinHistorial) return 'Todavia no hay suficiente historial para comparar.';

  const variacionEgresos = getVariation(Number(actual.egresos || 0), Number(anterior.egresos || 0));
  const balanceBajo = Number(actual.balance || 0) < Number(anterior.balance || 0);

  if (variacionEgresos != null && variacionEgresos > 15) {
    return 'Revisa las categorias que mas crecieron antes de confirmar nuevos gastos.';
  }

  if (variacionEgresos != null && variacionEgresos < -10) {
    return 'Buen ajuste: mantené este ritmo y evalua separar ahorro antes de mitad de ciclo.';
  }

  if (balanceBajo) {
    return 'El balance empeoro respecto al mes anterior. Revisa gastos grandes o no recurrentes.';
  }

  return 'Sin desvios fuertes frente al mes anterior.';
}

function ComparisonCard({ serieMensual, movimientos = [], movimientosMesAnterior = [], formatMoney, cycleContext, analysisConfidence }) {
  const actual = serieMensual?.[serieMensual.length - 1] || { ingresos: 0, egresos: 0, balance: 0 };
  const anterior = serieMensual?.[serieMensual.length - 2] || { ingresos: 0, egresos: 0, balance: 0 };
  const recommendation = getComparisonRecommendation(actual, anterior, cycleContext);
  const isPartial = cycleContext?.cicloEnCurso;
  const hasCurrentData = hasFinancialSignal(actual) || countConfirmedMovements(movimientos) > 0;
  const hasPreviousData = hasFinancialSignal(anterior) || countConfirmedMovements(movimientosMesAnterior) > 0;
  const hasComparableData = hasCurrentData && hasPreviousData;
  const currentByCategory = getConfirmedExpensesByCategory(movimientos);
  const previousByCategory = getConfirmedExpensesByCategory(movimientosMesAnterior);
  const impactRanking = Array.from(new Set([...Object.keys(currentByCategory), ...Object.keys(previousByCategory)]))
    .map((categoria) => {
      const actualCategoria = Number(currentByCategory[categoria] || 0);
      const anteriorCategoria = getCategoryTotal(previousByCategory, categoria);
      const diferencia = actualCategoria - anteriorCategoria;
      const variacion = getVariation(actualCategoria, anteriorCategoria);
      return { categoria, actual: actualCategoria, anterior: anteriorCategoria, diferencia, variacion };
    })
    .filter((item) => item.actual > 0 || item.anterior > 0)
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || Math.abs(Number(b.variacion || 0)) - Math.abs(Number(a.variacion || 0)))
    .slice(0, 4);

  return (
    <article className="card decision-card decision-comparison-card decision-card-wide">
      <DecisionCardHeader
        title="Comparacion vs mes anterior"
        showDetail
        help="Muestra que cambio respecto al mes anterior y que categorias movieron mas el resultado. Sirve para decidir donde ajustar o validar si el mes viene mejor o peor."
      />
      <ConfidenceBadge confidence={analysisConfidence} />
      {isPartial && <span className="pill muted decision-cycle-badge">Ciclo en curso</span>}
      {!hasComparableData ? (
        <div className="decision-data-note">
          <strong>Informacion insuficiente para comparar.</strong>
          <p>
            Este hogar todavia no tiene movimientos confirmados e historial suficiente. La lectura puede ser imprecisa hasta que existan al menos dos ciclos con datos reales.
          </p>
          {isPartial && <small>El ciclo actual tambien esta en curso: cualquier dato visible es parcial.</small>}
        </div>
      ) : (
        <>
          {analysisConfidence?.isLow && (
            <div className="decision-data-note compact">
              <strong>Comparacion orientativa.</strong>
              <p>{analysisConfidence.note} Puede cambiar cuando haya mas ciclos cerrados con movimientos.</p>
            </div>
          )}
          <div className="decision-comparison-block">
            <span className="decision-block-title">Resumen general</span>
            <div className="decision-comparison-grid decision-summary-grid">
              <ComparisonRow
                label="Ingresos"
                tipo="ingresos"
                actual={Number(actual.ingresos || 0)}
                anterior={Number(anterior.ingresos || 0)}
                formatMoney={formatMoney}
                cycleContext={cycleContext}
              />
              <ComparisonRow
                label="Egresos"
                tipo="egresos"
                actual={Number(actual.egresos || 0)}
                anterior={Number(anterior.egresos || 0)}
                formatMoney={formatMoney}
                cycleContext={cycleContext}
              />
              <ComparisonRow
                label="Balance"
                tipo="balance"
                actual={Number(actual.balance || 0)}
                anterior={Number(anterior.balance || 0)}
                formatMoney={formatMoney}
                cycleContext={cycleContext}
              />
            </div>
          </div>
          {impactRanking.length > 0 && (
            <div className="decision-comparison-block">
              <span className="decision-block-title">Cambios por categoria</span>
              <div className="decision-impact-list">
                {impactRanking.map((item, index) => {
                  const diffAbs = Math.abs(item.diferencia);
                  const variationText = isPartial && item.diferencia < 0
                    ? 'Lectura parcial'
                    : item.variacion == null ? 'Sin referencia anterior' : formatVariation(item.variacion);
                  const badge =
                    item.anterior <= 0
                      ? 'sin referencia'
                      : item.diferencia < 0
                        ? 'bajo'
                        : item.diferencia > 0
                          ? 'subio'
                          : 'sin cambio';
                  const statusText =
                    isPartial && item.diferencia < 0
                      ? 'esta por debajo del patron esperado para esta altura del ciclo'
                      : item.anterior <= 0
                        ? 'Sin referencia anterior'
                        : item.diferencia < 0
                          ? 'Bajo respecto al mes anterior'
                          : item.variacion != null && item.variacion > 20
                            ? 'Subio significativamente'
                            : item.variacion != null && item.variacion >= 10
                              ? 'Subio respecto al mes anterior'
                              : 'Se mantuvo cerca del mes anterior';
                  return (
                    <div className="decision-impact-row" key={item.categoria}>
                      <div className="decision-impact-head">
                        <span>{item.categoria}</span>
                        <em className={`decision-impact-badge ${badge.replace(' ', '-')}`}>{badge}</em>
                      </div>
                      <div className="decision-impact-values">
                        <strong>{formatMoney(item.actual)}</strong>
                        <small>Anterior: {item.anterior > 0 ? formatMoney(item.anterior) : 'Sin referencia'}</small>
                        <small>Dif: {item.diferencia >= 0 ? '+' : '-'}{formatMoney(diffAbs)} ({variationText})</small>
                      </div>
                      <p>
                        {item.categoria}: {statusText.toLowerCase()}. {index === 0 ? 'Es el cambio con mayor impacto en el mes.' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <strong>{analysisConfidence?.isLow ? `Comparacion orientativa. ${analysisConfidence.note}` : recommendation}</strong>
        </>
      )}
    </article>
  );
}

function getCycleProgress(ciclo, cycleContext) {
  const context = cycleContext || getCycleContext(ciclo);

  return {
    dayCurrent: Math.min(Math.max(context.diasTranscurridos || 1, 1), context.diasTotalesCiclo || 1),
    daysTotal: context.diasTotalesCiclo || 1
  };
}

function getConfirmedExpenses(movimientos) {
  return movimientos.filter((mov) =>
    ['egreso', 'ahorro'].includes(mov.tipo_movimiento) &&
    (mov.tipo_movimiento === 'ahorro'
      ? ['registrado', 'cobrado'].includes(mov.estado_consolidado)
      : mov.estado_consolidado === 'pagado')
  );
}

function isExpenseMovement(mov) {
  return ['egreso', 'ahorro'].includes(mov.tipo_movimiento);
}

function isConfirmedExpense(mov) {
  if (!isExpenseMovement(mov)) return false;
  return mov.tipo_movimiento === 'ahorro'
    ? ['registrado', 'cobrado'].includes(mov.estado_consolidado)
    : mov.estado_consolidado === 'pagado';
}

function isPendingExpense(mov) {
  return isExpenseMovement(mov) && !isConfirmedExpense(mov);
}

function isIncomeMovement(mov) {
  return mov.tipo_movimiento === 'ingreso';
}

function isConfirmedIncome(mov) {
  return isIncomeMovement(mov) && ['registrado', 'cobrado'].includes(mov.estado_consolidado);
}

function isProjectedIncome(mov) {
  return isIncomeMovement(mov) && !isConfirmedIncome(mov);
}

function getMovementCategory(mov) {
  return mov.categoria || mov.categoria_nombre || mov.nombre_categoria || '';
}

function getExpenseKind(mov) {
  return getCategoryKind(getMovementCategory(mov));
}

function isControllableExpense(mov) {
  return ['variable', 'recurrente_variable'].includes(getExpenseKind(mov));
}

function getConfirmedExpensesUntilToday(movimientos, ciclo, dayCurrent, predicate = () => true) {
  const limitDay = String(dayCurrent).padStart(2, '0');
  const limitDate = `${ciclo}-${limitDay}`;
  return getConfirmedExpenses(movimientos)
    .filter(predicate)
    .filter((mov) => String(mov.fecha || '').slice(0, 10) <= limitDate);
}

function RhythmCard({ movimientos, movimientosMesAnterior = [], ciclo, formatMoney }) {
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo);
  const currentConfirmed = getConfirmedExpenses(movimientos);
  const currentControlable = getConfirmedExpensesUntilToday(movimientos, ciclo, dayCurrent, isControllableExpense);
  const variablesAcumulados = currentControlable
    .filter((mov) => getExpenseKind(mov) === 'variable')
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const recurrentesVariablesAcumulados = currentControlable
    .filter((mov) => getExpenseKind(mov) === 'recurrente_variable')
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const fijosPagados = currentConfirmed
    .filter((mov) => getExpenseKind(mov) === 'fijo')
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const fijosPendientes = movimientos
    .filter(isPendingExpense)
    .filter((mov) => getExpenseKind(mov) === 'fijo')
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const actual = variablesAcumulados + recurrentesVariablesAcumulados;
  const previousDistribution = getWeeklyDistributionPercentages(movimientosMesAnterior, isControllableExpense);
  const historialControlable = previousDistribution.total;
  const expectedProgress = historialControlable > 0
    ? previousDistribution.percentages.slice(0, getWeekIndex(`${ciclo}-${String(dayCurrent).padStart(2, '0')}`) + 1).reduce((acc, value) => acc + value, 0)
    : 0;
  const esperado = historialControlable > 0 ? historialControlable * Math.max(expectedProgress, 0.01) : 0;
  const diferencia = actual - esperado;
  const variacion = getVariation(actual, esperado);
  const sinHistorial = historialControlable <= 0;
  const status =
    sinHistorial ? 'Sin historial' : actual > esperado * 1.1 ? 'Ritmo alto' : actual < esperado * 0.9 ? 'Ritmo bajo' : 'Ritmo normal';
  const tone = sinHistorial ? 'muted' : status === 'Ritmo alto' ? 'warning' : status === 'Ritmo bajo' ? 'positive' : 'muted';
  const recommendation =
    sinHistorial
      ? 'Falta historial para calcular ritmo esperado.'
      : status === 'Ritmo alto'
        ? 'El consumo controlable viene por encima del patron esperado.'
        : status === 'Ritmo bajo'
          ? 'El consumo controlable viene por debajo del patron esperado.'
          : 'El consumo controlable viene alineado al patron esperado.';

  return (
    <article className="card decision-card decision-comparison-card">
      <DecisionCardHeader
        title="Ritmo del mes"
        help="Compara tu gasto controlable actual contra lo esperado segun el mes anterior. Si esta alto, ayuda a decidir si conviene frenar gastos variables."
      />
      <em className={`decision-status ${tone}`}>{status}</em>
      <div className="decision-comparison-grid">
        <div className="decision-comparison-row">
          <span>Consumo controlable</span>
          <strong>{formatMoney(actual)}</strong>
          <small>Dia {dayCurrent} de {daysTotal}</small>
        </div>
        <div className="decision-comparison-row">
          <span>Esperado segun patron</span>
          <strong>{formatMoney(esperado)}</strong>
          <small>Variables y recurrentes variables</small>
        </div>
        <div className="decision-comparison-row">
          <span>Diferencia</span>
          <strong>{formatMoney(diferencia)}</strong>
          <em className={`decision-variation ${tone}`}>{sinHistorial ? 'Sin referencia' : formatVariation(variacion)}</em>
        </div>
      </div>
      <div className="decision-composition-grid">
        <span>Fijos pagados <strong>{formatMoney(fijosPagados)}</strong></span>
        <span>Fijos pendientes <strong>{formatMoney(fijosPendientes)}</strong></span>
        <span>Variables acumulados <strong>{formatMoney(variablesAcumulados)}</strong></span>
        <span>Recurrentes variables <strong>{formatMoney(recurrentesVariablesAcumulados)}</strong></span>
      </div>
      <strong>{recommendation}</strong>
    </article>
  );
}

function getWeekIndex(fecha) {
  const day = Number(String(fecha || '').slice(8, 10));
  if (day <= 7) return 0;
  if (day <= 14) return 1;
  if (day <= 21) return 2;
  return 3;
}

function WeeklyDistributionCard({ movimientos, formatMoney }) {
  const weeks = [
    { label: 'Semana 1', total: 0 },
    { label: 'Semana 2', total: 0 },
    { label: 'Semana 3', total: 0 },
    { label: 'Semana 4', total: 0 }
  ];

  getConfirmedExpenses(movimientos).forEach((mov) => {
    weeks[getWeekIndex(mov.fecha)].total += Number(mov.monto_ars || 0);
  });

  const total = weeks.reduce((acc, week) => acc + week.total, 0);
  const enriched = weeks.map((week) => ({
    ...week,
    percent: total > 0 ? Math.round((week.total / total) * 100) : 0
  }));
  const topWeek = enriched.reduce((max, week) => (week.total > max.total ? week : max), enriched[0]);
  const earlyPercent = enriched[0].percent + enriched[1].percent;
  const recommendation =
    total <= 0
      ? 'Cargar egresos confirmados permite ver como se distribuye el mes.'
      : topWeek.percent > 40
        ? 'Tenes gasto muy concentrado. Conviene anticipar ahorro antes de esa semana.'
        : earlyPercent > 60
          ? 'Gran parte del gasto ocurre al inicio del ciclo. Separa ahorro apenas ingresen los ingresos principales.'
          : 'El gasto esta distribuido de forma pareja. Esto facilita sostener ahorro durante el mes.';

  return (
    <article className="card decision-card decision-comparison-card">
      <DecisionCardHeader
        title="Distribucion semanal"
        help="Mide en que semanas se concentran los egresos confirmados. Ayuda a anticipar cuando separar ahorro o reservar liquidez."
      />
      <div className="decision-weekly-list">
        {enriched.map((week) => (
          <div className="decision-weekly-row" key={week.label}>
            <div className="decision-weekly-meta">
              <span>{week.label}</span>
              <strong>{formatMoney(week.total)}</strong>
              <small>{week.percent}%</small>
            </div>
            <div className="decision-weekly-track" aria-hidden="true">
              <div className="decision-weekly-fill" style={{ width: `${week.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
      <small>
        {total > 0
          ? `La semana con mayor gasto fue ${topWeek.label} con ${formatMoney(topWeek.total)}, equivalente al ${topWeek.percent}% del total.`
          : 'Todavia no hay egresos confirmados para distribuir por semana.'}
      </small>
      <strong>{recommendation}</strong>
    </article>
  );
}

function getWeeklyDistributionPercentages(movimientos, predicate = () => true) {
  const totals = [0, 0, 0, 0];
  getConfirmedExpenses(movimientos).filter(predicate).forEach((mov) => {
    totals[getWeekIndex(mov.fecha)] += Number(mov.monto_ars || 0);
  });
  const total = totals.reduce((acc, value) => acc + value, 0);
  return {
    total,
    percentages: totals.map((value) => (total > 0 ? value / total : 0))
  };
}

function calculateRealisticProjection({ movimientos, movimientosMesAnterior = [], resumen, ciclo }) {
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo);
  const currentWeekIndex = dayCurrent <= 7 ? 0 : dayCurrent <= 14 ? 1 : dayCurrent <= 21 ? 2 : 3;
  const byKind = {
    fijo: { confirmed: 0, pending: 0 },
    recurrente_variable: { confirmed: 0, pending: 0 },
    variable: { confirmed: 0, pending: 0 },
    extraordinario: { confirmed: 0, pending: 0 }
  };

  movimientos.filter(isExpenseMovement).forEach((mov) => {
    const kind = getExpenseKind(mov);
    const bucket = byKind[kind] || byKind.variable;
    if (isConfirmedExpense(mov)) bucket.confirmed += Number(mov.monto_ars || 0);
    else if (isPendingExpense(mov)) bucket.pending += Number(mov.monto_ars || 0);
  });

  const isVariable = (mov) => getExpenseKind(mov) === 'variable';
  const previousDistribution = getWeeklyDistributionPercentages(movimientosMesAnterior, isVariable);
  const hasVariableHistory = previousDistribution.total > 0;
  const expectedProgress = hasVariableHistory
    ? previousDistribution.percentages.slice(0, currentWeekIndex + 1).reduce((acc, value) => acc + value, 0)
    : dayCurrent / daysTotal;
  const safeProgress = Math.max(expectedProgress, 0.01);
  const variableProjectionSource = hasVariableHistory
    ? byKind.variable.confirmed / safeProgress
    : (byKind.variable.confirmed / dayCurrent) * daysTotal;
  const variableProjection = Math.max(byKind.variable.confirmed, variableProjectionSource || 0);
  const fijoTotal = byKind.fijo.confirmed + byKind.fijo.pending;
  const recurrenteTotal = byKind.recurrente_variable.confirmed + byKind.recurrente_variable.pending;
  const extraordinarioTotal = byKind.extraordinario.confirmed;
  const egresoEstimado = fijoTotal + recurrenteTotal + variableProjection + extraordinarioTotal;
  const ingresosConfirmados = movimientos.filter(isConfirmedIncome).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const ingresosProyectados = movimientos.filter(isProjectedIncome).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const ingresosDelCiclo = Math.max(Number(resumen?.ingresos || 0), ingresosConfirmados);
  const ingresoEstimado = Math.max(ingresosConfirmados + ingresosProyectados, ingresosDelCiclo);
  const balanceEstimado = ingresoEstimado - egresoEstimado;
  const egresosPendientes = movimientos.filter(isPendingExpense).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const variablesEsperadosRestantes = Math.max(variableProjection - byKind.variable.confirmed, 0);
  const confianza = hasVariableHistory && byKind.variable.confirmed > 0
    ? 'alta'
    : hasVariableHistory || byKind.variable.confirmed > 0
      ? 'media'
      : 'baja';

  return {
    byKind,
    fijoTotal,
    recurrenteTotal,
    extraordinarioTotal,
    variableProjection,
    egresoEstimado,
    balanceEstimado,
    ingresosDelCiclo,
    ingresoEstimado,
    ingresosConfirmados,
    ingresosProyectados,
    egresosPendientes,
    variablesEsperadosRestantes,
    safeProgress,
    hasVariableHistory,
    confianza
  };
}

function buildDecisionContext({ resumen, realisticProjection }) {
  const ingresos = Number(realisticProjection?.ingresoEstimado || resumen?.ingresos || 0);
  const balanceReal = Number(resumen?.balance_actual || 0);
  const balanceProyectado = Number(realisticProjection?.balanceEstimado ?? resumen?.balance_proyectado ?? 0);
  const colchonMinimo = Math.max(
    ingresos * 0.1,
    Number(realisticProjection?.egresosPendientes || 0),
    Number(realisticProjection?.variablesEsperadosRestantes || 0)
  );
  const margenAhorroReal = Number(realisticProjection?.balanceEstimado || 0) - colchonMinimo;

  if (margenAhorroReal <= 0) {
    return {
      balanceReal,
      balanceProyectado,
      margenDisponible: balanceReal,
      margenAhorroReal,
      colchonMinimo,
      riesgo: balanceReal < 0 || balanceProyectado < 0 ? 'alto' : 'medio',
      puedeAhorrar: false,
      recomendacionPrincipal: 'No conviene ahorrar todavia'
    };
  }

  if (ingresos > 0 && margenAhorroReal < ingresos * 0.1) {
    return {
      balanceReal,
      balanceProyectado,
      margenDisponible: balanceReal,
      margenAhorroReal,
      colchonMinimo,
      riesgo: 'medio',
      puedeAhorrar: true,
      recomendacionPrincipal: 'Ahorro moderado o esperar'
    };
  }

  return {
    balanceReal,
    balanceProyectado,
    margenDisponible: balanceReal,
    margenAhorroReal,
    colchonMinimo,
    riesgo: 'bajo',
    puedeAhorrar: true,
    recomendacionPrincipal: 'Conviene ahorrar o comprar USD'
  };
}

function ProjectionByPaceCard({ movimientos, movimientosMesAnterior = [], resumen, ciclo, formatMoney }) {
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo);
  const currentWeekIndex = dayCurrent <= 7 ? 0 : dayCurrent <= 14 ? 1 : dayCurrent <= 21 ? 2 : 3;
  const egresosConfirmados = getConfirmedExpenses(movimientos).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const previousDistribution = getWeeklyDistributionPercentages(movimientosMesAnterior);
  const hasHistoricalPattern = previousDistribution.total > 0;
  const expectedProgress = hasHistoricalPattern
    ? previousDistribution.percentages.slice(0, currentWeekIndex + 1).reduce((acc, value) => acc + value, 0)
    : dayCurrent / daysTotal;
  const safeProgress = Math.max(expectedProgress, 0.01);
  const projectedByPattern = egresosConfirmados / safeProgress;
  const fallbackProjection = (egresosConfirmados / dayCurrent) * daysTotal;
  const rawProjection = hasHistoricalPattern ? projectedByPattern : fallbackProjection;
  const egresoProyectado = egresosConfirmados > 0 ? Math.min(rawProjection, egresosConfirmados * 2) : 0;
  const ingresosConfirmados = movimientos.filter(isConfirmedIncome).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const ingresosProyectados = movimientos.filter(isProjectedIncome).reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
  const ingresoEstimado = Math.max(ingresosConfirmados + ingresosProyectados, Number(resumen?.ingresos || 0));
  const balanceEstimado = ingresoEstimado - egresoProyectado;
  const margenRatio = ingresoEstimado > 0 ? balanceEstimado / ingresoEstimado : 0;
  const estado = balanceEstimado < 0 ? 'Riesgo de deficit' : margenRatio <= 0.1 ? 'Mes ajustado' : 'Margen positivo';
  const tone = balanceEstimado < 0 ? 'danger' : margenRatio <= 0.1 ? 'muted' : 'positive';
  const recommendation =
    balanceEstimado < 0
      ? 'Si mantenes este ritmo, cerrarias negativo. Revisa gastos variables y posterga consumos no esenciales.'
      : margenRatio <= 0.1
        ? 'El margen es bajo. Evita gastos grandes hasta confirmar todos los pendientes.'
        : 'Hay margen positivo. Podes evaluar separar una parte para ahorro o compra de USD.';

  return (
    <article className="card decision-card decision-comparison-card">
      <DecisionCardHeader
        title="Proyeccion por ritmo actual"
        showDetail
        help="Estima el cierre usando tipos de gasto y comportamiento historico. Sirve para decidir si conviene ahorrar, comprar USD o esperar."
      />
      <em className={`decision-status ${tone}`}>{estado}</em>
      <div className="decision-comparison-grid">
        <div className="decision-comparison-row">
          <span>Egresos actuales</span>
          <strong>{formatMoney(egresosConfirmados)}</strong>
          <small>Confirmados hasta hoy</small>
        </div>
        <div className="decision-comparison-row">
          <span>Porcentaje esperado</span>
          <strong>{Math.round(safeProgress * 100)}%</strong>
          <small>{hasHistoricalPattern ? 'Proyección basada en tu comportamiento histórico' : 'Fallback por promedio diario'}</small>
        </div>
        <div className="decision-comparison-row">
          <span>Proyeccion corregida</span>
          <strong>{formatMoney(egresoProyectado)}</strong>
          <small>Balance estimado: {formatMoney(balanceEstimado)}</small>
        </div>
      </div>
      <strong>{recommendation}</strong>
    </article>
  );
}

function ProjectionByFunctionalTypeCard({ movimientos, movimientosMesAnterior = [], resumen, ciclo, formatMoney, realisticProjection = null }) {
  const {
    byKind,
    fijoTotal,
    recurrenteTotal,
    extraordinarioTotal,
    variableProjection,
    egresoEstimado,
    balanceEstimado,
    ingresosDelCiclo,
    ingresoEstimado,
    ingresosConfirmados,
    ingresosProyectados,
    safeProgress,
    hasVariableHistory,
    confianza
  } = realisticProjection || calculateRealisticProjection({ movimientos, movimientosMesAnterior, resumen, ciclo });
  const margenRatio = ingresoEstimado > 0 ? balanceEstimado / ingresoEstimado : 0;
  const estado = balanceEstimado < 0 ? 'Riesgo de deficit' : margenRatio <= 0.1 ? 'Mes ajustado' : 'Margen positivo';
  const tone = balanceEstimado < 0 ? 'danger' : margenRatio <= 0.1 ? 'muted' : 'positive';
  const recommendation =
    balanceEstimado < 0
      ? 'El cierre estimado queda negativo. Revisa variables y pendientes antes de sumar gastos.'
      : margenRatio <= 0.1
        ? 'El margen estimado es bajo. Conviene esperar antes de nuevas decisiones grandes.'
        : 'Hay margen estimado. Podes evaluar ahorro o compra de USD con prudencia.';

  return (
    <article className="card decision-card decision-comparison-card decision-card-primary">
      <DecisionCardHeader
        title="Proyeccion por ritmo actual"
        showDetail
        help="Estima el cierre usando tipos de gasto y comportamiento historico. Sirve para decidir si conviene ahorrar, comprar USD o esperar."
      />
      <div className="decision-status-row">
        <em className={`decision-status ${tone}`}>{estado}</em>
        <em className={`decision-status decision-confidence ${confianza}`}>Confianza {confianza}</em>
      </div>
      <small>Proyeccion ajustada por ingresos y egresos del ciclo</small>
      <div className="decision-comparison-grid">
        <div className="decision-comparison-row">
          <span>Ingreso estimado al cierre</span>
          <strong>{formatMoney(ingresoEstimado)}</strong>
          <small>{formatMoney(ingresosConfirmados)} confirmados + {formatMoney(ingresosProyectados)} proyectados</small>
        </div>
        <div className="decision-comparison-row">
          <span>Egreso estimado al cierre</span>
          <strong>{formatMoney(egresoEstimado)}</strong>
          <small>Fijos, recurrentes, variables y extraordinarios</small>
        </div>
        <div className="decision-comparison-row">
          <span>Balance estimado al cierre</span>
          <strong>{formatMoney(balanceEstimado)}</strong>
          <small>Incluye ingresos proyectados y egresos estimados</small>
        </div>
        <div className="decision-comparison-row">
          <span>Variable proyectado</span>
          <strong>{formatMoney(variableProjection)}</strong>
          <small>{hasVariableHistory ? `${Math.round(safeProgress * 100)}% esperado segun historial` : 'Fallback por promedio diario'}</small>
        </div>
      </div>
      <div className="decision-composition-grid">
        <span>Ingreso confirmado <strong>{formatMoney(ingresosConfirmados)}</strong></span>
        <span>Ingreso proyectado <strong>{formatMoney(ingresosProyectados)}</strong></span>
        <span>Fijo <strong>{formatMoney(fijoTotal)}</strong></span>
        <span>Recurrente variable <strong>{formatMoney(recurrenteTotal)}</strong></span>
        <span>Variable proyectado <strong>{formatMoney(variableProjection)}</strong></span>
        <span>Extraordinario confirmado <strong>{formatMoney(extraordinarioTotal)}</strong></span>
      </div>
      <strong>{recommendation}</strong>
    </article>
  );
}

function CriticalCategoriesCard({ categorias = [], formatMoney }) {
  const top = categorias.slice(0, 3);
  const total = categorias.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const topTotal = top.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const topPercent = total > 0 ? Math.round((topTotal / total) * 100) : 0;
  const estado = topPercent > 70 ? 'Alta concentracion' : topPercent >= 50 ? 'Concentracion media' : 'Gasto distribuido';
  const tone = topPercent > 70 ? 'warning' : topPercent >= 50 ? 'muted' : 'positive';
  const recommendation =
    topPercent > 70
      ? 'El gasto esta muy concentrado. Revisa especialmente estas categorias antes de sumar nuevos consumos.'
      : topPercent >= 50
        ? 'El gasto esta moderadamente concentrado. Controlar estas categorias puede mover fuerte el resultado del mes.'
        : 'El gasto esta bastante distribuido. Conviene mirar gastos chicos repetidos.';

  return (
    <article className="card decision-card decision-comparison-card">
      <DecisionCardHeader
        title="Categorias criticas"
        help="Mide que categorias concentran mas egresos confirmados. Ayuda a decidir donde mirar primero si necesitas ajustar el gasto."
      />
      <em className={`decision-status ${tone}`}>{estado}</em>
      <div className="decision-weekly-list">
        {top.length > 0 ? (
          top.map((item) => {
            const percent = total > 0 ? Math.round((Number(item.total || 0) / total) * 100) : 0;
            return (
              <div className="decision-weekly-row" key={item.categoria}>
                <div className="decision-weekly-meta">
                  <span>{item.categoria}</span>
                  <strong>{formatMoney(item.total)}</strong>
                  <small>{percent}%</small>
                </div>
                <em className="decision-category-kind">{getCategoryKind(item.categoria)}</em>
                <div className="decision-weekly-track" aria-hidden="true">
                  <div className="decision-weekly-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })
        ) : (
          <small>Todavia no hay egresos confirmados por categoria.</small>
        )}
      </div>
      <small>Las 3 principales categorias concentran {topPercent}% de tus egresos.</small>
      <strong>{recommendation}</strong>
    </article>
  );
}

function getCategoryMonthlyTotals(movimientos = []) {
  return getConfirmedExpenses(movimientos).reduce((acc, mov) => {
    const cycle = String(mov.fecha || '').slice(0, 7);
    const category = getMovementCategory(mov) || 'Sin categoria';
    if (!cycle) return acc;
    if (!acc[category]) acc[category] = {};
    acc[category][cycle] = (acc[category][cycle] || 0) + Number(mov.monto_ars || 0);
    return acc;
  }, {});
}

function CategoryTrendsCard({ movimientos = [], movimientosHistoricos = [], formatMoney, cycleContext, analysisConfidence }) {
  const isPartial = cycleContext?.cicloEnCurso;
  const currentByCategory = getConfirmedExpensesByCategory(movimientos);
  const historicalByCategory = getCategoryMonthlyTotals(movimientosHistoricos);
  const trends = Object.entries(currentByCategory)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 5)
    .map(([categoria, actual]) => {
      const monthlyValues = Object.entries(historicalByCategory[categoria] || {})
        .sort(([a], [b]) => String(b).localeCompare(String(a)))
        .slice(0, 3)
        .map(([, value]) => Number(value || 0))
        .filter((value) => value > 0);
      const promedio = monthlyValues.length > 0
        ? monthlyValues.reduce((acc, value) => acc + value, 0) / monthlyValues.length
        : 0;
      const desviacion = promedio > 0 ? ((Number(actual || 0) - promedio) / promedio) * 100 : null;
      const estado =
        desviacion == null ? 'sin referencia' : desviacion > 10 ? 'subiendo' : desviacion < -10 ? (isPartial ? 'parcial' : 'bajando') : 'estable';

      return { categoria, actual, promedio, desviacion, estado };
    });

  return (
    <article className="card decision-card decision-comparison-card">
      <DecisionCardHeader
        title="Tendencias por categoria"
        help="Compara cada categoria contra su promedio de los ultimos ciclos. Ayuda a distinguir gastos normales de tendencias que empiezan a crecer."
      />
      <ConfidenceBadge confidence={analysisConfidence} />
      {isPartial && <span className="pill muted decision-cycle-badge">Ciclo en curso</span>}
      {trends.length > 0 ? (
        <div className="decision-trend-list">
          {trends.map((item) => (
            <div className="decision-trend-row" key={item.categoria}>
              <span>{item.categoria}</span>
              <em className={`decision-trend-badge trend-${item.estado.replace(' ', '-')}`}>{item.estado === 'sin referencia' ? 'sin referencia' : item.estado}</em>
              <strong>{formatMoney(item.actual)}</strong>
              <small>{item.promedio > 0 ? formatMoney(item.promedio) : 'Sin historial suficiente'}</small>
              <b>{analysisConfidence?.isLow ? 'Comparacion orientativa' : isPartial && item.desviacion < 0 ? 'Por debajo del patron esperado' : item.desviacion == null ? '-' : formatVariation(item.desviacion)}</b>
            </div>
          ))}
        </div>
      ) : (
        <strong>Todavia no hay categorias con gasto confirmado para analizar.</strong>
      )}
    </article>
  );
}

function getHistoricalAverageForCategory(categoria, movimientosHistoricos = []) {
  const totalsByCycle = getConfirmedExpenses(movimientosHistoricos)
    .filter((mov) => isCategoryNamed(getMovementCategory(mov), categoria))
    .reduce((acc, mov) => {
      const cycle = String(mov.fecha || '').slice(0, 7);
      if (!cycle) return acc;
      acc[cycle] = (acc[cycle] || 0) + Number(mov.monto_ars || 0);
      return acc;
    }, {});
  const values = Object.entries(totalsByCycle)
    .sort(([a], [b]) => String(b).localeCompare(String(a)))
    .slice(0, 3)
    .map(([, value]) => Number(value || 0))
    .filter((value) => value > 0);

  return values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
}

function BehaviorAlertsCard({ movimientos = [], movimientosMesAnterior = [], movimientosHistoricos = [], ciclo, formatMoney, cycleContext }) {
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo, cycleContext);
  const isPartial = cycleContext?.cicloEnCurso;
  const progress = Math.min(Math.max(dayCurrent / Math.max(daysTotal, 1), 0), 1);
  const severityOrder = { Critica: 0, Atencion: 1, Observacion: 2 };
  const getSeverity = (tone, impact, expected) => {
    if (tone === 'over' && impact > Math.max(expected * 0.5, 50000)) return 'Critica';
    if (tone === 'under') return 'Atencion';
    if (tone === 'over') return 'Atencion';
    return 'Observacion';
  };
  const currentByCategory = getConfirmedExpensesByCategory(movimientos);
  const previousByCategory = getConfirmedExpensesByCategory(movimientosMesAnterior);
  const alerts = Object.entries(currentByCategory)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 5)
    .map(([categoria, actual]) => {
      const promedioHistorico = getHistoricalAverageForCategory(categoria, movimientosHistoricos);
      const esperadoActual = promedioHistorico * progress;
      const previous = getCategoryTotal(previousByCategory, categoria);
      const ratio = esperadoActual > 0 ? Number(actual || 0) / esperadoActual : null;
      const variacionMesAnterior = previous > 0 ? ((Number(actual || 0) - previous) / previous) * 100 : null;
      const candidates = [];

      if (ratio != null && ratio > 1.3) {
        const impact = Math.abs(Number(actual || 0) - esperadoActual);
        candidates.push({
          categoria,
          type: 'Sobreconsumo',
          tone: 'over',
          icon: '!',
          severity: getSeverity('over', impact, esperadoActual),
          impact,
          text: `${categoria} esta por encima del patron esperado. Revisá si fue un gasto puntual o si conviene frenar el ritmo.`,
          meta: `${formatMoney(actual)} vs esperado ${formatMoney(esperadoActual)}`
        });
      }

      if (ratio != null && ratio < 0.6) {
        const impact = Math.abs(esperadoActual - Number(actual || 0));
        candidates.push({
          categoria,
          type: 'Posible subregistro',
          tone: 'under',
          icon: 'i',
          severity: getSeverity('under', impact, esperadoActual),
          impact,
          text: `${categoria} esta por debajo de lo esperado para esta altura del ciclo. Revisá si faltan consumos por registrar.`,
          meta: `${formatMoney(actual)} vs esperado ${formatMoney(esperadoActual)}`
        });
      }

      if (variacionMesAnterior != null && Math.abs(variacionMesAnterior) > 30 && !(isPartial && progress < 0.5)) {
        const impact = Math.abs(Number(actual || 0) - previous);
        candidates.push({
          categoria,
          type: isPartial && variacionMesAnterior < 0 ? 'Lectura parcial' : 'Cambio fuerte',
          tone: 'change',
          icon: '%',
          severity: getSeverity('change', impact, previous),
          impact,
          text: isPartial && variacionMesAnterior < 0
            ? `${categoria} esta por debajo de lo esperado para esta altura del ciclo. Revisá si faltan consumos por registrar.`
            : `${categoria} se movio distinto al mes anterior. Revisá si responde a un gasto puntual o a un nuevo patrón.`,
          meta: isPartial && variacionMesAnterior < 0
            ? `${formatMoney(actual)} confirmado al momento. Ciclo en curso.`
            : `${formatMoney(actual)} vs mes anterior ${formatMoney(previous)}`
        });
      }

      return candidates.sort((a, b) => b.impact - a.impact)[0] || null;
    })
    .filter(Boolean)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.impact - a.impact)
    .slice(0, 3);

  return (
    <article className="card decision-card decision-comparison-card decision-behavior-alerts">
      <DecisionCardHeader
        title="Alertas de comportamiento"
        help="Detecta desvios por categoria usando avance del ciclo e historial reciente. No muestra alertas si no hay cambios relevantes."
      />
      {isPartial && <span className="pill muted decision-cycle-badge">Ciclo en curso</span>}
      {alerts.length > 0 ? (
        <div className="decision-alert-list">
          {alerts.map((alert) => (
            <div className={`decision-alert-row alert-${alert.tone}`} key={`${alert.type}-${alert.categoria}`}>
              <span className="decision-alert-icon" aria-hidden="true">{alert.icon}</span>
              <div>
                <strong>{alert.severity}: {alert.type}</strong>
                <p>{alert.text}</p>
                <small>{alert.meta}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <strong>Sin alertas relevantes por ahora.</strong>
      )}
    </article>
  );
}

function getConfirmedExpensesByCategory(movimientos, predicate = () => true) {
  return getConfirmedExpenses(movimientos).filter(predicate).reduce((acc, mov) => {
    const category = getMovementCategory(mov) || 'Sin categoria';
    acc[category] = (acc[category] || 0) + Number(mov.monto_ars || 0);
    return acc;
  }, {});
}

function isCategoryNamed(category, target) {
  return normalizeCategoryName(category) === normalizeCategoryName(target);
}

function getCategoryTotal(categoryMap, category) {
  const match = Object.entries(categoryMap).find(([key]) => isCategoryNamed(key, category));
  return Number(match?.[1] || 0);
}

function getCategoryReference({ categoria, movimientosHistoricos = [], fallbackAnterior = 0 }) {
  const totalsByCycle = getConfirmedExpenses(movimientosHistoricos)
    .filter((mov) => isCategoryNamed(getMovementCategory(mov), categoria))
    .reduce((acc, mov) => {
      const cycle = String(mov.fecha || '').slice(0, 7);
      if (!cycle) return acc;
      acc[cycle] = (acc[cycle] || 0) + Number(mov.monto_ars || 0);
      return acc;
    }, {});
  const values = Object.values(totalsByCycle).filter((value) => value > 0);

  if (values.length > 1) {
    return {
      amount: values.reduce((acc, value) => acc + value, 0) / values.length,
      label: 'Promedio habitual'
    };
  }

  return {
    amount: Number(values[0] || fallbackAnterior || 0),
    label: values.length === 1 ? 'Historial disponible' : 'Mes anterior'
  };
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

function buildDeviationContext(item, ingresos, totalEgresos) {
  const percentIngresos = ingresos > 0 ? (item.actual / ingresos) * 100 : null;
  const percentEgresos = totalEgresos > 0 ? (item.actual / totalEgresos) * 100 : 0;
  const shareText = percentIngresos != null
    ? `${formatPercent(percentIngresos)} de tus ingresos del ciclo`
    : `${formatPercent(percentEgresos)} de tus egresos confirmados`;
  const variationText = item.variation == null ? 'sin comparacion mensual' : formatVariation(item.variation);

  if (item.kind === 'extraordinario') {
    return `Gasto puntual alto: representa el ${shareText}`;
  }
  if (item.kind === 'variable') {
    return `Gasto variable alto: ${variationText} respecto al mes anterior`;
  }
  if (item.tarjeta) {
    return `Tarjeta por encima de referencia: ${variationText} respecto a ${String(item.referenceLabel || 'tu referencia').toLowerCase()}`;
  }
  return `Gasto recurrente mas alto de lo habitual: ${variationText} respecto al mes anterior`;
}

function RelevantDeviationsCard({ movimientos = [], movimientosMesAnterior = [], movimientosHistoricos = [], resumen, formatMoney }) {
  const ingresos = Number(resumen?.ingresos || 0);
  const currentByCategory = getConfirmedExpensesByCategory(movimientos);
  const previousByCategory = getConfirmedExpensesByCategory(movimientosMesAnterior);
  const totalEgresos = Object.values(currentByCategory).reduce((acc, value) => acc + Number(value || 0), 0);
  const deviations = Object.entries(currentByCategory)
    .map(([categoria, actual]) => {
      const kind = getCategoryKind(categoria);
      const tarjeta = isCategoryNamed(categoria, 'Tarjeta');
      const previousAmount = getCategoryTotal(previousByCategory, categoria);
      const reference = tarjeta
        ? getCategoryReference({ categoria, movimientosHistoricos, fallbackAnterior: previousAmount })
        : { amount: previousAmount, label: 'Mes anterior' };
      const anterior = Number(reference.amount || 0);
      const variation = getVariation(actual, anterior);

      if (kind === 'variable' && anterior > 0 && actual > anterior * 1.2) {
        return {
          categoria,
          actual,
          anterior,
          referenceLabel: reference.label,
          kind,
          tarjeta,
          variation,
          recommendation: 'Revisa si este consumo puede moderarse el resto del ciclo.'
        };
      }

      if (kind === 'recurrente_variable' && anterior > 0 && actual > anterior * (tarjeta ? 1.2 : 1.15)) {
        return {
          categoria,
          actual,
          anterior,
          referenceLabel: reference.label,
          kind,
          tarjeta,
          variation,
          recommendation: tarjeta
            ? 'La tarjeta viene por encima de tu referencia habitual.'
            : 'Este gasto recurrente vino mas alto de lo habitual. Revisa su composicion.'
        };
      }

      if (kind === 'extraordinario' && ingresos > 0 && actual > ingresos * 0.05) {
        return {
          categoria,
          actual,
          anterior,
          referenceLabel: 'Ingresos del ciclo',
          kind,
          tarjeta,
          variation: null,
          recommendation: 'Gasto puntual relevante. No lo proyectes como consumo normal.'
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.actual || 0) - Number(a.actual || 0))
    .slice(0, 3);

  return (
    <article className="card decision-card decision-comparison-card decision-card-featured">
      <DecisionCardHeader
        title="Desvios relevantes"
        help="Detecta cambios importantes frente a referencias anteriores. Ayuda a decidir que gasto revisar antes de asumir nuevos compromisos."
      />
      {deviations.length > 0 ? (
        <div className="decision-weekly-list">
          {deviations.map((item) => (
            <div className="decision-deviation-row" key={`${item.kind}-${item.categoria}`}>
              <div>
                <span>{item.categoria}</span>
                <em>{buildDeviationContext(item, ingresos, totalEgresos)}</em>
              </div>
              <strong>{formatMoney(item.actual)}</strong>
              <small>
                {item.referenceLabel || 'Referencia'}: {item.anterior > 0 ? formatMoney(item.anterior) : 'Sin referencia'} | {item.variation == null ? 'Sin comparacion mensual' : formatVariation(item.variation)}
              </small>
              <p>{item.recommendation}</p>
            </div>
          ))}
        </div>
      ) : (
        <strong>Sin desvios relevantes. El comportamiento esta dentro de parametros razonables.</strong>
      )}
    </article>
  );
}

function SavingOpportunityCard({ realisticProjection, decisionContext, ciclo, formatMoney }) {
  const {
    balanceEstimado,
    egresosPendientes,
    variablesEsperadosRestantes
  } = realisticProjection;
  const { colchonMinimo, margenAhorroReal, puedeAhorrar, recomendacionPrincipal } = decisionContext;
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo);
  const diasRestantes = Math.max(daysTotal - dayCurrent, 0);
  const estado = puedeAhorrar ? 'Ahorro posible' : 'Sin margen sugerido';
  const tone = puedeAhorrar ? 'positive' : 'muted';
  const recommendation = recomendacionPrincipal;

  return (
    <article className="card decision-card decision-comparison-card decision-card-primary">
      <DecisionCardHeader
        title="Oportunidad de ahorro"
        help="Calcula cuanto podrias separar manteniendo un colchon minimo. Sirve para decidir si ahorrar ahora o esperar a cubrir pendientes."
      />
      <em className={`decision-status ${tone}`}>{estado}</em>
      <div className="decision-comparison-grid">
        <div className="decision-comparison-row">
          <span>Balance estimado realista</span>
          <strong>{formatMoney(balanceEstimado)}</strong>
          <small>Segun tipo funcional de gasto</small>
        </div>
        <div className="decision-comparison-row">
          <span>Colchon minimo sugerido</span>
          <strong>{formatMoney(colchonMinimo)}</strong>
          <small>10% ingresos, pendientes o variables restantes</small>
        </div>
        <div className="decision-comparison-row">
          <span>Monto sugerido para ahorro</span>
          <strong>{formatMoney(Math.max(margenAhorroReal, 0))}</strong>
          <small>{diasRestantes} dias restantes</small>
        </div>
      </div>
      <div className="decision-composition-grid">
        <span>Variables restantes <strong>{formatMoney(variablesEsperadosRestantes)}</strong></span>
        <span>Egresos pendientes <strong>{formatMoney(egresosPendientes)}</strong></span>
      </div>
      <strong>{recommendation}</strong>
    </article>
  );
}

function ExecutiveSummary({ resumen, operativo, categorias, decisionContext, realisticProjection, nivelControl, analysisConfidence, formatMoney }) {
  const ingresos = Number(realisticProjection?.ingresoEstimado || resumen?.ingresos || 0);
  const egresos = Number(resumen?.egresos || 0);
  const balanceProyectado = Number(realisticProjection?.balanceEstimado ?? resumen?.balance_proyectado ?? 0);
  const pendientes = Number(operativo?.montoPendienteEgresos || 0);
  const totalCategorias = categorias.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const topCategoriaPercent = totalCategorias > 0 ? (Number(categorias[0]?.total || 0) / totalCategorias) * 100 : 0;
  const ratioEgresos = ingresos > 0 ? (egresos / ingresos) * 100 : 0;
  const estado =
    balanceProyectado < 0 ? 'Riesgo de deficit' : ingresos > 0 && balanceProyectado <= ingresos * 0.1 ? 'Mes ajustado' : 'Mes con margen';
  const riesgo =
    pendientes > 0
        ? 'Todavia hay pagos pendientes'
        : ratioEgresos > 90
          ? 'Egresos altos respecto a ingresos'
        : topCategoriaPercent > 30
          ? 'Alta concentracion en una categoria'
          : 'Sin alertas relevantes';
  const accion = decisionContext?.recomendacionPrincipal || (
    balanceProyectado < 0
      ? 'Postergar gastos no esenciales'
      : estado === 'Mes ajustado'
        ? 'Esperar a confirmar pendientes antes de ahorrar'
        : 'Evaluar separar ahorro o comprar USD'
  );
  const showLowConfidence = analysisConfidence?.isLow;

  return (
    <div className="decision-executive-summary">
      {nivelControl && <p><span>Nivel de control</span><strong>{nivelControl.nivelControl}: {nivelControl.texto}</strong></p>}
      {showLowConfidence && <p><span>Calidad del analisis</span><strong>Historial limitado: lectura orientativa.</strong></p>}
      <p><span>Estado del mes</span><strong>{showLowConfidence && ingresos === 0 && egresos === 0 ? 'Sin datos suficientes' : estado}</strong></p>
      <p><span>Riesgo principal</span><strong>{showLowConfidence && ingresos === 0 && egresos === 0 ? 'No hay base suficiente para detectar riesgos.' : riesgo}</strong></p>
      <p><span>Accion sugerida</span><strong>{showLowConfidence && ingresos === 0 && egresos === 0 ? 'Cargar movimientos reales para mejorar el analisis.' : accion}</strong></p>
      <p><span>Balance estimado</span><strong>{formatMoney(balanceProyectado)}</strong></p>
    </div>
  );
}

export default function DecisionesPanel({
  resumen,
  operativo,
  categoriaPrincipal,
  categorias = [],
  serieMensual = [],
  movimientos = [],
  movimientosMesAnterior = [],
  movimientosHistoricos = [],
  ciclo = '',
  cycleContext = null,
  nivelControl = null,
  analysisConfidence = null,
  formatMoney
}) {
  const cicloInfo = cycleContext || getCycleContext(ciclo);
  const balanceActual = Number(resumen?.balance_actual || 0);
  const balanceProyectado = Number(resumen?.balance_proyectado || 0);
  const pendiente = Number(operativo?.montoPendienteEgresos || 0);
  const porcentajePagado = Number(operativo?.porcentajeEgresosPagados || 0);
  const realisticProjection = calculateRealisticProjection({ movimientos, movimientosMesAnterior, resumen, ciclo });
  const decisionContext = buildDecisionContext({ resumen, realisticProjection });
  const balanceEsperado = Number(realisticProjection?.balanceEstimado ?? balanceProyectado);
  const currentByCategory = getConfirmedExpensesByCategory(movimientos);
  const previousByCategory = getConfirmedExpensesByCategory(movimientosMesAnterior);
  const categoryNames = Array.from(new Set([...Object.keys(currentByCategory), ...Object.keys(previousByCategory)]));
  const cycleProgressRatio = Math.min(Math.max((cicloInfo?.avanceCicloPorcentaje || 100) / 100, 0), 1);
  const categoriesBelowPattern = categoryNames.filter((category) => {
    const average = getHistoricalAverageForCategory(category, movimientosHistoricos);
    if (average <= 0) return false;
    const expected = average * cycleProgressRatio;
    return Number(currentByCategory[category] || 0) < expected * 0.75;
  }).length;
  const weeklyTotals = [0, 0, 0, 0];
  getConfirmedExpenses(movimientos).forEach((mov) => {
    weeklyTotals[getWeekIndex(mov.fecha)] += Number(mov.monto_ars || 0);
  });
  const weeklyTotal = weeklyTotals.reduce((sum, value) => sum + value, 0);
  const topWeekIndex = weeklyTotals.reduce((best, value, index) => value > weeklyTotals[best] ? index : best, 0);
  const topWeekPercent = weeklyTotal > 0 ? Math.round((weeklyTotals[topWeekIndex] / weeklyTotal) * 100) : 0;
  const topCategoriesTotal = categorias
    .slice(0, 3)
    .reduce((sum, item) => sum + Number(item.total || 0), 0);
  const totalCategories = categorias.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const topCategoriesPercent = totalCategories > 0 ? Math.round((topCategoriesTotal / totalCategories) * 100) : 0;
  const lastMonth = serieMensual[serieMensual.length - 1];
  const previousMonth = serieMensual[serieMensual.length - 2];
  const comparisonHasData = hasFinancialSignal(lastMonth) && hasFinancialSignal(previousMonth);
  const comparisonHasSignal = comparisonHasData && Math.abs(Number(lastMonth?.egresos || 0) - Number(previousMonth?.egresos || 0)) > 0;
  const comparisonSummary = !comparisonHasData
    ? 'Comparacion: sin datos suficientes'
    : analysisConfidence?.isLow
    ? 'Comparacion: orientativa por historial limitado'
    : cicloInfo?.cicloEnCurso ? 'Comparacion: egresos parciales del ciclo' : 'Comparacion: cierre vs mes anterior';
  const trendsSummary = categoriesBelowPattern > 0
    ? `${analysisConfidence?.isLow ? 'Tendencias orientativas' : 'Tendencias'}: ${categoriesBelowPattern} categorias por debajo del patron`
    : 'Tendencias: sin desvios fuertes';
  const weeklySummary = weeklyTotal > 0
    ? `Distribucion semanal: gasto concentrado en semana ${topWeekIndex + 1}`
    : 'Distribucion semanal: sin egresos confirmados';
  const criticalSummary = topCategoriesPercent > 0
    ? `Categorias criticas: top 3 concentran ${topCategoriesPercent}%`
    : 'Categorias criticas: sin datos confirmados';
  const controlSummary = nivelControl
    ? `Control operativo: nivel ${nivelControl.nivelControl}`
    : 'Control operativo: indicadores base';

  const cards = [
    {
      title: 'Margen disponible',
      metric: formatMoney(balanceActual),
      text: 'Balance real del ciclo con movimientos confirmados.',
      recommendation: balanceActual >= 0 ? 'Mantener control antes de nuevos gastos.' : 'Priorizar ingresos o recortes inmediatos.',
      tone: 'balance'
    },
    {
      title: 'Impacto pendiente',
      metric: formatMoney(balanceEsperado - balanceActual),
      text: 'Diferencia entre balance actual y cierre estimado.',
      recommendation: pendiente > 0 ? 'Revisar pendientes antes de cerrar.' : 'Sin impacto pendiente relevante.',
      tone: 'expense'
    },
    {
      title: 'Avance de pagos',
      metric: `${porcentajePagado}%`,
      text: 'Porcentaje de egresos pagados del ciclo.',
      recommendation: porcentajePagado >= 80 ? 'Buen avance de control mensual.' : 'Conviene ordenar pagos pendientes.',
      tone: 'income'
    },
    {
      title: 'Categoria sensible',
      metric: categoriaPrincipal?.categoria || 'Sin datos',
      text: categoriaPrincipal ? `${formatMoney(categoriaPrincipal.total)} confirmados.` : 'Aun no hay gastos confirmados.',
      recommendation: categoriaPrincipal ? 'Monitorear esta categoria esta semana.' : 'Cargar movimientos para analizar.',
      tone: 'saving'
    }
  ];

  return (
    <section className="decisiones-panel">
      <div className="panel-header decisiones-header">
        <h2>Decisiones del mes</h2>
        <p>Analisis y sugerencias basadas en tu comportamiento</p>
      </div>
      <ExecutiveSummary
        resumen={resumen}
        operativo={operativo}
        categorias={categorias}
        decisionContext={decisionContext}
        realisticProjection={realisticProjection}
        nivelControl={nivelControl}
        analysisConfidence={analysisConfidence}
        formatMoney={formatMoney}
      />
      <DecisionSection title="Decision principal">
        <div className="decision-section-grid decision-main-grid">
          <ProjectionByFunctionalTypeCard
            movimientos={movimientos}
            movimientosMesAnterior={movimientosMesAnterior}
            resumen={resumen}
            ciclo={ciclo}
            formatMoney={formatMoney}
            realisticProjection={realisticProjection}
          />
          <SavingOpportunityCard
            realisticProjection={realisticProjection}
            decisionContext={decisionContext}
            ciclo={ciclo}
            formatMoney={formatMoney}
          />
        </div>
      </DecisionSection>

      <DecisionSection title="Alertas de comportamiento">
        <div className="decision-section-grid decision-watch-grid">
          <BehaviorAlertsCard
            movimientos={movimientos}
            movimientosMesAnterior={movimientosMesAnterior}
            movimientosHistoricos={movimientosHistoricos}
            ciclo={ciclo}
            formatMoney={formatMoney}
            cycleContext={cicloInfo}
            analysisConfidence={analysisConfidence}
          />
        </div>
      </DecisionSection>

      <DecisionAccordion
        title="Comparacion vs mes anterior"
        headerSummary={comparisonSummary}
        defaultOpen={Boolean(comparisonHasSignal && !cicloInfo?.cicloEnCurso)}
      >
        <div className="decision-section-grid decision-change-grid">
          <ComparisonCard
            serieMensual={serieMensual}
            movimientos={movimientos}
            movimientosMesAnterior={movimientosMesAnterior}
            formatMoney={formatMoney}
            cycleContext={cicloInfo}
            analysisConfidence={analysisConfidence}
          />
        </div>
      </DecisionAccordion>

      <DecisionAccordion
        title="Tendencias por categoria"
        headerSummary={trendsSummary}
        defaultOpen={categoriesBelowPattern > 0}
      >
        <div className="decision-section-grid decision-change-grid">
          <CategoryTrendsCard
            movimientos={movimientos}
            movimientosHistoricos={movimientosHistoricos}
            formatMoney={formatMoney}
            cycleContext={cicloInfo}
            analysisConfidence={analysisConfidence}
          />
        </div>
      </DecisionAccordion>

      <DecisionAccordion
        title="Distribucion semanal"
        headerSummary={weeklySummary}
        defaultOpen={topWeekPercent >= 40}
      >
        <div className="decision-section-grid decision-watch-grid">
          <WeeklyDistributionCard movimientos={movimientos} formatMoney={formatMoney} />
        </div>
      </DecisionAccordion>

      <DecisionAccordion
        title="Categorias criticas"
        headerSummary={criticalSummary}
        defaultOpen={topCategoriesPercent >= 50}
      >
        <div className="decision-section-grid decision-watch-grid">
          <RelevantDeviationsCard
            movimientos={movimientos}
            movimientosMesAnterior={movimientosMesAnterior}
            movimientosHistoricos={movimientosHistoricos}
            resumen={resumen}
            formatMoney={formatMoney}
          />
          <CriticalCategoriesCard categorias={categorias} formatMoney={formatMoney} />
        </div>
      </DecisionAccordion>

      <DecisionAccordion
        title="Control operativo"
        headerSummary={controlSummary}
        defaultOpen={nivelControl?.nivelControl === 'Bajo'}
      >
        <div className="decision-section-grid decision-ops-grid">
          {cards.map((card) => (
            <DecisionCard key={card.title} {...card} />
          ))}
        </div>
      </DecisionAccordion>
    </section>
  );
}

