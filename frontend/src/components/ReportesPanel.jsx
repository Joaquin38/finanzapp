import { useState } from 'react';
import { getCycleContext } from '../utils/cycle.js';

const AGRUPAR_CATEGORIAS_CHICAS = true;
const UMBRAL_OTROS_PORCENTAJE = 4;

const REPORTES_BASE = [
  {
    key: 'mensual',
    label: 'Resumen mensual',
    title: 'Resumen mensual',
    description: 'Vista general del ciclo con balance, cumplimiento y comparativas simples.'
  },
  {
    key: 'categorias',
    label: 'Por categoria',
    title: 'Gastos por categoria',
    description: 'Espacio preparado para analizar distribucion, concentracion y evolucion por categoria.'
  },
  {
    key: 'tendencias',
    label: 'Tendencias',
    title: 'Tendencias y comparativas',
    description: 'Base para mostrar variaciones entre ciclos, desvíos y patrones relevantes.'
  },
  {
    key: 'patrones',
    label: 'Evoluci\u00f3n por categor\u00eda',
    title: 'Patr\u00f3n de gasto por categor\u00eda',
    description: 'Evolucion de movimientos confirmados por categoria y proyeccion del ciclo abierto.'
  }
];

const CATEGORY_CURVE_COLORS = ['#2f6fb3', '#b45f5f', '#2f7d46', '#a16207', '#6b5ca5', '#4c8a86'];

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedMoney(value) {
  const amount = Number(value || 0);
  if (amount === 0) return formatMoney(0);
  return `${amount > 0 ? '+' : '-'}${formatMoney(Math.abs(amount))}`;
}

