import { useState } from 'react';

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
  }
];

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function prepararCategoriasReportes(categorias = [], { agruparChicas = false, umbralPorcentaje = 0 } = {}) {
  const ordenadas = [...categorias].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  if (!agruparChicas || ordenadas.length === 0) return ordenadas;

  const total = ordenadas.reduce((acc, item) => acc + Number(item.total || 0), 0);
  if (total <= 0) return ordenadas;

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
  evolucionMensual = []
}) {
  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [mesActivoTendencia, setMesActivoTendencia] = useState(null);
  const reporteSeleccionado = REPORTES_BASE.find((item) => item.key === reporteActivo) || REPORTES_BASE[0];
  const categoriasOrdenadas = prepararCategoriasReportes(categoriasReportes, {
    agruparChicas: AGRUPAR_CATEGORIAS_CHICAS,
    umbralPorcentaje: UMBRAL_OTROS_PORCENTAJE
  });
  const comparativaMensual = [
    { key: 'ingresos', label: 'Ingresos confirmados', value: Number(resumenMensual?.ingresosConfirmados || 0), color: '#16a34a' },
    { key: 'egresos', label: 'Egresos confirmados', value: Number(resumenMensual?.egresosConfirmados || 0), color: '#ef4444' }
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
  const pieColors = ['#2563eb', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];
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
                <strong>{ratioEgresosIngresos == null ? 'N/A' : `${ratioEgresosIngresos.toFixed(1)}%`}</strong>
              </div>
            </>
          ) : reporteSeleccionado.key === 'categorias' ? (
            <div className="reportes-category-layout">
              <div className="reportes-pie-card">
                {pieSegments.length > 0 ? (
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
                ) : (
                  <div className="reportes-empty-state">
                    <strong>Sin egresos confirmados</strong>
                    <p>No hay datos confirmados de egresos en este ciclo para graficar por categoria.</p>
                  </div>
                )}
              </div>

              {pieSegments.length > 0 && (
                <div className="reportes-category-list">
                  {pieSegments.map((segment) => (
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
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
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
                  <div className="reportes-trend-variation-grid">
                    {variacionesTendencia.map((item) => (
                      <article key={item.key} className="reportes-trend-variation-item">
                        <span>{item.label}</span>
                        <strong
                          className={
                            Number.isFinite(item.value)
                              ? item.value >= 0
                                ? 'positive-text'
                                : 'negative-text'
                              : ''
                          }
                        >
                          {formatVariation(item.value)}
                        </strong>
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
