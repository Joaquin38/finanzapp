function DecisionCard({ title, metric, text, recommendation, tone = 'balance' }) {
  return (
    <article className={`card decision-card card-${tone}`}>
      <h3>{title}</h3>
      <p>{metric}</p>
      <small>{text}</small>
      <strong>{recommendation}</strong>
    </article>
  );
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

function ComparisonRow({ label, tipo, actual, anterior, formatMoney }) {
  const variacion = getVariation(actual, anterior);
  const tone = getVariationTone(tipo, variacion);

  return (
    <div className="decision-comparison-row">
      <span>{label}</span>
      <strong>{formatMoney(actual)}</strong>
      <small>Anterior: {formatMoney(anterior)}</small>
      <em className={`decision-variation ${tone}`}>{formatVariation(variacion)}</em>
    </div>
  );
}

function getComparisonRecommendation(actual, anterior) {
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

function ComparisonCard({ serieMensual, formatMoney }) {
  const actual = serieMensual?.[serieMensual.length - 1] || { ingresos: 0, egresos: 0, balance: 0 };
  const anterior = serieMensual?.[serieMensual.length - 2] || { ingresos: 0, egresos: 0, balance: 0 };
  const recommendation = getComparisonRecommendation(actual, anterior);

  return (
    <article className="card decision-card decision-comparison-card">
      <h3>Comparacion vs mes anterior</h3>
      <div className="decision-comparison-grid">
        <ComparisonRow
          label="Ingresos"
          tipo="ingresos"
          actual={Number(actual.ingresos || 0)}
          anterior={Number(anterior.ingresos || 0)}
          formatMoney={formatMoney}
        />
        <ComparisonRow
          label="Egresos"
          tipo="egresos"
          actual={Number(actual.egresos || 0)}
          anterior={Number(anterior.egresos || 0)}
          formatMoney={formatMoney}
        />
        <ComparisonRow
          label="Balance"
          tipo="balance"
          actual={Number(actual.balance || 0)}
          anterior={Number(anterior.balance || 0)}
          formatMoney={formatMoney}
        />
      </div>
      <strong>{recommendation}</strong>
    </article>
  );
}

function getCycleProgress(ciclo) {
  const [yearText, monthText] = String(ciclo || '').split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const today = new Date();
  const sameCycle = today.getFullYear() === year && today.getMonth() === monthIndex;
  const daysTotal = new Date(year, monthIndex + 1, 0).getDate();
  const dayCurrent = sameCycle ? today.getDate() : daysTotal;

  return {
    dayCurrent: Math.min(Math.max(dayCurrent || 1, 1), daysTotal || 1),
    daysTotal: daysTotal || 1
  };
}

function getCurrentConfirmedExpensesUntilToday(movimientos, ciclo, dayCurrent) {
  const limitDay = String(dayCurrent).padStart(2, '0');
  const limitDate = `${ciclo}-${limitDay}`;

  return movimientos
    .filter((mov) => ['egreso', 'ahorro'].includes(mov.tipo_movimiento))
    .filter((mov) =>
      mov.tipo_movimiento === 'ahorro'
        ? ['registrado', 'cobrado'].includes(mov.estado_consolidado)
        : mov.estado_consolidado === 'pagado'
    )
    .filter((mov) => String(mov.fecha || '').slice(0, 10) <= limitDate)
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
}

function getConfirmedExpenses(movimientos) {
  return movimientos.filter((mov) =>
    ['egreso', 'ahorro'].includes(mov.tipo_movimiento) &&
    (mov.tipo_movimiento === 'ahorro'
      ? ['registrado', 'cobrado'].includes(mov.estado_consolidado)
      : mov.estado_consolidado === 'pagado')
  );
}

function RhythmCard({ movimientos, ciclo, serieMensual, formatMoney }) {
  const anterior = serieMensual?.[serieMensual.length - 2] || null;
  const anteriorEgresos = Number(anterior?.egresos || 0);
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo);
  const actual = getCurrentConfirmedExpensesUntilToday(movimientos, ciclo, dayCurrent);
  const esperado = anteriorEgresos > 0 ? anteriorEgresos * (dayCurrent / daysTotal) : 0;
  const diferencia = actual - esperado;
  const variacion = getVariation(actual, esperado);
  const sinHistorial = anteriorEgresos <= 0;
  const status =
    sinHistorial ? 'Sin historial' : actual > esperado * 1.1 ? 'Ritmo alto' : actual < esperado * 0.9 ? 'Ritmo bajo' : 'Ritmo normal';
  const tone = sinHistorial ? 'muted' : status === 'Ritmo alto' ? 'warning' : status === 'Ritmo bajo' ? 'positive' : 'muted';
  const recommendation =
    sinHistorial
      ? 'Falta historial para calcular ritmo esperado.'
      : status === 'Ritmo alto'
        ? 'Estas gastando mas rapido que el mes anterior. Conviene frenar gastos variables esta semana.'
        : status === 'Ritmo bajo'
          ? 'Venis gastando menos que el mes anterior. Podes evaluar separar ahorro o comprar USD si tu liquidez lo permite.'
          : 'El gasto viene alineado al mes anterior. Mantene el seguimiento antes de tomar decisiones grandes.';

  return (
    <article className="card decision-card decision-comparison-card">
      <h3>Ritmo del mes</h3>
      <em className={`decision-status ${tone}`}>{status}</em>
      <div className="decision-comparison-grid">
        <div className="decision-comparison-row">
          <span>Gastado hasta hoy</span>
          <strong>{formatMoney(actual)}</strong>
          <small>Dia {dayCurrent} de {daysTotal}</small>
        </div>
        <div className="decision-comparison-row">
          <span>Esperado segun mes anterior</span>
          <strong>{formatMoney(esperado)}</strong>
          <small>Proyeccion al dia actual</small>
        </div>
        <div className="decision-comparison-row">
          <span>Diferencia</span>
          <strong>{formatMoney(diferencia)}</strong>
          <em className={`decision-variation ${tone}`}>{sinHistorial ? 'Sin referencia' : formatVariation(variacion)}</em>
        </div>
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
      <h3>Distribucion semanal</h3>
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

function getWeeklyDistributionPercentages(movimientos) {
  const totals = [0, 0, 0, 0];
  getConfirmedExpenses(movimientos).forEach((mov) => {
    totals[getWeekIndex(mov.fecha)] += Number(mov.monto_ars || 0);
  });
  const total = totals.reduce((acc, value) => acc + value, 0);
  return {
    total,
    percentages: totals.map((value) => (total > 0 ? value / total : 0))
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
  const ingresosDelCiclo = Number(resumen?.ingresos || 0);
  const balanceEstimado = ingresosDelCiclo - egresoProyectado;
  const margenRatio = ingresosDelCiclo > 0 ? balanceEstimado / ingresosDelCiclo : 0;
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
      <h3>Proyeccion por ritmo actual</h3>
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
      <h3>Categorias criticas</h3>
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

function SavingOpportunityCard({ resumen, operativo, ciclo, formatMoney }) {
  const ingresos = Number(resumen?.ingresos || 0);
  const balanceProyectado = Number(resumen?.balance_proyectado || 0);
  const egresosPendientes = Number(operativo?.montoPendienteEgresos || 0);
  const { dayCurrent, daysTotal } = getCycleProgress(ciclo);
  const diasRestantes = Math.max(daysTotal - dayCurrent, 0);
  const colchonMinimo = Math.max(ingresos * 0.1, egresosPendientes);
  const ahorroSugerido = balanceProyectado - colchonMinimo;
  const tieneMargen = ahorroSugerido > 0;
  const estado = tieneMargen ? 'Ahorro posible' : 'Sin margen sugerido';
  const tone = tieneMargen ? 'positive' : 'muted';
  const recommendation = !tieneMargen
    ? 'No conviene separar ahorro todavia. Primero confirma pendientes y revisa gastos variables.'
    : diasRestantes < 7
      ? 'Quedan pocos dias del ciclo: es buen momento para separar ahorro o comprar USD si ya cubriste pendientes.'
      : `Podrias separar hasta ${formatMoney(ahorroSugerido)} sin dejar el ciclo demasiado justo.`;

  return (
    <article className="card decision-card decision-comparison-card">
      <h3>Oportunidad de ahorro</h3>
      <em className={`decision-status ${tone}`}>{estado}</em>
      <div className="decision-comparison-grid">
        <div className="decision-comparison-row">
          <span>Balance proyectado</span>
          <strong>{formatMoney(balanceProyectado)}</strong>
          <small>Margen disponible proyectado</small>
        </div>
        <div className="decision-comparison-row">
          <span>Colchon minimo sugerido</span>
          <strong>{formatMoney(colchonMinimo)}</strong>
          <small>Mayor entre 10% ingresos y pendientes</small>
        </div>
        <div className="decision-comparison-row">
          <span>Monto sugerido para ahorro</span>
          <strong>{formatMoney(Math.max(ahorroSugerido, 0))}</strong>
          <small>{diasRestantes} dias restantes</small>
        </div>
      </div>
      <strong>{recommendation}</strong>
    </article>
  );
}

function ExecutiveSummary({ resumen, operativo, categorias }) {
  const ingresos = Number(resumen?.ingresos || 0);
  const egresos = Number(resumen?.egresos || 0);
  const balanceProyectado = Number(resumen?.balance_proyectado || 0);
  const pendientes = Number(operativo?.montoPendienteEgresos || 0);
  const totalCategorias = categorias.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const topCategoriaPercent = totalCategorias > 0 ? (Number(categorias[0]?.total || 0) / totalCategorias) * 100 : 0;
  const ratioEgresos = ingresos > 0 ? (egresos / ingresos) * 100 : 0;
  const estado =
    balanceProyectado < 0 ? 'Riesgo de deficit' : ingresos > 0 && balanceProyectado <= ingresos * 0.1 ? 'Mes ajustado' : 'Mes con margen';
  const riesgo =
    ratioEgresos > 90
      ? 'Egresos muy altos respecto a ingresos'
      : pendientes > 0
        ? 'Todavia hay pagos pendientes'
        : topCategoriaPercent > 30
          ? 'Alta concentracion en una categoria'
          : 'Sin alertas relevantes';
  const accion =
    balanceProyectado < 0
      ? 'Postergar gastos no esenciales'
      : estado === 'Mes ajustado'
        ? 'Esperar a confirmar pendientes antes de ahorrar'
        : 'Evaluar separar ahorro o comprar USD';

  return (
    <div className="decision-executive-summary">
      <p><span>Estado del mes</span><strong>{estado}</strong></p>
      <p><span>Riesgo principal</span><strong>{riesgo}</strong></p>
      <p><span>Accion sugerida</span><strong>{accion}</strong></p>
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
  ciclo = '',
  formatMoney
}) {
  const balanceActual = Number(resumen?.balance_actual || 0);
  const balanceProyectado = Number(resumen?.balance_proyectado || 0);
  const pendiente = Number(operativo?.montoPendienteEgresos || 0);
  const porcentajePagado = Number(operativo?.porcentajeEgresosPagados || 0);

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
      metric: formatMoney(balanceProyectado - balanceActual),
      text: 'Diferencia entre balance actual y proyectado.',
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
      <ExecutiveSummary resumen={resumen} operativo={operativo} categorias={categorias} />
      <div className="cards-grid decisiones-grid">
        <ComparisonCard serieMensual={serieMensual} formatMoney={formatMoney} />
        <RhythmCard movimientos={movimientos} ciclo={ciclo} serieMensual={serieMensual} formatMoney={formatMoney} />
        <WeeklyDistributionCard movimientos={movimientos} formatMoney={formatMoney} />
        <ProjectionByPaceCard
          movimientos={movimientos}
          movimientosMesAnterior={movimientosMesAnterior}
          resumen={resumen}
          ciclo={ciclo}
          formatMoney={formatMoney}
        />
        <CriticalCategoriesCard categorias={categorias} formatMoney={formatMoney} />
        <SavingOpportunityCard resumen={resumen} operativo={operativo} ciclo={ciclo} formatMoney={formatMoney} />
        {cards.map((card) => (
          <DecisionCard key={card.title} {...card} />
        ))}
      </div>
    </section>
  );
}