function formatVariation(value) {
  if (!Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function calculateVariation(actual, previous) {
  const current = Number(actual || 0);
  const base = Number(previous || 0);
  if (base === 0) {
    if (current === 0) return 0;
    return NaN;
  }
  return ((current - base) / Math.abs(base)) * 100;
}

function formatPartialVariationText(item) {
  if (!Number.isFinite(item.value)) return 'Sin referencia';
  const direction = item.value > 0 ? 'subieron' : item.value < 0 ? 'bajaron' : 'sin cambios';
  return `${direction} ${Math.abs(item.value).toFixed(1)}%`;
}

function calculateExpenseIncomeRatio(expenses, income) {
  const totalExpenses = Number(expenses || 0);
  const totalIncome = Number(income || 0);
  if (totalIncome <= 0) return null;
  return (totalExpenses / totalIncome) * 100;
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = {
    x: cx + radius * Math.cos(startAngle),
    y: cy + radius * Math.sin(startAngle)
  };
  const end = {
    x: cx + radius * Math.cos(endAngle),
    y: cy + radius * Math.sin(endAngle)
  };
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function buildSmoothPath(points = []) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = current.x + (next.x - current.x) / 2;

    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function formatCycleLabel(ciclo) {
  if (!ciclo) return '-';
  return new Date(`${ciclo}-01T00:00:00`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', '');
}

function isConfirmedMovement(mov) {
  if (mov?.clasificacion_movimiento && mov.clasificacion_movimiento !== 'normal') return false;
  if (mov?.tipo_movimiento === 'egreso') return mov.estado_consolidado === 'pagado';
  if (['ingreso', 'ahorro'].includes(mov?.tipo_movimiento)) return ['registrado', 'cobrado'].includes(mov.estado_consolidado);
  return false;
}

function isProjectedMovement(mov) {
  if (mov?.clasificacion_movimiento && mov.clasificacion_movimiento !== 'normal') return false;
  return ['ingreso', 'egreso', 'ahorro'].includes(mov?.tipo_movimiento);
}

function buildMovementPatternSeries(movimientosPorCiclo = [], cicloActual = '') {
  return movimientosPorCiclo.map(({ ciclo, movimientos = [] }) => {
    const confirmed = {};
    const projected = {};
    movimientos.forEach((mov) => {
      const category = mov.categoria || 'Sin categoria';
      const amount = Number(mov.monto_ars || 0);
      if (isConfirmedMovement(mov)) confirmed[category] = (confirmed[category] || 0) + amount;
      if (ciclo === cicloActual && isProjectedMovement(mov)) projected[category] = (projected[category] || 0) + amount;
    });
    return { ciclo, label: formatCycleLabel(ciclo), confirmed, projected: ciclo === cicloActual ? projected : null };
  });
}

function prepararCategoriasReportes(categorias = [], { agruparChicas = false, umbralPorcentaje = 0 } = {}) {
  const ordenadas = [...categorias].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  if (!agruparChicas || ordenadas.length === 0) return ordenadas;

  const total = ordenadas.reduce((acc, item) => acc + Number(item.total || 0), 0);
  if (total <= 0) return ordenadas;
  if (ordenadas.length > 6) {
    const top = ordenadas.slice(0, 6);
    const resto = ordenadas.slice(6);
    const totalOtros = resto.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const movimientosOtros = resto.reduce((acc, item) => acc + Number(item.cantidad || item.movimientos || item.cantidadMovimientos || item.consumos || 0), 0);
    return [
      ...top,
      { categoria: 'Otros', total: totalOtros, agrupada: true, cantidadCategorias: resto.length, cantidad: movimientosOtros }
    ];
  }

  const categoriasGrandes = [];
  const categoriasChicas = [];

  ordenadas.forEach((item) => {
    const porcentaje = (Number(item.total || 0) / total) * 100;
    if (porcentaje < umbralPorcentaje) {
      categoriasChicas.push(item);
    } else {
      categoriasGrandes.push(item);
    }
  });

  if (categoriasChicas.length < 2) return ordenadas;

  const totalOtros = categoriasChicas.reduce((acc, item) => acc + Number(item.total || 0), 0);
  return [
    ...categoriasGrandes,
    { categoria: 'Otras categorias', total: totalOtros, agrupada: true, cantidadCategorias: categoriasChicas.length }
  ];
}

export default function ReportesPanel({
  reporteActivo,
  onReporteChange,
  ciclo,
  resumenMensual,
  categoriasReportes = [],
  evolucionMensual = [],
  movimientosPorCiclo = [],
  cycleContext = null,
  analysisConfidence = null
}) {
  const cicloInfo = cycleContext || getCycleContext(ciclo);
  const cicloEnCurso = cicloInfo.cicloEnCurso;
  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [mesActivoTendencia, setMesActivoTendencia] = useState(null);
  const [patternPeriodCount, setPatternPeriodCount] = useState(6);
  const [patternCategorySelection, setPatternCategorySelection] = useState([]);
  const [hideInactivePatternCategories, setHideInactivePatternCategories] = useState(false);
  const reporteSeleccionado = REPORTES_BASE.find((item) => item.key === reporteActivo) || REPORTES_BASE[0];
  const patternSeries = buildMovementPatternSeries(movimientosPorCiclo, ciclo);
  const visiblePatternSeries = patternSeries.slice(Math.max(0, patternSeries.length - patternPeriodCount));
  const patternCategoryOptionsAll = Array.from(
    patternSeries.reduce((acc, cycle) => {
      Object.entries(cycle.confirmed).forEach(([category, value]) => {
        acc.set(category, (acc.get(category) || 0) + Number(value || 0));
      });
      Object.entries(cycle.projected || {}).forEach(([category, value]) => {
        acc.set(category, (acc.get(category) || 0) + Number(value || 0));
      });
      return acc;
    }, new Map())
  )
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
  const patternHasActivity = (category) =>
    visiblePatternSeries.some(
      (cycle) => Number(cycle.confirmed[category] || 0) !== 0 || Number(cycle.projected?.[category] || 0) !== 0
    );
  const patternCategoryOptions = hideInactivePatternCategories
    ? patternCategoryOptionsAll.filter(patternHasActivity)
    : patternCategoryOptionsAll;
  const activePatternCategories = patternCategorySelection.filter((category) => patternCategoryOptions.includes(category));
  const selectedPatternCategories = activePatternCategories.length > 0
    ? activePatternCategories.slice(0, 6)
    : patternCategoryOptions.slice(0, Math.min(3, patternCategoryOptions.length));
  const patternValues = visiblePatternSeries.flatMap((cycle) =>
    selectedPatternCategories.flatMap((category) => [
      Number(cycle.confirmed[category] || 0),
      Number(cycle.projected?.[category] || 0)
    ])
  );
  const patternMaxValue = Math.max(...patternValues, 1);
  const patternChart = {
    width: 920,
    height: 270,
    left: 76,
    right: 32,
    top: 28,
    bottom: 44
  };
  const patternInnerWidth = patternChart.width - patternChart.left - patternChart.right;
  const patternInnerHeight = patternChart.height - patternChart.top - patternChart.bottom;
  const getPatternX = (index) => patternChart.left + (index * (patternInnerWidth / Math.max(visiblePatternSeries.length - 1, 1)));
  const getPatternY = (value) => patternChart.top + ((patternMaxValue - Number(value || 0)) / patternMaxValue) * patternInnerHeight;
  const patternStepWidth = patternInnerWidth / Math.max(visiblePatternSeries.length - 1, 1);
  const patternCurrentBandWidth = visiblePatternSeries.length > 1 ? Math.min(patternStepWidth * 0.72, 96) : 110;
  const patternTicks = [1, 0.66, 0.33, 0].map((ratio) => patternMaxValue * ratio);
  const togglePatternCategory = (category) => {
    setPatternCategorySelection((current) => {
      const valid = current.filter((item) => patternCategoryOptions.includes(item));
      if (valid.includes(category)) return valid.length > 1 ? valid.filter((item) => item !== category) : valid;
      return valid.length >= 6 ? valid : [...valid, category];
    });
  };
  const getPatternCategoryColor = (category) =>
    CATEGORY_CURVE_COLORS[Math.max(selectedPatternCategories.indexOf(category), 0) % CATEGORY_CURVE_COLORS.length];
  const currentPatternCycle = visiblePatternSeries.find((item) => item.ciclo === ciclo) || visiblePatternSeries[visiblePatternSeries.length - 1] || null;
  const historicalPatternCycles = visiblePatternSeries.filter((item) => item.ciclo !== currentPatternCycle?.ciclo);
  const getPatternTotal = (cycle, key = 'confirmed') =>
    selectedPatternCategories.reduce((acc, category) => acc + Number(cycle?.[key]?.[category] || 0), 0);
  const patternHistoricalTotals = historicalPatternCycles.map((item) => getPatternTotal(item, 'confirmed'));
  const patternHistoricalAverage = patternHistoricalTotals.length > 0
    ? patternHistoricalTotals.reduce((acc, value) => acc + value, 0) / patternHistoricalTotals.length
    : 0;
  const patternConfirmedCurrent = getPatternTotal(currentPatternCycle, 'confirmed');
  const patternProjectedCurrent = cicloEnCurso ? getPatternTotal(currentPatternCycle, 'projected') : patternConfirmedCurrent;
  const patternComparableCurrent = cicloEnCurso ? patternProjectedCurrent : patternConfirmedCurrent;
  const patternDeviation = patternComparableCurrent - patternHistoricalAverage;
  const patternDeviationPercentage = patternHistoricalAverage > 0 ? (patternDeviation / patternHistoricalAverage) * 100 : null;
  const patternCategoryDeviation = selectedPatternCategories
    .map((category) => {
      const historicalValues = historicalPatternCycles.map((item) => Number(item.confirmed[category] || 0));
      const average = historicalValues.length > 0
        ? historicalValues.reduce((acc, value) => acc + value, 0) / historicalValues.length
        : 0;
      const currentValue = cicloEnCurso
        ? Number(currentPatternCycle?.projected?.[category] || 0)
        : Number(currentPatternCycle?.confirmed?.[category] || 0);
      return { category, deviation: currentValue - average };
    })
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))[0];
  const patternDeviationThreshold = Math.max(patternHistoricalAverage * 0.1, 1);
  const patternDirection = patternHistoricalAverage <= 0 || Math.abs(patternDeviation) <= patternDeviationThreshold
    ? 'dentro'
    : patternDeviation > 0
      ? 'encima'
      : 'debajo';
  const patternIsCombinedSelection = selectedPatternCategories.length > 1;
  const patternSelectedLabel = patternIsCombinedSelection ? 'Las categorias seleccionadas' : selectedPatternCategories[0] || 'La categoria';
  const patternDirectionText = patternIsCombinedSelection
    ? patternDirection === 'encima'
      ? 'vienen por encima'
      : patternDirection === 'debajo'
        ? 'vienen por debajo'
        : 'se mantienen dentro'
    : patternDirection === 'encima'
      ? 'viene por encima'
      : patternDirection === 'debajo'
        ? 'viene por debajo'
        : 'se mantiene dentro';
  const patternMainReading = patternHistoricalAverage <= 0
    ? 'Todavia no hay promedio historico suficiente para comparar estas categorias.'
    : `${patternSelectedLabel} ${patternDirectionText} del patron reciente. ${
        patternCategoryDeviation?.category
          ? `${patternCategoryDeviation.category} explica el mayor desvio.`
          : 'No hay un desvio dominante.'
      }`;
  const patternSummaryCards = [
    { key: 'avg', label: 'Promedio historico seleccionado', value: formatMoney(patternHistoricalAverage), hint: `${historicalPatternCycles.length} periodos base` },
    { key: 'actual', label: 'Confirmado actual', value: formatMoney(patternConfirmedCurrent), hint: currentPatternCycle?.label || '-' },
    { key: 'projected', label: 'Proyectado al cierre', value: formatMoney(patternProjectedCurrent), hint: cicloEnCurso ? 'Incluye pendiente/proyectado' : 'Ciclo cerrado' },
    {
      key: 'deviation',
      label: 'Desvio esperado vs promedio',
      value: formatSignedMoney(patternDeviation),
      hint: patternDeviationPercentage == null ? 'Sin base historica' : formatVariation(patternDeviationPercentage)
    }
  ];
  const categoriasOrdenadas = prepararCategoriasReportes(categoriasReportes, {
    agruparChicas: AGRUPAR_CATEGORIAS_CHICAS,
    umbralPorcentaje: UMBRAL_OTROS_PORCENTAJE
  });
  const comparativaMensual = [
    { key: 'ingresos', label: 'Ingresos confirmados', value: Number(resumenMensual?.ingresosConfirmados || 0), color: 'var(--reportes-trend-income)' },
    { key: 'egresos', label: 'Egresos confirmados', value: Number(resumenMensual?.egresosConfirmados || 0), color: 'var(--reportes-trend-expense)' }
  ];
  const maxComparativa = Math.max(...comparativaMensual.map((item) => item.value), 0);
  const cardsMensual = [
    { key: 'ingresos', label: 'Ingresos confirmados', value: formatMoney(resumenMensual?.ingresosConfirmados) },
    { key: 'egresos', label: 'Egresos confirmados', value: formatMoney(resumenMensual?.egresosConfirmados) },
    {
      key: 'balance-real',
      label: 'Balance real del mes',
      value: formatMoney(resumenMensual?.balanceReal),
      tone: Number(resumenMensual?.balanceReal || 0) >= 0 ? 'positive' : 'negative'
    },
    { key: 'pendiente', label: 'Pendiente de egresos', value: formatMoney(resumenMensual?.pendienteEgresos) },
    {
      key: 'balance-proyectado',
      label: 'Balance proyectado',
      value: formatMoney(resumenMensual?.balanceProyectado),
      tone: Number(resumenMensual?.balanceProyectado || 0) >= 0 ? 'positive' : 'negative'
    }
  ];
  const ratioEgresosIngresos = calculateExpenseIncomeRatio(
    resumenMensual?.egresosConfirmados,
    resumenMensual?.ingresosConfirmados
  );
  const ratioTone =
    ratioEgresosIngresos == null ? 'muted' : ratioEgresosIngresos < 70 ? 'good' : ratioEgresosIngresos <= 90 ? 'warn' : 'alert';
  const totalCategorias = categoriasOrdenadas.reduce((acc, item) => acc + Number(item.total || 0), 0);
  const pieColors = ['#2f6fb3', '#b45f5f', '#a16207', '#2f7d46', '#6b5ca5', '#4c8a86', '#9a6b4f', '#6b7a90'];
  let currentAngle = -Math.PI / 2;
  const pieSegments = categoriasOrdenadas.map((item, index) => {
    const value = Number(item.total || 0);
    const portion = totalCategorias > 0 ? value / totalCategorias : 0;
    const nextAngle = currentAngle + portion * Math.PI * 2;
    const segment = {
      ...item,
      color: pieColors[index % pieColors.length],
      percentage: portion * 100,
      path: describeArc(150, 150, 120, currentAngle, nextAngle)
    };
    currentAngle = nextAngle;
    return segment;
  });
  const chartSeries = [
    { key: 'ingresos', label: 'Ingresos', color: 'var(--reportes-trend-income)' },
    { key: 'egresos', label: 'Egresos', color: 'var(--reportes-trend-expense)' },
    { key: 'balance', label: 'Balance', color: 'var(--reportes-trend-balance)' }
  ];
  const chartWidth = 720;
  const chartHeight = 280;
  const chartPaddingX = 42;
  const chartPaddingTop = 18;
  const chartPaddingBottom = 34;
  const chartValues = evolucionMensual.flatMap((item) => [Number(item.ingresos || 0), Number(item.egresos || 0), Number(item.balance || 0)]);
  const maxChartValue = Math.max(...chartValues, 0);
  const minChartValue = Math.min(...chartValues, 0);
  const chartRange = maxChartValue - minChartValue || 1;
  const chartInnerHeight = chartHeight - chartPaddingTop - chartPaddingBottom;
  const chartStepX =
    evolucionMensual.length > 1 ? (chartWidth - chartPaddingX * 2) / (evolucionMensual.length - 1) : chartWidth / 2;
  const getChartX = (index) => chartPaddingX + chartStepX * index;
  const getChartY = (value) =>
    chartPaddingTop + ((maxChartValue - Number(value || 0)) / chartRange) * chartInnerHeight;
  const baselineY = getChartY(0);
  const gridValues = Array.from({ length: 4 }, (_, index) => maxChartValue - (chartRange / 3) * index);
  const trendLines = chartSeries.map((serie) => ({
    ...serie,
    points: evolucionMensual.map((item, index) => ({
      x: getChartX(index),
      y: getChartY(item[serie.key])
    })),
    path: buildSmoothPath(
      evolucionMensual.map((item, index) => ({
        x: getChartX(index),
        y: getChartY(item[serie.key])
      }))
    ),
    ultimoPunto:
      evolucionMensual.length > 0
        ? {
            x: getChartX(evolucionMensual.length - 1),
            y: getChartY(evolucionMensual[evolucionMensual.length - 1][serie.key]),
            valor: Number(evolucionMensual[evolucionMensual.length - 1][serie.key] || 0)
          }
        : null
  }));
  const tooltipMesActivo =
    mesActivoTendencia != null && evolucionMensual[mesActivoTendencia]
      ? {
          ...evolucionMensual[mesActivoTendencia],
          x: getChartX(mesActivoTendencia),
          ingresosY: getChartY(evolucionMensual[mesActivoTendencia].ingresos),
          egresosY: getChartY(evolucionMensual[mesActivoTendencia].egresos),
          balanceY: getChartY(evolucionMensual[mesActivoTendencia].balance)
        }
      : null;
  const ultimoMesTendencia = evolucionMensual[evolucionMensual.length - 1] || null;
  const mesAnteriorTendencia = evolucionMensual[evolucionMensual.length - 2] || null;
  const variacionesTendencia = ultimoMesTendencia && mesAnteriorTendencia
    ? [
        {
          key: 'ingresos',
          label: 'Ingresos',
          value: calculateVariation(ultimoMesTendencia.ingresos, mesAnteriorTendencia.ingresos)
        },
        {
          key: 'egresos',
          label: 'Egresos',
          value: calculateVariation(ultimoMesTendencia.egresos, mesAnteriorTendencia.egresos)
        },
        {
          key: 'balance',
          label: 'Balance',
          value: calculateVariation(ultimoMesTendencia.balance, mesAnteriorTendencia.balance)
        }
      ]
    : [];
  const insightsTendencia = variacionesTendencia
    .filter((item) => Number.isFinite(item.value) && item.value !== 0)
    .filter((item) => item.key === 'egresos' || item.key === 'ingresos')
    .slice(0, 2)
    .map((item) => {
      const direccion =
        item.key === 'egresos'
          ? item.value > 0
            ? 'subieron'
            : 'bajaron'
          : item.value > 0
            ? 'subieron'
            : 'bajaron';

      if (cicloEnCurso) {
        return `${item.label} confirmados ${formatPartialVariationText(item)} vs el ciclo anterior cerrado.`;
      }

      return `Los ${item.key} ${direccion} ${Math.abs(item.value).toFixed(1)}%`;
    });

  return (
    <section className="panel reportes-panel">
      <div className="panel-header">
        <h2>Reportes</h2>
        <p>Base inicial para centralizar distintos reportes del hogar y navegar entre ellos de forma simple.</p>
      </div>

      <div className="reportes-nav" role="tablist" aria-label="Secciones de reportes">
        {REPORTES_BASE.map((reporte) => (
          <button
            key={reporte.key}
            type="button"
            className={`reportes-nav-item ${reporteSeleccionado.key === reporte.key ? 'active' : ''}`}
            onClick={() => onReporteChange(reporte.key)}
          >
            {reporte.label}
          </button>
        ))}
      </div>

      <div className="reportes-layout">
        <section className="reportes-main">
          <span className="pill muted">Ciclo: {ciclo}</span>
          {cicloEnCurso && <span className="pill muted reportes-cycle-badge">Ciclo abierto: datos parciales</span>}
          {reporteSeleccionado.key === 'tendencias' && analysisConfidence && (
            <span className={`pill muted reportes-cycle-badge analysis-confidence-badge confidence-${analysisConfidence.nivel}`}>
              {analysisConfidence.label}
            </span>
          )}
          <h3>{reporteSeleccionado.title}</h3>
          <p>{reporteSeleccionado.description}</p>

          {reporteSeleccionado.key === 'mensual' ? (
            <>
              <div className="reportes-visuals-stack">
                <div className="reportes-bar-card">
                  <strong>Comparacion visual</strong>
                  <div className="reportes-bar-chart">
                    {comparativaMensual.map((item) => (
                      <div key={item.key} className="reportes-bar-group">
                        <span className="reportes-bar-value">{formatMoney(item.value)}</span>
                        <div className="reportes-bar-track">
                          <div
                            className="reportes-bar-fill"
                            style={{
                              width: `${maxComparativa > 0 ? (item.value / maxComparativa) * 100 : 0}%`,
                              backgroundColor: item.color
                            }}
                          />
                        </div>
                        <small>{item.label}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="reportes-progress-card">
                  <div className="reportes-progress-header">
                    <strong>Cumplimiento del ciclo</strong>
                    <span>{Number(resumenMensual?.porcentajeCumplimiento || 0)}%</span>
                  </div>
                  <div className="reportes-progress-track" aria-label="Porcentaje de egresos pagados del ciclo">
                    <div
                      className="reportes-progress-fill"
                      style={{ width: `${Math.max(0, Math.min(100, Number(resumenMensual?.porcentajeCumplimiento || 0)))}%` }}
                    />
                  </div>
                  <small>Porcentaje de egresos pagados sobre el total de egresos del ciclo.</small>
                </div>
              </div>

              <div className="reportes-summary-grid">
                {cardsMensual.map((card) => (
                  <article key={card.key} className={`reportes-summary-card ${card.tone || ''}`}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </article>
                ))}
              </div>

              <div className={`reportes-ratio-card ${ratioTone}`}>
                <span>Porcentaje egresos / ingresos</span>
                <strong>{ratioEgresosIngresos == null ? 'Sin ingresos confirmados' : `${ratioEgresosIngresos.toFixed(1)}%`}</strong>
                {ratioEgresosIngresos == null && (
                  <small>Sin ingresos confirmados todavia. Esta metrica se calculara cuando haya ingresos registrados.</small>
                )}
              </div>
            </>
          ) : reporteSeleccionado.key === 'categorias' ? (
            pieSegments.length > 0 ? (
              <div className="reportes-category-layout">
                <div className="reportes-pie-card">
                  <>
                    <div className="reportes-pie-wrap">
                      <svg viewBox="0 0 300 300" className="reportes-pie-chart" aria-label="Grafico de gastos por categoria">
                        {pieSegments.map((segment) => (
                          <path
                            key={segment.categoria}
                            d={segment.path}
                            fill={segment.color}
                            stroke="var(--reportes-chart-outline)"
                            strokeWidth={categoriaActiva === segment.categoria ? '4' : '2'}
                            className={`reportes-pie-slice ${categoriaActiva && categoriaActiva !== segment.categoria ? 'is-muted' : ''} ${
                              categoriaActiva === segment.categoria ? 'is-active' : ''
                            }`}
                            onMouseEnter={() => setCategoriaActiva(segment.categoria)}
                            onMouseLeave={() => setCategoriaActiva('')}
                          />
                        ))}
                        <circle cx="150" cy="150" r="58" className="reportes-pie-hole" />
                      </svg>
                    </div>
                    <p className="reportes-pie-total">Total confirmado: {formatMoney(totalCategorias)}</p>
                  </>
                </div>
                <div className="reportes-category-list">
                  <div className="reportes-category-list-head">
                    <span>Categoria</span>
                    <span>Monto</span>
                    <span>%</span>
                    <span>Mov.</span>
                  </div>
                  {pieSegments.map((segment) => {
                    const movimientos = Number(segment.cantidad || segment.movimientos || segment.cantidadMovimientos || segment.consumos || 0);
                    return (
                      <article
                        key={segment.categoria}
                        className={`reportes-category-item ${categoriaActiva === segment.categoria ? 'is-active' : ''} ${
                          categoriaActiva && categoriaActiva !== segment.categoria ? 'is-muted' : ''
                        }`}
                        onMouseEnter={() => setCategoriaActiva(segment.categoria)}
                        onMouseLeave={() => setCategoriaActiva('')}
                      >
                        <div className="reportes-category-main">
                          <span className="reportes-category-dot" style={{ backgroundColor: segment.color }} />
                          <strong>{segment.categoria}</strong>
                        </div>
                        <div className="reportes-category-values">
                          <span>{formatMoney(segment.total)}</span>
                          <small>{segment.percentage.toFixed(1)}%</small>
                          <small>{movimientos > 0 ? movimientos : '-'}</small>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="reportes-empty-state reportes-empty-state-compact">
                <strong>Sin egresos confirmados por categoria</strong>
                <p>No hay datos suficientes para mostrar distribucion. Cuando registres egresos confirmados, este reporte va a mostrar composicion y concentracion.</p>
              </div>
            )
          ) : reporteSeleccionado.key === 'patrones' ? (
            patternCategoryOptions.length > 0 ? (
              <div className="reportes-pattern-layout">
                <div className="reportes-pattern-controls">
                  <label className="reportes-pattern-range">
                    Periodos
                    <input
                      type="range"
                      min="6"
                      max="12"
                      value={patternPeriodCount}
                      onChange={(event) => setPatternPeriodCount(Number(event.target.value))}
                    />
                    <strong>{patternPeriodCount}</strong>
                  </label>
                  <label className="reportes-pattern-toggle">
                    <input
                      type="checkbox"
                      checked={hideInactivePatternCategories}
                      onChange={(event) => setHideInactivePatternCategories(event.target.checked)}
                    />
                    <span>Ocultar categorias sin actividad</span>
                  </label>
                  <small>Linea continua: confirmado. Trazo punteado: proyectado del ciclo abierto.</small>
                </div>
                <div className="reportes-pattern-picker">
                  {patternCategoryOptions.map((category) => {
                    const active = selectedPatternCategories.includes(category);
                    const disabled = !active && selectedPatternCategories.length >= 6;
                    return (
                      <button
                        key={category}
                        type="button"
                        className={active ? 'active' : ''}
                        disabled={disabled}
                        style={{ '--pattern-color': active ? getPatternCategoryColor(category) : 'var(--reportes-label)' }}
                        onClick={() => togglePatternCategory(category)}
                      >
                        <i aria-hidden="true" />
                        {category}
                      </button>
                    );
                  })}
                </div>
                <div className="reportes-pattern-summary-grid">
                  {patternSummaryCards.map((card) => (
                    <article key={card.key} className="reportes-pattern-summary-card">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.hint}</small>
                    </article>
                  ))}
                </div>
                <div className="reportes-pattern-chart-card">
                  <svg viewBox={`0 0 ${patternChart.width} ${patternChart.height}`} className="reportes-pattern-chart" role="img" aria-label="Patron de movimientos por categoria">
                    {patternTicks.map((value, index) => {
                      const y = getPatternY(value);
                      return (
                        <g key={`${value}-${index}`}>
                          <line x1={patternChart.left} x2={patternChart.width - patternChart.right} y1={y} y2={y} className="reportes-trend-grid-line" />
                          <text x={patternChart.left - 10} y={y + 4} textAnchor="end" className="reportes-trend-axis-label">
                            {formatMoney(value)}
                          </text>
                        </g>
                      );
                    })}
                    {visiblePatternSeries.map((cycle, index) => {
                      const x = getPatternX(index);
                      const isCurrentOpenCycle = cicloEnCurso && cycle.ciclo === ciclo;
                      return (
                        <g key={cycle.ciclo} className={isCurrentOpenCycle ? 'reportes-pattern-current-cycle' : ''}>
                          {isCurrentOpenCycle && (
                            <rect
                              x={x - patternCurrentBandWidth / 2}
                              y={patternChart.top - 8}
                              width={patternCurrentBandWidth}
                              height={patternInnerHeight + 16}
                              rx="10"
                              className="reportes-pattern-current-band"
                            />
                          )}
                          <line x1={x} x2={x} y1={patternChart.top} y2={patternChart.height - patternChart.bottom} className="reportes-pattern-period-line" />
                          <text x={x} y={patternChart.height - 20} textAnchor="middle" className="reportes-trend-axis-label">
                            {cycle.label}
                          </text>
                          {isCurrentOpenCycle && (
                            <text x={x} y={patternChart.height - 7} textAnchor="middle" className="reportes-pattern-current-label">
                              Actual
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {selectedPatternCategories.map((category) => {
                      const color = getPatternCategoryColor(category);
                      const points = visiblePatternSeries.map((cycle, index) => ({
                        x: getPatternX(index),
                        y: getPatternY(cycle.confirmed[category] || 0),
                        value: Number(cycle.confirmed[category] || 0),
                        ciclo: cycle.ciclo
                      }));
                      const projectedIndex = visiblePatternSeries.findIndex((cycle) => cycle.ciclo === ciclo && cycle.projected);
                      const projectedValue = projectedIndex >= 0 ? Number(visiblePatternSeries[projectedIndex].projected?.[category] || 0) : 0;
                      const projectedPoints = projectedIndex > 0 && cicloEnCurso
                        ? [
                            points[projectedIndex - 1],
                            { x: getPatternX(projectedIndex), y: getPatternY(projectedValue), value: projectedValue, ciclo }
                          ]
                        : [];
                      return (
                        <g key={category}>
                          <path d={buildSmoothPath(points)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          {projectedPoints.length > 0 && (
                            <path d={buildSmoothPath(projectedPoints)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeDasharray="6 6" opacity="0.9" />
                          )}
                          {points.map((point) => (
                            <circle key={`${category}-${point.ciclo}`} cx={point.x} cy={point.y} r="3.5" fill={color}>
                              <title>{category} - {formatCycleLabel(point.ciclo)} confirmado: {formatMoney(point.value)}</title>
                            </circle>
                          ))}
                          {projectedPoints.length > 0 && (
                            <circle cx={projectedPoints[1].x} cy={projectedPoints[1].y} r="4.5" fill="var(--surface)" stroke={color} strokeWidth="2">
                              <title>{category} - proyectado ciclo en curso: {formatMoney(projectedPoints[1].value)}</title>
                            </circle>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div className="reportes-pattern-legend">
                  {selectedPatternCategories.map((category) => (
                    <span key={category} style={{ '--pattern-color': getPatternCategoryColor(category) }}>
                      {category}
                    </span>
                  ))}
                </div>
                <article className="reportes-pattern-reading-card">
                  <span>Lectura del patron</span>
                  <p>{patternMainReading}</p>
                </article>
              </div>
            ) : (
              <div className="reportes-empty-state">
                <strong>Sin categorias para analizar</strong>
                <p>Cuando haya movimientos confirmados, vas a poder comparar patrones por categoria entre ciclos.</p>
              </div>
            )
          ) : evolucionMensual.length > 0 ? (
            <div className="reportes-trends-layout">
              <div className="reportes-trend-card">
                <div className="reportes-trend-header">
                  <strong>Evolucion mensual</strong>
                  <div className="reportes-trend-legend" aria-label="Referencias del grafico">
                    {chartSeries.map((serie) => (
                      <span key={serie.key} className="reportes-trend-legend-item">
                        <i style={{ backgroundColor: serie.color }} />
                        {serie.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="reportes-trend-chart-wrap">
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="reportes-trend-chart"
                    aria-label="Evolucion mensual de ingresos, egresos y balance"
                    onMouseLeave={() => setMesActivoTendencia(null)}
                  >
                    {gridValues.map((gridValue) => (
                      <line
                        key={gridValue}
                        x1={chartPaddingX}
                        x2={chartWidth - chartPaddingX}
                        y1={getChartY(gridValue)}
                        y2={getChartY(gridValue)}
                        className="reportes-trend-grid-line"
                      />
                    ))}
                    <line
                      x1={chartPaddingX}
                      x2={chartWidth - chartPaddingX}
                      y1={baselineY}
                      y2={baselineY}
                      className="reportes-trend-baseline"
                    />

                    {tooltipMesActivo && (
                      <line
                        x1={tooltipMesActivo.x}
                        x2={tooltipMesActivo.x}
                        y1={chartPaddingTop}
                        y2={chartHeight - chartPaddingBottom}
                        className="reportes-trend-hover-line"
                      />
                    )}

                    {trendLines.map((serie) => (
                      <path
                        key={serie.key}
                        d={serie.path}
                        fill="none"
                        stroke={serie.color}
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="reportes-trend-line"
                      />
                    ))}

                    {chartSeries.map((serie) =>
                      trendLines.find((item) => item.key === serie.key)?.points.map((point, index) => (
                        <circle
                          key={`${serie.key}-${evolucionMensual[index].key}`}
                          cx={point.x}
                          cy={point.y}
                          r={mesActivoTendencia === index ? '5' : '4'}
                          fill={serie.color}
                          stroke="var(--reportes-chart-outline)"
                          strokeWidth="2"
                          className={mesActivoTendencia === index ? 'is-active' : ''}
                        />
                      ))
                    )}

                    {trendLines.map(
                      (serie) =>
                        serie.ultimoPunto && (
                          <g key={`${serie.key}-ultimo`} className="reportes-trend-last-point">
                            <circle
                              cx={serie.ultimoPunto.x}
                              cy={serie.ultimoPunto.y}
                              r="6"
                              fill={serie.color}
                              stroke="var(--reportes-chart-outline)"
                              strokeWidth="2.5"
                            />
                            <text
                              x={Math.max(chartPaddingX + 6, serie.ultimoPunto.x - 10)}
                              y={Math.max(chartPaddingTop + 14, serie.ultimoPunto.y - 12)}
                              textAnchor={serie.ultimoPunto.x > chartWidth - 120 ? 'end' : 'start'}
                              className="reportes-trend-last-label"
                              fill={serie.color}
                              stroke="var(--reportes-chart-outline)"
                              strokeWidth="3"
                              paintOrder="stroke"
                            >
                              {formatMoney(serie.ultimoPunto.valor)}
                            </text>
                          </g>
                        )
                    )}

                    {evolucionMensual.map((item, index) => (
                      <g key={item.key}>
                        <text
                          x={getChartX(index)}
                          y={chartHeight - 8}
                          textAnchor="middle"
                          className="reportes-trend-axis-label"
                        >
                          {item.label}
                        </text>
                        <rect
                          x={getChartX(index) - chartStepX / 2}
                          y={chartPaddingTop}
                          width={chartStepX}
                          height={chartHeight - chartPaddingTop - chartPaddingBottom}
                          fill="transparent"
                          onMouseEnter={() => setMesActivoTendencia(index)}
                        />
                      </g>
                    ))}

                    {tooltipMesActivo && (
                      <g
                        className="reportes-trend-tooltip"
                        transform={`translate(${Math.min(tooltipMesActivo.x + 16, chartWidth - 190)}, ${chartPaddingTop + 8})`}
                      >
                        <rect width="174" height="96" rx="12" className="reportes-trend-tooltip-box" />
                        <text x="14" y="22" className="reportes-trend-tooltip-title">
                          {tooltipMesActivo.label}
                        </text>
                        <text x="14" y="44" className="reportes-trend-tooltip-row ingresos">
                          Ingresos: {formatMoney(tooltipMesActivo.ingresos)}
                        </text>
                        <text x="14" y="63" className="reportes-trend-tooltip-row egresos">
                          Egresos: {formatMoney(tooltipMesActivo.egresos)}
                        </text>
                        <text
                          x="14"
                          y="82"
                          className={`reportes-trend-tooltip-row ${tooltipMesActivo.balance >= 0 ? 'balance-positive' : 'balance-negative'}`}
                        >
                          Balance: {formatMoney(tooltipMesActivo.balance)}
                        </text>
                      </g>
                    )}
                  </svg>
                </div>
              </div>

              {variacionesTendencia.length > 0 && (
                <div className="reportes-trend-variation-card">
                  <strong>Variacion vs mes anterior</strong>
                  {analysisConfidence?.isLow && <small>Comparacion orientativa. {analysisConfidence.note}</small>}
                  <div className="reportes-trend-variation-grid">
                    {variacionesTendencia.map((item) => (
                      <article key={item.key} className="reportes-trend-variation-item">
                        <span>{cicloEnCurso ? `${item.label} confirmados` : item.label}</span>
                        <strong
                          className={
                            cicloEnCurso
                              ? ''
                              : Number.isFinite(item.value)
                              ? item.value >= 0
                                ? 'positive-text'
                                : 'negative-text'
                              : ''
                          }
                        >
                          {cicloEnCurso
                            ? formatPartialVariationText(item)
                            : formatVariation(item.value)}
                        </strong>
                        {cicloEnCurso && <small>vs el ciclo anterior cerrado. Datos confirmados/parciales.</small>}
                      </article>
                    ))}
                  </div>
                  {insightsTendencia.length > 0 && (
                    <div className="reportes-trend-insights">
                      {insightsTendencia.map((insight) => (
                        <p key={insight} className="reportes-trend-insight">
                          {insight}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="reportes-trend-table">
                {evolucionMensual.map((item) => (
                  <article key={item.key} className="reportes-trend-row">
                    <strong>{item.label}</strong>
                    <div className="reportes-trend-values">
                      <span>Ingresos: {formatMoney(item.ingresos)}</span>
                      <span>Egresos: {formatMoney(item.egresos)}</span>
                      <span className={Number(item.balance || 0) >= 0 ? 'positive-text' : 'negative-text'}>
                        Balance: {formatMoney(item.balance)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="reportes-empty-state">
              <strong>Sin datos para evolucion</strong>
              <p>No hay movimientos suficientes en los ultimos 6 meses para mostrar la comparativa mensual.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
