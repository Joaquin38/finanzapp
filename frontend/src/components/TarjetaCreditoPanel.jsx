import { useEffect, useMemo, useRef, useState } from 'react';
import { getAnalysisConfidence } from '../utils/analysisConfidence.js';
import { createConsumoTarjeta, deleteConsumoTarjeta, generarMovimientoResumenTarjeta, getTarjetasCredito, importConsumosTarjeta, updateCierreTarjeta, updateConsumoTarjeta } from '../services/api.js';
import { formatDecimalInput, parseDecimalInput, sanitizeDecimalInput } from '../utils/numberFormat.js';

const moneyFormat = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const csvExpectedHeaders = [
  'fecha_compra',
  'descripcion',
  'categoria',
  'moneda',
  'cuota_actual',
  'cantidad_cuotas',
  'modo_carga',
  'monto_total',
  'monto_cuota',
  'titular',
  'observaciones'
];
const csvTemplateFileName = 'plantilla_consumos_tarjeta_finanzapp.csv';
const csvTemplateRows = [
  csvExpectedHeaders.join(','),
  '2026-05-01,Supermercado,Supermercado,ARS,,1,total,25000,25000,Titular,Compra ejemplo',
  '2026-05-02,Electrodomestico,Hogar,ARS,2,6,cuota,120000,20000,Titular,Compra en cuotas'
];

const initialForm = {
  fecha_compra: new Date().toISOString().slice(0, 10),
  descripcion: '',
  categoria: '',
  moneda: 'ARS',
  monto_total: '',
  cantidad_cuotas: '1',
  monto_cuota: '',
  tarjeta_id: '',
  titular: '',
  observaciones: ''
};

function formatCycleLabel(ciclo) {
  if (!ciclo) return 'Ciclo actual';
  const label = new Date(`${ciclo}-01T00:00:00`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getClosingDate(ciclo) {
  if (!ciclo) return 'Sin cierre definido';
  const [yearText, monthText] = String(ciclo).split('-');
  const date = new Date(Number(yearText), Number(monthText), 0);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function getClosingDateIso(ciclo) {
  if (!ciclo) return '';
  const [yearText, monthText] = String(ciclo).split('-');
  const date = new Date(Number(yearText), Number(monthText), 0);
  return `${ciclo}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : '-';
}

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return 'Sin referencia';
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}%`;
}

function formatUsd(value) {
  return `USD ${Number(value || 0).toLocaleString('es-AR', moneyFormat)}`;
}

function formatSignedMoney(value, formatMoney) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : '-'}${formatMoney(Math.abs(numeric))}`;
}

function formatSignedUsd(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : '-'}${formatUsd(Math.abs(numeric))}`;
}

function getCategoryColorSeed(category) {
  const hash = String(category || '').split('').reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % 9973, 0);
  return hash;
}

function buildCategoryColorMap(categories = []) {
  const used = new Set();
  return categories
    .slice()
    .sort((a, b) => String(a).localeCompare(String(b)))
    .reduce((acc, category, index) => {
      let hue = (getCategoryColorSeed(category) + index * 37) % 360;
      let color = `hsl(${hue} 72% 44%)`;
      while (used.has(color)) {
        hue = (hue + 29) % 360;
        color = `hsl(${hue} 72% 44%)`;
      }
      used.add(color);
      acc[category] = color;
      return acc;
    }, {});
}

function formatAxisMoney(value, currency) {
  const numeric = Number(value || 0);
  const abs = Math.abs(numeric);
  const suffix = abs >= 1000000 ? ' M' : abs >= 1000 ? ' k' : '';
  const divider = abs >= 1000000 ? 1000000 : abs >= 1000 ? 1000 : 1;
  const amount = (numeric / divider).toLocaleString('es-AR', { maximumFractionDigits: abs >= 1000 ? 1 : 0 });
  return currency === 'USD' ? `USD ${amount}${suffix}` : `$${amount}${suffix}`;
}

function buildSmoothPath(points = []) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(0, -1).reduce((path, point, index) => {
    const next = points[index + 1];
    const controlX = point.x + (next.x - point.x) / 2;
    return `${path} C ${controlX} ${point.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function getImpactTone(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? 'warning' : numeric < 0 ? 'positive' : 'muted';
}

function describeCurrencyImpact(item, key, formatter) {
  const actual = Number(item[`actual_${key}`] || 0);
  const promedio = Number(item[`promedio_${key}`] || 0);
  const diferencia = Number(item[`diferencia_${key}`] || 0);
  if (actual === 0 && promedio > 0) return `Sin consumo este resumen. Promedio anterior: ${formatter(promedio)}`;
  if (diferencia > 0) return `Subio ${formatter(diferencia)} respecto al promedio`;
  if (diferencia < 0) return `Bajo ${formatter(Math.abs(diferencia))} respecto al promedio`;
  if (actual > 0 && promedio === 0) return `Nuevo consumo este resumen: ${formatter(actual)}`;
  return 'Sin cambio relevante';
}

function describeCategoryChange(item, formatMoney) {
  const actual = Number(item.actual_ars || 0);
  const promedio = Number(item.promedio_ars || 0);
  const diferencia = Number(item.diferencia_ars || 0);
  if (actual === 0 && promedio > 0) return `${item.categoria} no tuvo consumo este resumen`;
  if (diferencia > 0) return `${item.categoria} subio ${formatMoney(diferencia)}`;
  if (diferencia < 0) return `${item.categoria} bajo ${formatMoney(Math.abs(diferencia))}`;
  return `${item.categoria} se mantuvo estable`;
}

function buildCycleEvolutionRows(serie = []) {
  return serie.map((item, index) => {
    const previous = index > 0 ? serie[index - 1] : null;
    return {
      ...item,
      deltaArs: previous ? Number(item.total_ars || 0) - Number(previous.total_ars || 0) : null,
      deltaUsd: previous ? Number(item.total_usd || 0) - Number(previous.total_usd || 0) : null
    };
  });
}

function buildMainReading(analisisTarjeta, actual, categoriaPrincipal, topChanges, formatMoney) {
  const total = Number(actual.total_ars || 0);
  const promedio = Number(analisisTarjeta?.promedio_ars || 0);
  const diferencia = total - promedio;
  const missing = (topChanges || []).filter((item) => Number(item.actual_ars || 0) === 0 && Number(item.promedio_ars || 0) > 0);
  const rising = (topChanges || []).find((item) => Number(item.diferencia_ars || 0) > 0);
  const comportamiento = promedio > 0
    ? diferencia < 0
      ? `El resumen esta por debajo del promedio reciente por ${formatMoney(Math.abs(diferencia))}.`
      : diferencia > 0
        ? `El resumen supera el promedio reciente por ${formatMoney(diferencia)}.`
        : 'El resumen esta en linea con el promedio reciente.'
    : 'Aun no hay historial suficiente para comparar este resumen.';
  const factor = missing.length >= 2
    ? `La baja se explica principalmente por ausencia de ${missing.slice(0, 2).map((item) => item.categoria).join(' y ')}.`
    : rising
      ? `${rising.categoria} es el factor que mas empuja el resultado.`
      : missing.length === 1
        ? `${missing[0].categoria} no aparece este resumen y explica parte de la diferencia.`
        : topChanges?.[0]
          ? `${describeCategoryChange(topChanges[0], formatMoney)} es el factor mas relevante.`
    : categoriaPrincipal?.categoria
      ? `${categoriaPrincipal.categoria} concentra el mayor impacto del resumen.`
      : 'Sin una categoria dominante para explicar el resultado.';
  return [comportamiento, factor];
}

function getAnalysisStatus(analisisTarjeta, isClosed) {
  if (!isClosed) return { label: 'Resumen parcial', tone: 'muted' };
  const promedio = Number(analisisTarjeta?.promedio_ars || analisisTarjeta?.promedio_usd || 0);
  const actual = Number(analisisTarjeta?.promedio_ars || 0) > 0
    ? Number(analisisTarjeta?.actual?.total_ars || 0)
    : Number(analisisTarjeta?.actual?.total_usd || 0);
  if (promedio <= 0) return { label: 'Resumen dentro del patron', tone: 'muted' };
  if (actual > promedio * 1.2) return { label: 'Resumen sobre el promedio', tone: 'warning' };
  if (actual < promedio * 0.85) return { label: 'Resumen por debajo del promedio', tone: 'positive' };
  return { label: 'Resumen dentro del patron', tone: 'muted' };
}

function buildCategoryAnalysis(analisisTarjeta = {}) {
  const serie = [...(analisisTarjeta.serie || [])].reverse();
  const serieExtendida = [...(analisisTarjeta.serie_extendida || analisisTarjeta.serie || [])].reverse();
  const actual = analisisTarjeta.actual || {};
  const actualCategorias = actual.categorias || [];
  const totalArs = Number(actual.total_ars || 0);
  const totalUsd = Number(actual.total_usd || 0);
  const distribucion = actualCategorias
    .map((item) => ({
      categoria: item.categoria,
      ars: Number(item.total_ars || 0),
      usd: Number(item.total_usd || 0),
      arsPct: totalArs > 0 ? (Number(item.total_ars || 0) / totalArs) * 100 : 0,
      usdPct: totalUsd > 0 ? (Number(item.total_usd || 0) / totalUsd) * 100 : 0,
      consumos: Number(item.consumos || 0)
    }))
    .sort((a, b) => (b.ars - a.ars) || (b.usd - a.usd));
  const topCategorias = distribucion.slice(0, 5);
  const maxArs = Math.max(...serie.map((item) => Number(item.total_ars || 0)), 1);
  const maxUsd = Math.max(...serie.map((item) => Number(item.total_usd || 0)), 1);
  const maxCategoriaArs = Math.max(...topCategorias.flatMap((cat) => serie.map((item) => {
    const found = (item.categorias || []).find((entry) => entry.categoria === cat.categoria) || {};
    return Number(found.total_ars || 0);
  })), 1);
  const concentracionTop3Ars = totalArs > 0
    ? distribucion.slice(0, 3).reduce((acc, item) => acc + item.ars, 0) / totalArs * 100
    : 0;
  const concentracionTop3Usd = totalUsd > 0
    ? distribucion.slice(0, 3).reduce((acc, item) => acc + item.usd, 0) / totalUsd * 100
    : 0;
  return { serie, serieExtendida, distribucion, topCategorias, maxArs, maxUsd, maxCategoriaArs, concentracionTop3Ars, concentracionTop3Usd };
}

function buildCategoryCurveData(serie = [], selectedCategories = [], periodCount = 6) {
  const visibleSerie = serie.slice(Math.max(0, serie.length - periodCount));
  const maxArs = Math.max(...visibleSerie.flatMap((cycle) => selectedCategories.map((category) => {
    const found = (cycle.categorias || []).find((entry) => entry.categoria === category) || {};
    return Number(found.total_ars || 0);
  })), 1);
  const maxUsd = Math.max(...visibleSerie.flatMap((cycle) => selectedCategories.map((category) => {
    const found = (cycle.categorias || []).find((entry) => entry.categoria === category) || {};
    return Number(found.total_usd || 0);
  })), 1);
  const yTicksArs = [1, 0.5, 0].map((ratio) => maxArs * ratio);
  const yTicksUsd = [1, 0.5, 0].map((ratio) => maxUsd * ratio);
  return { visibleSerie, maxArs, maxUsd, yTicksArs, yTicksUsd };
}

function parseAmount(value) {
  return parseDecimalInput(value);
}

function calcularMontosPorModo(form, source) {
  const next = { ...form };
  const cuotas = Math.max(Number(next.cantidad_cuotas || 1), 1);
  const total = parseAmount(next.monto_total);
  const cuota = parseAmount(next.monto_cuota);

  if (cuotas === 1) {
    if (source === 'cuota' && cuota > 0) next.monto_total = formatDecimalInput(cuota);
    else if (total > 0) next.monto_cuota = formatDecimalInput(total);
    else if (cuota > 0) next.monto_total = formatDecimalInput(cuota);
    return next;
  }

  if (source === 'total' && total > 0) next.monto_cuota = formatDecimalInput(total / cuotas);
  if (source === 'cuota' && cuota > 0) next.monto_total = formatDecimalInput(cuota * cuotas);

  return next;
}

function addMonthsToCycle(ciclo, offset) {
  if (!ciclo) return '';
  const [yearText, monthText] = String(ciclo).split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDateForCycleDay(ciclo, day) {
  if (!ciclo || !day) return '';
  const [yearText, monthText] = String(ciclo).split('-');
  const lastDay = new Date(Number(yearText), Number(monthText), 0).getDate();
  const safeDay = Math.min(Math.max(Number(day), 1), lastDay);
  return `${ciclo}-${String(safeDay).padStart(2, '0')}`;
}

function resolvePreviewCycle(fechaCompra, fechaCierreReferencia) {
  if (!fechaCompra) return '';
  const cicloCompra = String(fechaCompra).slice(0, 7);
  const diaCierre = Number(String(fechaCierreReferencia || '').slice(8, 10) || 31);
  const diaCompra = Number(String(fechaCompra).slice(8, 10) || 1);
  return diaCompra > diaCierre ? addMonthsToCycle(cicloCompra, 1) : cicloCompra;
}

function getCsvClosureDate(ciclo, selectedCiclo, fechaCierreSeleccionada, tarjeta, cierresExistentes) {
  const cierreExistente = cierresExistentes.find((item) => item.ciclo === ciclo);
  if (cierreExistente?.fecha_cierre) return String(cierreExistente.fecha_cierre).slice(0, 10);
  if (ciclo === selectedCiclo && fechaCierreSeleccionada) return String(fechaCierreSeleccionada).slice(0, 10);
  return getDateForCycleDay(ciclo, tarjeta?.dia_cierre_default || 31);
}

function resolveCsvAssignedCycle(fechaCompra, selectedCiclo, fechaCierreSeleccionada, tarjeta, cierresExistentes = []) {
  if (!fechaCompra) return '';
  const cicloCompra = String(fechaCompra).slice(0, 7);
  const fechaCierreCompra = getCsvClosureDate(cicloCompra, selectedCiclo, fechaCierreSeleccionada, tarjeta, cierresExistentes);
  if (!fechaCierreCompra) return '';
  return String(fechaCompra).slice(0, 10) <= fechaCierreCompra ? cicloCompra : addMonthsToCycle(cicloCompra, 1);
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsvText(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length <= 1) throw new Error('El archivo esta vacio o no tiene filas.');
  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, '').trim());
  const requiredHeaders = csvExpectedHeaders.filter((header) => header !== 'cuota_actual');
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Faltan headers: ${missing.join(', ')}`);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    if (!Object.prototype.hasOwnProperty.call(row, 'cuota_actual')) row.cuota_actual = '';
    return row;
  });
  if (!rows.length) throw new Error('El archivo no tiene consumos.');
  return rows;
}

function downloadCsvTemplate() {
  const blob = new Blob([`${csvTemplateRows.join('\n')}\n`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = csvTemplateFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resolveCsvCuotaInicial(row) {
  const value = Number(row.cuota_actual || 0);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function amountsAreClose(a, b, moneda) {
  const left = Number(a || 0);
  const right = Number(b || 0);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) return false;
  const tolerance = String(moneda || '').toUpperCase() === 'USD' ? 1 : 10;
  return Math.abs(left - right) <= tolerance;
}

function hasSimilarConsumo(row, consumosExistentes, tarjetaId) {
  const moneda = String(row.moneda || '').toUpperCase();
  const montoTotal = parseAmount(row.monto_total);
  const montoCuota = parseAmount(row.monto_cuota);
  return consumosExistentes.find((item) => (
    Number(item.tarjeta_id) === Number(tarjetaId) &&
    String(item.fecha_compra || '').slice(0, 10) === String(row.fecha_compra || '').slice(0, 10) &&
    String(item.moneda || '').toUpperCase() === moneda &&
    Number(item.cantidad_cuotas || 1) === Number(row.cantidad_cuotas || 1) &&
    (
      amountsAreClose(item.monto_cuota, montoCuota, moneda) ||
      amountsAreClose(item.monto_total, montoTotal, moneda)
    )
  ));
}

function validateCsvImportRow(row, fechaCierre, selectedCiclo, tarjeta, ciclosExistentes, consumosExistentes, cierresExistentes) {
  if (row._ignored) return { estado: 'ignorada', motivo: 'Fila ignorada', assignedCycle: '' };
  const fecha = String(row.fecha_compra || '').slice(0, 10);
  const descripcion = String(row.descripcion || '').trim();
  const moneda = String(row.moneda || '').trim().toUpperCase();
  const cuotaActual = String(row.cuota_actual || '').trim() ? Number(row.cuota_actual) : null;
  const cuotas = Number(row.cantidad_cuotas || 0);
  const modo = String(row.modo_carga || '').trim().toLowerCase();
  const montoTotal = parseAmount(row.monto_total);
  const montoCuota = parseAmount(row.monto_cuota);
  const assignedCycle = resolveCsvAssignedCycle(fecha, selectedCiclo, fechaCierre, tarjeta, cierresExistentes);
  const cicloCompra = String(fecha || '').slice(0, 7);
  const pasaAlProximo = assignedCycle && assignedCycle !== cicloCompra;
  const willCreateSummary = assignedCycle && !ciclosExistentes.has(assignedCycle);
  const nextSummaryDefaults = willCreateSummary ? {
    fecha_cierre: getDateForCycleDay(assignedCycle, tarjeta?.dia_cierre_default || 31),
    fecha_vencimiento: getDateForCycleDay(assignedCycle, tarjeta?.dia_vencimiento_default)
  } : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(new Date(`${fecha}T00:00:00`).getTime())) return { estado: 'invalida', motivo: 'Fecha invalida', assignedCycle };
  if (!descripcion) return { estado: 'invalida', motivo: 'Descripcion vacia', assignedCycle };
  if (!['ARS', 'USD'].includes(moneda)) return { estado: 'invalida', motivo: 'Moneda invalida', assignedCycle };
  if (!Number.isFinite(cuotas) || cuotas < 1) return { estado: 'invalida', motivo: 'Cuotas invalidas', assignedCycle };
  if (cuotaActual != null && (!Number.isInteger(cuotaActual) || cuotaActual < 1 || cuotaActual > cuotas)) return { estado: 'invalida', motivo: 'Cuota actual invalida', assignedCycle };
  if (!['total', 'cuota'].includes(modo)) return { estado: 'invalida', motivo: 'Modo invalido', assignedCycle };
  if (modo === 'total' && (!Number.isFinite(montoTotal) || montoTotal <= 0)) return { estado: 'invalida', motivo: 'Falta monto total', assignedCycle };
  if (modo === 'cuota' && (!Number.isFinite(montoCuota) || montoCuota <= 0)) return { estado: 'invalida', motivo: 'Falta monto cuota', assignedCycle };
  if (!assignedCycle) return { estado: 'invalida', motivo: 'Sin resumen asignado', assignedCycle, pasaAlProximo, willCreateSummary, nextSummaryDefaults };

  const categoria = String(row.categoria || '').trim().toLowerCase();
  const montoCalculado = modo === 'total' ? montoTotal : montoCuota * cuotas;
  const posibleDuplicado = hasSimilarConsumo(row, consumosExistentes, tarjeta?.id);
  if (posibleDuplicado) {
    const mismoResumen = String(posibleDuplicado.ciclo_asignado || '') === String(assignedCycle || '');
    return { estado: 'revisar', motivo: mismoResumen ? 'Ya cargado en este resumen' : 'Ya cargado en otro resumen', assignedCycle, pasaAlProximo, willCreateSummary, nextSummaryDefaults, posibleDuplicado };
  }
  if (!categoria || categoria === 'sin categoria' || categoria === 'sin categoría') return { estado: 'revisar', motivo: 'Sin categoria', assignedCycle, pasaAlProximo, willCreateSummary, nextSummaryDefaults };
  if (!Number.isFinite(montoCalculado) || montoCalculado <= 0) return { estado: 'revisar', motivo: 'Monto calculado 0', assignedCycle, pasaAlProximo, willCreateSummary, nextSummaryDefaults };
  return { estado: 'valida', motivo: 'Lista para importar', assignedCycle, pasaAlProximo, willCreateSummary, nextSummaryDefaults, posibleDuplicado };
}

function getCsvResumenImpact(row) {
  const cuotas = Math.max(Number(row.cantidad_cuotas || 1), 1);
  const montoCuota = parseAmount(row.monto_cuota);
  const montoTotal = parseAmount(row.monto_total);
  if (cuotas > 1) return Number(montoCuota || 0);
  return Number(montoTotal || montoCuota || 0);
}

export default function TarjetaCreditoPanel({ hogarId, ciclo = '', categorias = [], formatMoney, onToast, onMovimientosChange, onVerMovimientoGenerado }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [cierre, setCierre] = useState(null);
  const [selectedCiclo, setSelectedCiclo] = useState(ciclo);
  const [cierreForm, setCierreForm] = useState({ fecha_cierre: '', fecha_vencimiento: '' });
  const [savedCierreForm, setSavedCierreForm] = useState({ fecha_cierre: '', fecha_vencimiento: '' });
  const [resumen, setResumen] = useState({ total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 });
  const [historialResumenes, setHistorialResumenes] = useState([]);
  const [consumosRegistrados, setConsumosRegistrados] = useState([]);
  const [analisisTarjeta, setAnalisisTarjeta] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [editingCicloBase, setEditingCicloBase] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [filters, setFilters] = useState({ ciclo: '', categoria: '', moneda: '', cuotas: '', texto: '' });
  const [calcSource, setCalcSource] = useState('total');
  const [vistaTarjeta, setVistaTarjeta] = useState('principal');
  const [analysisCategorySelection, setAnalysisCategorySelection] = useState([]);
  const [analysisPeriodCount, setAnalysisPeriodCount] = useState(6);
  const [analysisCurveCurrency, setAnalysisCurveCurrency] = useState('ARS');
  const [showAllCategoryImpacts, setShowAllCategoryImpacts] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportStep, setCsvImportStep] = useState(1);
  const [csvImportRows, setCsvImportRows] = useState([]);
  const [csvImportError, setCsvImportError] = useState('');
  const [csvImportFileName, setCsvImportFileName] = useState('');
  const [csvImportProgress, setCsvImportProgress] = useState({ processed: 0, total: 0 });
  const [movimientoResumenAviso, setMovimientoResumenAviso] = useState(null);
  const [movimientoResumenGenerado, setMovimientoResumenGenerado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');
  const actionLockRef = useRef(false);
  const cycleLoadRef = useRef(0);
  const consumoFormPanelRef = useRef(null);
  const consumoDescripcionRef = useRef(null);

  const tarjetaActual = tarjetas.find((tarjeta) => Number(tarjeta.id) === Number(form.tarjeta_id)) || tarjetas[0];
  const resumenSeleccionadoCerrado = cierre?.estado === 'cerrado';
  const cierreTieneCambios = cierreForm.fecha_cierre !== savedCierreForm.fecha_cierre
    || cierreForm.fecha_vencimiento !== savedCierreForm.fecha_vencimiento;
  const categoriasEgreso = useMemo(
    () => categorias.filter((categoria) => categoria.tipo_movimiento === 'egreso' || Number(categoria.tipo_movimiento_id) === 2),
    [categorias]
  );
  const ciclosDisponibles = useMemo(
    () => Array.from(new Set([selectedCiclo, ...consumos.map((item) => item.ciclo_asignado)].filter(Boolean))).sort().reverse(),
    [consumos, selectedCiclo]
  );
  const ciclosNavegacionResumen = useMemo(() => {
    const base = [
      addMonthsToCycle(selectedCiclo, -2),
      addMonthsToCycle(selectedCiclo, -1),
      selectedCiclo,
      addMonthsToCycle(selectedCiclo, 1),
      addMonthsToCycle(selectedCiclo, 2),
      ...historialResumenes.map((item) => item.ciclo),
      ...consumos.map((item) => item.ciclo_asignado)
    ];
    return Array.from(new Set(base.filter(Boolean))).sort().reverse();
  }, [consumos, historialResumenes, selectedCiclo]);
  const consumosFiltrados = useMemo(
    () => consumos.filter((item) => {
      const texto = filters.texto.trim().toLowerCase();
      if (filters.ciclo && item.ciclo_asignado !== filters.ciclo) return false;
      if (filters.categoria && (item.categoria || '') !== filters.categoria) return false;
      if (filters.moneda && item.moneda !== filters.moneda) return false;
      if (filters.cuotas === 'si' && Number(item.cantidad_cuotas || 1) <= 1) return false;
      if (filters.cuotas === 'no' && Number(item.cantidad_cuotas || 1) > 1) return false;
      if (texto && !String(item.descripcion || '').toLowerCase().includes(texto)) return false;
      return true;
    }),
    [consumos, filters]
  );
  const cuotasFuturas = useMemo(() => {
    const byCycle = new Map();

    consumos.forEach((item) => {
      if (String(item.ciclo_asignado).localeCompare(String(selectedCiclo)) <= 0) return;
      if (Number(item.cantidad_cuotas || 1) <= 1) return;
      if (Number(item.cuota_numero || item.cuota_inicial || 1) > Number(item.cantidad_cuotas || 1)) return;
      if (!byCycle.has(item.ciclo_asignado)) {
        byCycle.set(item.ciclo_asignado, { ciclo: item.ciclo_asignado, totalArs: 0, totalUsd: 0, consumos: new Set() });
      }
      const bucket = byCycle.get(item.ciclo_asignado);
      if (item.moneda === 'USD') bucket.totalUsd += Number(item.monto_resumen || item.monto_cuota || 0);
      else bucket.totalArs += Number(item.monto_resumen || item.monto_cuota || 0);
      bucket.consumos.add(item.compra_id || item.id);
    });

    return Array.from(byCycle.values())
      .map((item) => ({ ...item, cantidadConsumos: item.consumos.size }))
      .sort((a, b) => String(a.ciclo).localeCompare(String(b.ciclo)));
  }, [consumos, selectedCiclo]);
  const cuotasFuturasResumen = useMemo(() => {
    const totalArs = cuotasFuturas.reduce((sum, item) => sum + Number(item.totalArs || 0), 0);
    const totalUsd = cuotasFuturas.reduce((sum, item) => sum + Number(item.totalUsd || 0), 0);
    const consumosPendientes = new Set();
    consumos.forEach((item) => {
      if (String(item.ciclo_asignado).localeCompare(String(selectedCiclo)) <= 0) return;
      if (Number(item.cantidad_cuotas || 1) <= 1) return;
      consumosPendientes.add(item.compra_id || item.id);
    });
    const mesMasPesado = cuotasFuturas.reduce((best, item) => {
      if (!best) return item;
      const itemPeso = Number(item.totalArs || 0) || Number(item.totalUsd || 0);
      const bestPeso = Number(best.totalArs || 0) || Number(best.totalUsd || 0);
      return itemPeso > bestPeso ? item : best;
    }, null);
    const hastaCiclo = cuotasFuturas.length > 0 ? cuotasFuturas[cuotasFuturas.length - 1].ciclo : '';
    return { totalArs, totalUsd, mesMasPesado, hastaCiclo, consumosPendientes: consumosPendientes.size };
  }, [consumos, cuotasFuturas, selectedCiclo]);
  const previewCicloAsignado = useMemo(() => {
    return resolvePreviewCycle(form.fecha_compra, savedCierreForm.fecha_cierre) || selectedCiclo;
  }, [form.fecha_compra, savedCierreForm.fecha_cierre, selectedCiclo]);
  const previewPasaAlSiguiente = String(previewCicloAsignado).localeCompare(String(selectedCiclo)) > 0;
  const consumoAsignadoAResumenCerrado = resumenSeleccionadoCerrado && previewCicloAsignado === selectedCiclo;
  const analisisActual = analisisTarjeta?.actual || {};
  const categoriaPrincipalAnalisis = analisisActual.categorias?.[0] || null;
  const analisisCategorias = useMemo(() => buildCategoryAnalysis(analisisTarjeta || {}), [analisisTarjeta]);
  const analysisCategoryOptions = useMemo(() => {
    const totals = new Map();
    analisisCategorias.serieExtendida.forEach((cycle) => {
      (cycle.categorias || []).forEach((item) => {
        const key = item.categoria || 'Sin categoria';
        const current = totals.get(key) || 0;
        totals.set(key, current + Number(item.total_ars || 0) + Number(item.total_usd || 0));
      });
    });
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([categoria]) => categoria);
  }, [analisisCategorias.serieExtendida]);
  const selectedAnalysisCategories = analysisCategorySelection.filter((category) => analysisCategoryOptions.includes(category));
  const analysisCategoryColorMap = useMemo(() => buildCategoryColorMap(analysisCategoryOptions), [analysisCategoryOptions]);
  const categoriasComparadasAnalisis = analisisTarjeta?.categorias_comparadas || [];
  const topCategoryChanges = useMemo(
    () => [...categoriasComparadasAnalisis]
      .sort((a, b) => Math.abs(Number(b.diferencia_ars || 0)) - Math.abs(Number(a.diferencia_ars || 0)))
      .slice(0, 3),
    [categoriasComparadasAnalisis]
  );
  const lecturaPrincipal = useMemo(
    () => buildMainReading(analisisTarjeta, analisisActual, categoriaPrincipalAnalisis, topCategoryChanges, formatMoney),
    [analisisTarjeta, analisisActual, categoriaPrincipalAnalisis, topCategoryChanges, formatMoney]
  );
  const analysisStatus = useMemo(
    () => getAnalysisStatus(analisisTarjeta, resumenSeleccionadoCerrado),
    [analisisTarjeta, resumenSeleccionadoCerrado]
  );
  const categoriasImpactoVisibles = showAllCategoryImpacts ? categoriasComparadasAnalisis : categoriasComparadasAnalisis.slice(0, 3);
  const cycleEvolutionRows = useMemo(() => buildCycleEvolutionRows(analisisCategorias.serie), [analisisCategorias.serie]);
  const tarjetaAnalysisConfidence = useMemo(
    () =>
      getAnalysisConfidence({
        series: analisisCategorias.serie,
        currentCycle: analisisTarjeta?.ciclo_punta || selectedCiclo,
        cycleContext: { cicloEnCurso: !resumenSeleccionadoCerrado },
        valueKeys: ['total_ars', 'total_usd']
      }),
    [analisisCategorias.serie, analisisTarjeta?.ciclo_punta, selectedCiclo, resumenSeleccionadoCerrado]
  );
  const showCategoryTrendTable = analisisCategorias.topCategorias.some((categoria) =>
    analisisCategorias.serie.some((item) => {
      const found = (item.categorias || []).find((entry) => entry.categoria === categoria.categoria) || {};
      return Number(found.total_ars || 0) > 0;
    })
  );
  const categoryCurveData = useMemo(
    () => buildCategoryCurveData(analisisCategorias.serieExtendida, selectedAnalysisCategories, analysisPeriodCount),
    [analisisCategorias.serieExtendida, analysisPeriodCount, selectedAnalysisCategories]
  );
  const csvImportSteps = ['Subir CSV', 'Revisar consumos', 'Confirmar importacion'];
  const csvExistingCycles = useMemo(
    () => new Set([selectedCiclo, ...historialResumenes.map((item) => item.ciclo), ...consumos.map((item) => item.ciclo_asignado)].filter(Boolean)),
    [consumos, historialResumenes, selectedCiclo]
  );
  const csvRowsWithValidation = useMemo(
    () => csvImportRows.map((row) => ({ ...row, _validation: validateCsvImportRow(row, savedCierreForm.fecha_cierre, selectedCiclo, tarjetaActual, csvExistingCycles, consumosRegistrados, historialResumenes) })),
    [csvImportRows, savedCierreForm.fecha_cierre, selectedCiclo, tarjetaActual, csvExistingCycles, consumosRegistrados, historialResumenes]
  );
  useEffect(() => {
    if (analysisCategoryOptions.length === 0) return;
    setAnalysisCategorySelection((current) => {
      const valid = current.filter((category) => analysisCategoryOptions.includes(category)).slice(0, 6);
      return valid.length > 0 ? valid : analysisCategoryOptions.slice(0, Math.min(3, analysisCategoryOptions.length));
    });
  }, [analysisCategoryOptions]);
  useEffect(() => {
    setShowAllCategoryImpacts(false);
  }, [selectedCiclo]);
  const csvHasInvalidRows = csvRowsWithValidation.some((row) => row._validation.estado === 'invalida');
  const csvImportableRows = csvRowsWithValidation.filter((row) => !row._ignored && row._validation.estado !== 'invalida');
  const csvImportStats = useMemo(() => csvRowsWithValidation.reduce(
    (acc, row) => {
      if (row._ignored) acc.ignored += 1;
      else if (row._validation.estado === 'invalida') acc.invalid += 1;
      else {
        acc.toImport += 1;
        const impactoResumen = getCsvResumenImpact(row);
        if (row.moneda === 'USD') acc.totalUsd += impactoResumen;
        else acc.totalArs += impactoResumen;
      }
      return acc;
    },
    { toImport: 0, ignored: 0, invalid: 0, totalArs: 0, totalUsd: 0 }
  ), [csvRowsWithValidation]);
  const openCsvImportModal = () => {
    setVistaTarjeta('principal');
    setCsvImportStep(1);
    setCsvImportRows([]);
    setCsvImportError('');
    setCsvImportFileName('');
    setCsvImportProgress({ processed: 0, total: 0 });
    setCsvImportOpen(true);
  };
  const closeCsvImportModal = () => {
    if (loadingAction === 'csv-import') return;
    setCsvImportOpen(false);
  };
  const csvCanContinue = csvImportStep === 1
    ? csvImportRows.length > 0 && !csvImportError
    : csvImportStep === 2
      ? !csvHasInvalidRows
      : true;
  const updateCsvImportRow = (rowId, field, value) => {
    setCsvImportRows((rows) => rows.map((row) => {
      if (row._id !== rowId) return row;
      const cleanValue = ['monto_total', 'monto_cuota'].includes(field) ? sanitizeDecimalInput(value) : value;
      const next = { ...row, [field]: cleanValue };
      if (['cantidad_cuotas', 'modo_carga', 'monto_total', 'monto_cuota'].includes(field)) {
        const source = field === 'monto_cuota' ? 'cuota' : field === 'monto_total' ? 'total' : next.modo_carga;
        return calcularMontosPorModo(next, source);
      }
      return next;
    }));
  };
  const toggleCsvImportRowEdit = (rowId) => {
    setCsvImportRows((rows) => rows.map((row) => (row._id === rowId ? { ...row, _editing: !row._editing } : row)));
  };
  const toggleCsvImportRowIgnored = (rowId) => {
    setCsvImportRows((rows) => rows.map((row) => (row._id === rowId ? { ...row, _ignored: !row._ignored, _editing: false } : row)));
  };
  const deleteCsvImportRow = (rowId) => {
    setCsvImportRows((rows) => rows.filter((row) => row._id !== rowId));
  };
  const toggleAnalysisCategory = (category) => {
    setAnalysisCategorySelection((current) => {
      if (current.includes(category)) return current.length <= 1 ? current : current.filter((item) => item !== category);
      if (current.length >= 6) return current;
      return [...current, category];
    });
  };
  const handleCsvFileChange = (event) => {
    const file = event.target.files?.[0];
    setCsvImportRows([]);
    setCsvImportError('');
    setCsvImportFileName(file?.name || '');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvImportError('Selecciona un archivo .csv.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rowIdBase = Date.now();
        setCsvImportRows(parseCsvText(reader.result).map((row, index) => ({
          ...calcularMontosPorModo({
            ...row,
            monto_total: row.monto_total ? formatDecimalInput(parseAmount(row.monto_total)) : '',
            monto_cuota: row.monto_cuota ? formatDecimalInput(parseAmount(row.monto_cuota)) : ''
          }, row.modo_carga === 'cuota' ? 'cuota' : 'total'),
          _id: `${rowIdBase}-${index}`,
          _editing: false,
          _ignored: false
        })));
      } catch (error) {
        setCsvImportError(error.message || 'No se pudo leer el CSV.');
      }
    };
    reader.onerror = () => setCsvImportError('No se pudo leer el archivo.');
    reader.readAsText(file);
  };
  const handleConfirmCsvImport = async () => {
    if (actionLockRef.current || csvImportableRows.length === 0) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction('csv-import');
    setCsvImportProgress({ processed: 0, total: csvImportableRows.length });
    try {
      const data = await importConsumosTarjeta({
        consumos: csvImportableRows.map((row) => ({
          tarjeta_id: Number(tarjetaActual?.id || form.tarjeta_id),
          fecha_compra: row.fecha_compra,
          descripcion: row.descripcion,
          categoria: row.categoria || null,
          moneda: row.moneda,
          cuota_actual: row.cuota_actual ? resolveCsvCuotaInicial(row) : null,
          cantidad_cuotas: Number(row.cantidad_cuotas || 1),
          monto_total: parseAmount(row.monto_total),
          monto_cuota: parseAmount(row.monto_cuota),
          titular: row.titular || null,
          observaciones: row.observaciones || null
        }))
      }, (progress) => setCsvImportProgress({
        processed: Number(progress.processed || 0),
        total: Number(progress.total || csvImportableRows.length)
      }));
      setCsvImportOpen(false);
      setCsvImportRows([]);
      await cargarTarjetas(form.tarjeta_id, selectedCiclo);
      onToast?.({ message: `Importados: ${data.importados || csvImportableRows.length}. Ignorados: ${csvImportStats.ignored}.` });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo importar el CSV. No se guardo ningun consumo.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };

  const cargarTarjetas = async (tarjetaId = form.tarjeta_id, cicloConsulta = selectedCiclo) => {
    if (!hogarId) return;
    const data = await getTarjetasCredito(hogarId, cicloConsulta, tarjetaId);
    setTarjetas(data.tarjetas || []);
    setCierre(data.cierre || null);
    const nextCierreForm = {
      fecha_cierre: data.cierre?.fecha_cierre ? String(data.cierre.fecha_cierre).slice(0, 10) : getClosingDateIso(cicloConsulta),
      fecha_vencimiento: data.cierre?.fecha_vencimiento ? String(data.cierre.fecha_vencimiento).slice(0, 10) : ''
    };
    setCierreForm(nextCierreForm);
    setSavedCierreForm(nextCierreForm);
    setConsumos(data.consumos || []);
    setConsumosRegistrados(data.consumos_registrados || data.consumos || []);
    setResumen(data.resumen || { total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 });
    setHistorialResumenes(data.historial_resumenes || []);
    setAnalisisTarjeta(data.analisis_tarjeta || null);
    setFilters((prev) => ({ ...prev, ciclo: cicloConsulta }));
    setForm((prev) => ({
      ...prev,
      tarjeta_id: tarjetaId ? String(tarjetaId) : prev.tarjeta_id || String(data.tarjetas?.[0]?.id || '')
    }));
  };

  useEffect(() => {
    setSelectedCiclo(ciclo);
  }, [ciclo]);

  useEffect(() => {
    let active = true;
    const loadId = cycleLoadRef.current + 1;
    cycleLoadRef.current = loadId;
    setLoading(true);
    setLoadingAction('cycle-load');
    cargarTarjetas()
      .catch((err) => onToast?.({ type: 'error', message: err.message }))
      .finally(() => {
        if (!active || cycleLoadRef.current !== loadId) return;
        setLoading(false);
        setLoadingAction('');
      });
    return () => {
      active = false;
    };
  }, [hogarId, selectedCiclo]);

  const handleTarjetaChange = (value) => {
    const loadId = cycleLoadRef.current + 1;
    cycleLoadRef.current = loadId;
    setForm((prev) => ({ ...prev, tarjeta_id: value }));
    setLoading(true);
    setLoadingAction('cycle-load');
    cargarTarjetas(value, selectedCiclo)
      .catch((err) => onToast?.({ type: 'error', message: err.message }))
      .finally(() => {
        if (cycleLoadRef.current !== loadId) return;
        setLoading(false);
        setLoadingAction('');
      });
  };

  const handleCicloChange = (value) => {
    if (value === selectedCiclo) return;
    cycleLoadRef.current += 1;
    setLoading(true);
    setLoadingAction('cycle-load');
    setFilters((prev) => ({ ...prev, ciclo: value }));
    window.setTimeout(() => setSelectedCiclo(value), 0);
  };

  const navegarResumen = (offset) => {
    handleCicloChange(addMonthsToCycle(selectedCiclo, offset));
  };

  const handleCierreFieldChange = async (field, value) => {
    setCierreForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGuardarCierre = async () => {
    if (!cierre?.id || cierre?.estado === 'cerrado' || !cierreForm.fecha_cierre) return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction('cierre-form');

    try {
      const data = await updateCierreTarjeta(cierre.id, {
        fecha_cierre: cierreForm.fecha_cierre,
        fecha_vencimiento: cierreForm.fecha_vencimiento || null
      });
      setCierre(data.item || cierre);
      setSavedCierreForm(cierreForm);
      await cargarTarjetas(form.tarjeta_id, selectedCiclo);
      onToast?.({ message: 'Resumen actualizado.' });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo guardar el resumen.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => {
      const cleanValue = ['monto_total', 'monto_cuota'].includes(field) ? sanitizeDecimalInput(value) : value;
      const next = { ...prev, [field]: cleanValue };
      return ['monto_total', 'monto_cuota', 'cantidad_cuotas'].includes(field)
        ? calcularMontosPorModo(next, calcSource)
        : next;
    });
  };

  const handleCalcSourceChange = (source) => {
    setCalcSource(source);
    setForm((prev) => calcularMontosPorModo(prev, source));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction('consumo');

    try {
      const payload = {
        tarjeta_id: Number(form.tarjeta_id),
        ciclo_actual: editingId ? editingCicloBase || selectedCiclo : selectedCiclo,
        fecha_compra: form.fecha_compra,
        descripcion: form.descripcion,
        categoria: form.categoria || null,
        moneda: form.moneda,
        monto_total: parseAmount(form.monto_total),
        cantidad_cuotas: Number(form.cantidad_cuotas || 1),
        monto_cuota: parseAmount(form.monto_cuota),
        titular: form.titular || null,
        observaciones: form.observaciones || null
      };
      if (editingId) await updateConsumoTarjeta(editingId, payload);
      else await createConsumoTarjeta(payload);
      setForm((prev) => ({
        ...initialForm,
        fecha_compra: prev.fecha_compra,
        tarjeta_id: prev.tarjeta_id,
        categoria: prev.categoria
      }));
      setEditingId(null);
      setEditingCicloBase('');
      await cargarTarjetas();
      onToast?.({ message: editingId ? 'Consumo actualizado.' : 'Consumo guardado.' });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo guardar el consumo.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleEdit = (consumo) => {
    if (resumenSeleccionadoCerrado && consumo.ciclo_asignado === selectedCiclo) return;
    setEditingId(consumo.compra_id || consumo.id);
    setEditingCicloBase(consumo.ciclo_compra || consumo.ciclo_asignado || selectedCiclo);
    setForm({
      fecha_compra: String(consumo.fecha_compra || '').slice(0, 10),
      descripcion: consumo.descripcion || '',
      categoria: consumo.categoria || '',
      moneda: consumo.moneda || 'ARS',
      monto_total: formatDecimalInput(consumo.monto_total || 0),
      cantidad_cuotas: String(consumo.cantidad_cuotas || 1),
      monto_cuota: formatDecimalInput(consumo.monto_cuota || 0),
      tarjeta_id: String(consumo.tarjeta_id || tarjetaActual?.id || ''),
      titular: consumo.titular || '',
      observaciones: consumo.observaciones || ''
    });
    setCalcSource('total');
    setVistaTarjeta('principal');
    window.requestAnimationFrame(() => {
      consumoFormPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => consumoDescripcionRef.current?.focus({ preventScroll: true }));
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingCicloBase('');
    setForm((prev) => ({ ...initialForm, fecha_compra: prev.fecha_compra, tarjeta_id: prev.tarjeta_id }));
  };

  const handleDelete = async (consumo) => {
    if (resumenSeleccionadoCerrado && consumo.ciclo_asignado === selectedCiclo) return;
    if (!window.confirm(`Eliminar consumo "${consumo.descripcion}"?`)) return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction('delete-consumo');
    try {
      await deleteConsumoTarjeta(consumo.compra_id || consumo.id, consumo.ciclo_asignado || selectedCiclo);
      await cargarTarjetas();
      onToast?.({ message: 'Consumo eliminado.' });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo eliminar el consumo.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };
  const handleToggleCierre = async () => {
    if (!cierre?.id) return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction('toggle-cierre');
    try {
      const siguienteEstado = cierre.estado === 'cerrado' ? 'abierto' : 'cerrado';
      await updateCierreTarjeta(cierre.id, { estado: cierre.estado === 'cerrado' ? 'abierto' : 'cerrado' });
      await cargarTarjetas();
      onToast?.({ message: siguienteEstado === 'cerrado' ? 'Resumen cerrado.' : 'Resumen reabierto.' });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo cambiar el estado del resumen.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleGenerarMovimientoResumen = async (cierreObjetivo = cierre) => {
    if (!cierreObjetivo?.id || cierreObjetivo.estado !== 'cerrado') return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction(`movimiento-resumen-${cierreObjetivo.id}`);
    setMovimientoResumenAviso(null);
    setMovimientoResumenGenerado(null);
    try {
      const data = await generarMovimientoResumenTarjeta(cierreObjetivo.id);
      if (data.duplicate) {
        setMovimientoResumenAviso({ cierreId: cierreObjetivo.id, message: data.error || 'Ya existe un movimiento similar para este resumen.' });
        onToast?.({ type: 'error', message: 'Ya existe un movimiento similar para este resumen.' });
        return;
      }
      setMovimientoResumenGenerado(data.item ? { ...data.item, cierreId: cierreObjetivo.id } : null);
      await onMovimientosChange?.();
      onToast?.({ message: 'Egreso generado en Movimientos.' });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo generar el movimiento.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleVerResumen = (cicloResumen) => {
    if (!cicloResumen) return;
    setDetailItem(null);
    setEditingId(null);
    setEditingCicloBase('');
    handleCicloChange(cicloResumen);
    setVistaTarjeta('principal');
  };

  const handleEditarResumen = (item) => {
    handleVerResumen(item.ciclo);
  };

  const handleToggleResumenHistorial = async (item) => {
    if (!item?.id) return;
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setLoading(true);
    setLoadingAction('historial-cierre');
    try {
      const siguienteEstado = item.estado === 'cerrado' ? 'abierto' : 'cerrado';
      await updateCierreTarjeta(item.id, { estado: siguienteEstado });
      await cargarTarjetas(form.tarjeta_id, selectedCiclo);
      onToast?.({ message: siguienteEstado === 'cerrado' ? 'Resumen cerrado.' : 'Resumen reabierto.' });
    } catch (err) {
      onToast?.({ type: 'error', message: err.message || 'No se pudo cambiar el estado del resumen.' });
    } finally {
      actionLockRef.current = false;
      setLoading(false);
      setLoadingAction('');
    }
  };

  const cards = [
    { label: 'Total ARS del resumen', value: formatMoney(resumen.total_ars), tone: 'ars' },
    { label: 'Total USD del resumen', value: `US$ ${Number(resumen.total_usd || 0).toLocaleString('es-AR', moneyFormat)}`, tone: 'usd' },
    { label: 'Cantidad de consumos', value: resumen.consumos || 0, tone: 'count' },
    { label: 'Cuotas futuras', value: resumen.cuotas_futuras || 0, tone: 'future' }
  ];

  if (csvImportOpen) {
    return (
      <section className="tarjeta-panel tarjeta-csv-screen">
        <div className="panel tarjeta-csv-modal">
          <div className="panel-header tarjeta-csv-screen-header">
            <div>
              <p className="eyebrow">Tarjeta de credito</p>
              <h2 id="csv-import-title">Importar resumen desde CSV</h2>
            </div>
            <button className="close-btn" type="button" onClick={closeCsvImportModal} aria-label="Cerrar" disabled={loadingAction === 'csv-import'}>
              x
            </button>
          </div>
          <div className="tarjeta-csv-steps">
            {csvImportSteps.map((step, index) => {
              const stepNumber = index + 1;
              return (
                <div className={stepNumber === csvImportStep ? 'active' : stepNumber < csvImportStep ? 'done' : ''} key={step}>
                  <span>{stepNumber}</span>
                  <strong>{step}</strong>
                </div>
              );
            })}
          </div>
          <div className="tarjeta-csv-placeholder">
            <span>Paso {csvImportStep}</span>
            <strong>{csvImportSteps[csvImportStep - 1]}</strong>
            {csvImportStep === 1 ? (
              <div className="tarjeta-csv-upload">
                <button className="btn-inline secondary" type="button" onClick={downloadCsvTemplate}>
                  Descargar plantilla CSV
                </button>
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} />
                <small>{csvImportFileName || csvExpectedHeaders.join(',')}</small>
                {csvImportError && <p className="tarjeta-csv-error">{csvImportError}</p>}
                {!csvImportError && csvImportRows.length > 0 && (
                  <p className="tarjeta-csv-ok">{csvImportRows.length} filas detectadas.</p>
                )}
              </div>
            ) : csvImportStep === 2 ? (
              <div className="tarjeta-csv-table-wrap">
                <table className="tarjeta-table tarjeta-csv-table">
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Fecha</th>
                      <th>Descripcion</th>
                      <th>Categoria</th>
                      <th>Moneda</th>
                      <th>Cuota actual</th>
                      <th>Cuotas</th>
                      <th>Modo</th>
                      <th>Monto total</th>
                      <th>Monto cuota</th>
                      <th>Resumen asignado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRowsWithValidation.map((row) => {
                      const validation = row._validation;
                      const rowStatus = row._editing && validation.estado !== 'ignorada' ? 'editando' : validation.estado;
                      return (
                        <tr className={`csv-row-${validation.estado}`} key={row._id}>
                          <td>
                            <span className="pill">{rowStatus}</span>
                            <small>{validation.motivo}</small>
                            {validation.posibleDuplicado && <small className="tarjeta-csv-duplicate">posible duplicado</small>}
                          </td>
                          <td>{row._editing ? <input type="date" value={row.fecha_compra || ''} onChange={(e) => updateCsvImportRow(row._id, 'fecha_compra', e.target.value)} /> : row.fecha_compra}</td>
                          <td>{row._editing ? <input value={row.descripcion || ''} onChange={(e) => updateCsvImportRow(row._id, 'descripcion', e.target.value)} /> : row.descripcion}</td>
                          <td>{row._editing ? (
                            <select value={row.categoria || ''} onChange={(e) => updateCsvImportRow(row._id, 'categoria', e.target.value)}>
                              <option value="">Sin categoria</option>
                              {categoriasEgreso.map((categoria) => (
                                <option key={categoria.id} value={categoria.nombre}>{categoria.nombre}</option>
                              ))}
                            </select>
                          ) : (row.categoria || 'Sin categoria')}</td>
                          <td>{row._editing ? (
                            <select value={row.moneda || 'ARS'} onChange={(e) => updateCsvImportRow(row._id, 'moneda', e.target.value)}>
                              <option value="ARS">ARS</option>
                              <option value="USD">USD</option>
                            </select>
                          ) : row.moneda}</td>
                          <td>{row._editing ? <input type="number" min="1" step="1" value={row.cuota_actual || ''} onChange={(e) => updateCsvImportRow(row._id, 'cuota_actual', e.target.value)} placeholder="auto" /> : (row.cuota_actual || 'auto')}</td>
                          <td>{row._editing ? <input type="number" min="1" step="1" value={row.cantidad_cuotas || ''} onChange={(e) => updateCsvImportRow(row._id, 'cantidad_cuotas', e.target.value)} /> : row.cantidad_cuotas}</td>
                          <td>{row._editing ? (
                            <select value={row.modo_carga || 'total'} onChange={(e) => updateCsvImportRow(row._id, 'modo_carga', e.target.value)}>
                              <option value="total">total</option>
                              <option value="cuota">cuota</option>
                            </select>
                          ) : row.modo_carga}</td>
                          <td>{row._editing ? <input inputMode="decimal" value={row.monto_total || ''} onChange={(e) => updateCsvImportRow(row._id, 'monto_total', e.target.value)} placeholder="0,00" /> : row.monto_total}</td>
                          <td>{row._editing ? <input inputMode="decimal" value={row.monto_cuota || ''} onChange={(e) => updateCsvImportRow(row._id, 'monto_cuota', e.target.value)} placeholder="0,00" /> : row.monto_cuota}</td>
                          <td>
                            <span className="pill">{validation.assignedCycle ? formatCycleLabel(validation.assignedCycle) : '-'}</span>
                            {validation.pasaAlProximo && <small className="tarjeta-csv-next-badge">Pasa al proximo resumen</small>}
                            {validation.willCreateSummary && <small>Se creara con cierre {formatDate(validation.nextSummaryDefaults?.fecha_cierre)}</small>}
                          </td>
                          <td>
                            {row._editing && (
                              <div className="tarjeta-csv-row-extra">
                                <input placeholder="Titular" value={row.titular || ''} onChange={(e) => updateCsvImportRow(row._id, 'titular', e.target.value)} />
                                <input placeholder="Observaciones" value={row.observaciones || ''} onChange={(e) => updateCsvImportRow(row._id, 'observaciones', e.target.value)} />
                              </div>
                            )}
                            <div className="acciones-inline">
                              <button className="btn-inline secondary" type="button" onClick={() => toggleCsvImportRowEdit(row._id)}>{row._editing ? 'OK' : 'Editar'}</button>
                              <button className="btn-inline secondary" type="button" onClick={() => toggleCsvImportRowIgnored(row._id)}>{row._ignored ? 'Restaurar' : 'Ignorar'}</button>
                              <button className="btn-inline danger" type="button" onClick={() => deleteCsvImportRow(row._id)}>Eliminar</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {csvHasInvalidRows && (
                  <p className="tarjeta-csv-error">Hay filas invalidas sin ignorar. Corregilas o ignoralas para continuar.</p>
                )}
              </div>
            ) : (
              <div className="tarjeta-csv-confirm">
                <div><span>Filas a importar</span><strong>{csvImportStats.toImport}</strong></div>
                <div><span>Filas ignoradas</span><strong>{csvImportStats.ignored}</strong></div>
                <div><span>Filas invalidas</span><strong>{csvImportStats.invalid}</strong></div>
                <div><span>Estimado resumen ARS</span><strong>{formatMoney(csvImportStats.totalArs)}</strong></div>
                <div><span>Estimado resumen USD</span><strong>{formatUsd(csvImportStats.totalUsd)}</strong></div>
              </div>
            )}
          </div>
          <div className="confirm-actions tarjeta-csv-actions">
            <button className="btn-inline secondary" type="button" onClick={closeCsvImportModal} disabled={loadingAction === 'csv-import'}>
              Cancelar
            </button>
            {csvImportStep > 1 && (
              <button className="btn-inline secondary" type="button" onClick={() => setCsvImportStep(csvImportStep === 2 ? 1 : 2)} disabled={loadingAction === 'csv-import'}>
                {csvImportStep === 2 ? 'Volver' : 'Volver a revisar'}
              </button>
            )}
            {csvImportStep < csvImportSteps.length ? (
              <button className="btn-inline" type="button" onClick={() => setCsvImportStep((step) => Math.min(csvImportSteps.length, step + 1))} disabled={!csvCanContinue || loadingAction === 'csv-import'}>
                Continuar
              </button>
            ) : (
              <button className="btn-inline btn-with-spinner" type="button" onClick={handleConfirmCsvImport} disabled={loading || csvImportStats.toImport === 0}>
                {loadingAction === 'csv-import' && <span className="btn-spinner" aria-hidden="true" />}
                {loadingAction === 'csv-import' ? 'Importando...' : 'Confirmar importacion'}
              </button>
            )}
          </div>
          {loadingAction === 'csv-import' && (
            <div className="tarjeta-csv-busy" role="status" aria-live="polite">
              <span className="btn-spinner" aria-hidden="true" />
              <strong>Registrando resumen...</strong>
              <small>{csvImportProgress.processed} de {csvImportProgress.total || csvImportableRows.length} filas procesadas</small>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="tarjeta-panel">
      {loadingAction === 'cycle-load' && (
        <div className="tarjeta-loading-overlay" role="status" aria-live="polite">
          <span className="btn-spinner" aria-hidden="true" />
          <strong>Actualizando resumen...</strong>
        </div>
      )}
      <div className="panel tarjeta-hero">
        <div>
          <p className="eyebrow">Tarjeta de credito</p>
          <h2>
            {vistaTarjeta === 'principal'
              ? 'Consumo actual'
              : vistaTarjeta === 'historial'
                ? 'Historial'
                : 'Analisis'}
          </h2>
          <p>
            {vistaTarjeta === 'principal'
              ? `${tarjetaActual?.nombre || 'Tarjeta principal'} - resumen en curso y cuotas futuras.`
              : vistaTarjeta === 'historial'
                ? 'Resumenes anteriores y estado de cierres.'
                : 'Tendencias y comparativas desde el proximo resumen abierto.'}
          </p>
        </div>
        <div className="tarjeta-hero-actions">
          <div className="tarjeta-view-switch" aria-label="Cambiar pantalla de tarjeta">
            <button
              type="button"
              className={vistaTarjeta === 'principal' ? 'active' : ''}
              aria-pressed={vistaTarjeta === 'principal'}
              onClick={() => setVistaTarjeta('principal')}
            >
              Consumo actual
            </button>
            <button
              type="button"
              className={vistaTarjeta === 'historial' ? 'active' : ''}
              aria-pressed={vistaTarjeta === 'historial'}
              onClick={() => setVistaTarjeta('historial')}
            >
              Historial
            </button>
            <button
              type="button"
              className={vistaTarjeta === 'analisis' ? 'active' : ''}
              aria-pressed={vistaTarjeta === 'analisis'}
              onClick={() => setVistaTarjeta('analisis')}
            >
              Analisis
            </button>
          </div>
        </div>
      </div>

      {vistaTarjeta === 'principal' ? (
        <>
      <section className="panel tarjeta-current-summary tarjeta-section-card tarjeta-section-config">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Paso 1</p>
            <h2>Resumen actual de tarjeta</h2>
            <p>Cierre, vencimiento y estado.</p>
          </div>
          <em className={`tarjeta-cierre-status ${cierre?.estado === 'cerrado' ? 'cerrado' : 'abierto'}`}>
            {cierre?.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}
          </em>
        </div>
        <p className={`tarjeta-summary-state ${resumenSeleccionadoCerrado ? 'cerrado' : 'abierto'}`}>
          Resumen {formatCycleLabel(selectedCiclo)} {resumenSeleccionadoCerrado ? 'cerrado' : 'abierto'}
        </p>
        {loadingAction === 'cycle-load' && (
          <p className="tarjeta-inline-loading">
            <span className="btn-spinner" aria-hidden="true" />
            Actualizando resumen...
          </p>
        )}
        <div className="tarjeta-summary-navigator" aria-label="Navegar resumenes de tarjeta">
          <button type="button" className="btn-inline secondary btn-with-spinner" onClick={() => navegarResumen(-1)} disabled={loadingAction === 'cycle-load'}>
            {loadingAction === 'cycle-load' && <span className="btn-spinner" aria-hidden="true" />}
            {loadingAction === 'cycle-load' ? 'Cargando...' : 'Anterior'}
          </button>
          <label>
            Ver resumen
            <select value={selectedCiclo} onChange={(e) => handleCicloChange(e.target.value)} disabled={loadingAction === 'cycle-load'}>
              {ciclosNavegacionResumen.map((item) => (
                <option key={item} value={item}>{formatCycleLabel(item)}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-inline secondary btn-with-spinner" onClick={() => navegarResumen(1)} disabled={loadingAction === 'cycle-load'}>
            {loadingAction === 'cycle-load' && <span className="btn-spinner" aria-hidden="true" />}
            {loadingAction === 'cycle-load' ? 'Cargando...' : 'Siguiente'}
          </button>
        </div>
        <div className="tarjeta-current-grid">
          <label>
            Tarjeta seleccionada
            <select value={form.tarjeta_id} onChange={(e) => handleTarjetaChange(e.target.value)} disabled={loadingAction === 'cycle-load'}>
              {tarjetas.map((tarjeta) => (
                <option key={tarjeta.id} value={tarjeta.id}>{tarjeta.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Fecha de cierre del resumen
            <input
              type="date"
              value={cierreForm.fecha_cierre}
              disabled={resumenSeleccionadoCerrado}
              onChange={(e) => handleCierreFieldChange('fecha_cierre', e.target.value)}
            />
          </label>
          <label>
            Fecha de vencimiento
            <input
              type="date"
              value={cierreForm.fecha_vencimiento}
              disabled={resumenSeleccionadoCerrado}
              onChange={(e) => handleCierreFieldChange('fecha_vencimiento', e.target.value)}
            />
          </label>
        </div>
        <div className="tarjeta-current-actions">
          <p className={`tarjeta-config-status ${cierreTieneCambios ? 'pending' : 'saved'}`}>
            {cierreTieneCambios
              ? 'Hay cambios pendientes en la configuracion del resumen.'
              : `Configuracion guardada para ${formatCycleLabel(selectedCiclo)}.`}
          </p>
          <div className="tarjeta-config-buttons">
            <button
              type="button"
              className="btn-inline tarjeta-save-config btn-with-spinner"
              onClick={handleGuardarCierre}
              disabled={loading || !cierre?.id || resumenSeleccionadoCerrado || !cierreTieneCambios || !cierreForm.fecha_cierre}
            >
              {loadingAction === 'cierre-form' && <span className="btn-spinner" aria-hidden="true" />}
              {loadingAction === 'cierre-form' ? 'Guardando...' : 'Guardar configuracion del resumen'}
            </button>
            <button type="button" className="btn-inline secondary tarjeta-close-action btn-with-spinner" onClick={handleToggleCierre} disabled={loading || !cierre?.id}>
              {loadingAction === 'toggle-cierre' && <span className="btn-spinner" aria-hidden="true" />}
              {loadingAction === 'toggle-cierre' ? 'Procesando...' : resumenSeleccionadoCerrado ? 'Reabrir resumen' : 'Cerrar resumen'}
            </button>
          </div>
        </div>
      </section>

      <div className="tarjeta-summary-grid">
        {cards.map((card) => (
          <article className={`card tarjeta-summary-card tarjeta-${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      {resumenSeleccionadoCerrado && (
        <section className="panel tarjeta-closed-summary tarjeta-closed-summary-action">
          <div className="tarjeta-closed-summary-grid">
            <div>
              <span>Total ARS cerrado</span>
              <strong>{formatMoney(resumen.total_ars)}</strong>
            </div>
            <div>
              <span>Total USD cerrado</span>
              <strong>USD {Number(resumen.total_usd || 0).toLocaleString('es-AR', moneyFormat)}</strong>
            </div>
            <div>
              <span>Consumos incluidos</span>
              <strong>{resumen.consumos || 0}</strong>
            </div>
          </div>
          <div className="tarjeta-summary-movement-actions">
            {movimientoResumenAviso?.cierreId === cierre?.id && <p className="tarjeta-summary-warning">Ya existe un movimiento similar para este resumen.</p>}
            {movimientoResumenGenerado?.cierreId === cierre?.id && (
              <button type="button" className="btn-inline secondary" onClick={() => onVerMovimientoGenerado?.(movimientoResumenGenerado)}>
                Ver movimiento generado
              </button>
            )}
            <button
              type="button"
              className="btn-inline btn-with-spinner"
              onClick={() => handleGenerarMovimientoResumen(cierre)}
              disabled={loading || !cierre?.id || Number(resumen.total_ars || 0) <= 0}
            >
              {loadingAction === `movimiento-resumen-${cierre?.id}` && <span className="btn-spinner" aria-hidden="true" />}
              {loadingAction === `movimiento-resumen-${cierre?.id}` ? 'Generando...' : 'Generar egreso en Movimientos'}
            </button>
          </div>
        </section>
      )}

      <section className="panel panel-form tarjeta-form-panel tarjeta-section-card tarjeta-section-form" ref={consumoFormPanelRef}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">Carga manual</p>
            <h2>{editingId ? 'Editar consumo' : 'Nuevo consumo'}</h2>
            <p>Alta rapida de consumo puntual.</p>
          </div>
          <div className="tarjeta-form-header-actions">
            <span className={`tarjeta-assignment-preview ${previewPasaAlSiguiente ? 'next' : ''}`} aria-live="polite">
              {previewPasaAlSiguiente ? 'Pasa a ' : 'Resumen '}
              <strong>{formatCycleLabel(previewCicloAsignado)}</strong>
            </span>
          </div>
        </div>
        <div className="tarjeta-load-actions" aria-label="Acciones de carga de tarjeta">
          <button type="button" className="btn-inline tarjeta-load-primary" onClick={() => consumoDescripcionRef.current?.focus()}>
            + Nuevo consumo
          </button>
          <button className="tarjeta-import-summary-btn" type="button" onClick={openCsvImportModal} disabled={loading}>
            <span>Importar CSV</span>
            <small>Carga masiva del resumen</small>
          </button>
        </div>
        <form className="form-grid tarjeta-consumo-form" onSubmit={handleSubmit}>
          <div className="tarjeta-form-group tarjeta-form-group-purchase">
            <span className="tarjeta-form-group-title">Compra</span>
            <label>
              Fecha
              <input type="date" value={form.fecha_compra} onChange={(e) => handleChange('fecha_compra', e.target.value)} required />
            </label>
            <label className="field-strong tarjeta-field-wide">
              Comercio / descripcion
              <input ref={consumoDescripcionRef} value={form.descripcion} onChange={(e) => handleChange('descripcion', e.target.value)} placeholder="Ej: Mercado, farmacia" required />
            </label>
            <label>
              Categoria
              <select value={form.categoria} onChange={(e) => handleChange('categoria', e.target.value)}>
                <option value="">Sin categoria</option>
                {categoriasEgreso.map((categoria) => (
                  <option key={categoria.id} value={categoria.nombre}>{categoria.nombre}</option>
                ))}
              </select>
            </label>
            <label>
              Tarjeta
              <select value={form.tarjeta_id} onChange={(e) => handleChange('tarjeta_id', e.target.value)} required>
                {tarjetas.map((tarjeta) => (
                  <option key={tarjeta.id} value={tarjeta.id}>{tarjeta.nombre}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="tarjeta-form-group tarjeta-form-group-amounts">
            <span className="tarjeta-form-group-title">Importe</span>
            <label>
              Moneda
              <select value={form.moneda} onChange={(e) => handleChange('moneda', e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Cuotas
              <input type="number" min="1" step="1" value={form.cantidad_cuotas} onChange={(e) => handleChange('cantidad_cuotas', e.target.value)} required />
            </label>
            <label className="tarjeta-calc-mode">
              Modo de carga
              <select value={calcSource} onChange={(e) => handleCalcSourceChange(e.target.value)}>
                <option value="total">Cargo total</option>
                <option value="cuota">Cargo cuota</option>
              </select>
            </label>
            <label className="field-strong">
              Monto total
              <input
                type="text"
                inputMode="decimal"
                value={form.monto_total}
                onChange={(e) => handleChange('monto_total', e.target.value)}
                placeholder="0,00"
                readOnly={calcSource !== 'total'}
                required
              />
            </label>
            <label className="field-strong">
              Monto de cuota
              <input
                type="text"
                inputMode="decimal"
                value={form.monto_cuota}
                onChange={(e) => handleChange('monto_cuota', e.target.value)}
                placeholder="0,00"
                readOnly={calcSource !== 'cuota'}
                required
              />
            </label>
          </div>

          <div className="tarjeta-form-group tarjeta-form-group-extra">
            <span className="tarjeta-form-group-title">Opcional</span>
            <label>
              Titular / adicional
              <input value={form.titular} onChange={(e) => handleChange('titular', e.target.value)} placeholder="Opcional" />
            </label>
            <label className="movement-form-description tarjeta-field-wide">
              <div className="field-heading">
                <span>Observaciones</span>
                <small>Opcional</small>
              </div>
              <textarea value={form.observaciones} onChange={(e) => handleChange('observaciones', e.target.value)} rows="2" />
            </label>
          </div>

          <button className="full-width movement-submit btn-with-spinner" type="submit" disabled={loading || tarjetas.length === 0 || consumoAsignadoAResumenCerrado}>
            {loadingAction === 'consumo' && <span className="btn-spinner" aria-hidden="true" />}
            {loadingAction === 'consumo' ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar consumo'}
          </button>
          {consumoAsignadoAResumenCerrado && (
            <p className="tarjeta-closed-helper full-width">Este resumen esta cerrado. Reabrilo para modificar sus consumos.</p>
          )}
          {editingId && (
            <button className="full-width btn-inline secondary" type="button" onClick={handleCancelEdit}>
              Cancelar edicion
            </button>
          )}
        </form>
      </section>

      <section className="panel tarjeta-consumos-list tarjeta-section-card tarjeta-section-consumos">
        <div className="panel-header">
          <div>
            <h2>Consumos</h2>
            <p>{consumosFiltrados.length} visibles.</p>
          </div>
        </div>
        <div className="tarjeta-table-filters">
          <label>
            Ciclo/resumen
            <select value={filters.ciclo} onChange={(e) => setFilters((prev) => ({ ...prev, ciclo: e.target.value }))}>
              <option value="">Todos</option>
              {ciclosDisponibles.map((item) => <option key={item} value={item}>{formatCycleLabel(item)}</option>)}
            </select>
          </label>
          <label>
            Categoria
            <select value={filters.categoria} onChange={(e) => setFilters((prev) => ({ ...prev, categoria: e.target.value }))}>
              <option value="">Todas</option>
              {Array.from(new Set(consumos.map((item) => item.categoria).filter(Boolean))).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Moneda
            <select value={filters.moneda} onChange={(e) => setFilters((prev) => ({ ...prev, moneda: e.target.value }))}>
              <option value="">Todas</option>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label>
            Cuotas
            <select value={filters.cuotas} onChange={(e) => setFilters((prev) => ({ ...prev, cuotas: e.target.value }))}>
              <option value="">Todas</option>
              <option value="si">Si</option>
              <option value="no">No</option>
            </select>
          </label>
          <label>
            Buscar descripcion
            <input value={filters.texto} onChange={(e) => setFilters((prev) => ({ ...prev, texto: e.target.value }))} placeholder="Comercio o detalle" />
          </label>
        </div>
        <div className="tarjeta-table-wrap">
          <table className="tarjeta-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripcion</th>
                <th>Categoria</th>
                <th>Moneda</th>
                <th>Monto total</th>
                <th>Cuotas</th>
                <th>Monto cuota</th>
                <th>Paga en</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {consumosFiltrados.map((consumo) => (
                <tr key={consumo.id}>
                  <td>{String(consumo.fecha_compra).slice(0, 10)}</td>
                  <td>
                    {consumo.descripcion}
                    {consumo.es_suscripcion_replicada && <small>Suscripcion replicada</small>}
                  </td>
                  <td>{consumo.categoria || 'Sin categoria'}</td>
                  <td>{consumo.moneda}</td>
                  <td>{consumo.moneda === 'USD' ? `US$ ${Number(consumo.monto_total).toLocaleString('es-AR', moneyFormat)}` : formatMoney(consumo.monto_total)}</td>
                  <td>
                    {Number(consumo.cantidad_cuotas || 1) > 1 ? (
                      <span className="tarjeta-cuota-label">
                        {consumo.cuota_label || `${consumo.cuota_numero || 1}/${consumo.cantidad_cuotas}`}
                        <small>{consumo.cantidad_cuotas} cuotas</small>
                      </span>
                    ) : '1 cuota'}
                  </td>
                  <td>{consumo.moneda === 'USD' ? `US$ ${Number(consumo.monto_resumen || consumo.monto_cuota).toLocaleString('es-AR', moneyFormat)}` : formatMoney(consumo.monto_resumen || consumo.monto_cuota)}</td>
                  <td>
                    <span className="pill">{formatCycleLabel(consumo.ciclo_asignado)}</span>
                    <small>
                      {consumo.ciclo_compra && consumo.ciclo_compra !== consumo.ciclo_asignado
                        ? `Compra ${formatCycleLabel(consumo.ciclo_compra)}`
                        : 'Mismo resumen de compra'}
                    </small>
                  </td>
                  <td>
                    <div className="acciones-inline">
                      <button className="icon-btn" type="button" onClick={() => setDetailItem(consumo)} title="Ver detalle" disabled={loading}>i</button>
                      <button className="icon-btn" type="button" onClick={() => handleEdit(consumo)} title="Editar" disabled={loading}>✎</button>
                      <button className="icon-btn danger" type="button" onClick={() => handleDelete(consumo)} title="Eliminar" disabled={loading}>×</button>
                    </div>
                  </td>
                </tr>
              ))}
              {consumosFiltrados.length === 0 && (
                <tr>
                  <td colSpan="9">Sin consumos para los filtros seleccionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailItem && (
        <section className="panel tarjeta-detail-panel">
          <div className="panel-header">
            <h2>Detalle del consumo</h2>
            <button type="button" className="btn-inline secondary" onClick={() => setDetailItem(null)}>Cerrar</button>
          </div>
          <div className="tarjeta-detail-grid">
            <span>Descripcion <strong>{detailItem.descripcion}</strong></span>
            <span>Titular <strong>{detailItem.titular || 'Sin titular'}</strong></span>
            <span>Resumen <strong>{formatCycleLabel(detailItem.ciclo_asignado)}</strong></span>
            <span>Cuota <strong>{detailItem.cuota_label || '1/1'}</strong></span>
            <span>Observaciones <strong>{detailItem.observaciones || 'Sin observaciones'}</strong></span>
          </div>
        </section>
      )}

      <section className="panel tarjeta-cuotas-futuras tarjeta-section-card tarjeta-section-future">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Analisis de cuotas</p>
            <h2>Cuotas futuras</h2>
            <p>Proximos impactos.</p>
          </div>
        </div>
        {cuotasFuturas.length > 0 ? (
          <>
            <div className="tarjeta-future-summary">
              <article>
                <span>Compromiso futuro ARS</span>
                <strong>{formatMoney(cuotasFuturasResumen.totalArs)}</strong>
              </article>
              <article>
                <span>Compromiso futuro USD</span>
                <strong>{formatUsd(cuotasFuturasResumen.totalUsd)}</strong>
              </article>
              <article>
                <span>Mes mas pesado</span>
                <strong>{formatCycleLabel(cuotasFuturasResumen.mesMasPesado?.ciclo)}</strong>
                <small>
                  {formatMoney(cuotasFuturasResumen.mesMasPesado?.totalArs || 0)}
                  {' / '}
                  {formatUsd(cuotasFuturasResumen.mesMasPesado?.totalUsd || 0)}
                </small>
              </article>
              <article>
                <span>Arrastre vigente hasta</span>
                <strong>{formatCycleLabel(cuotasFuturasResumen.hastaCiclo)}</strong>
              </article>
              <article>
                <span>Consumos con cuotas pendientes</span>
                <strong>{cuotasFuturasResumen.consumosPendientes}</strong>
              </article>
            </div>
            <div className="tarjeta-future-grid">
              {cuotasFuturas.map((item) => (
                <article className="tarjeta-future-card" key={item.ciclo}>
                  <span>{formatCycleLabel(item.ciclo)}</span>
                  <strong>{formatMoney(item.totalArs)} ARS</strong>
                  <strong>USD {Number(item.totalUsd || 0).toLocaleString('es-AR', moneyFormat)}</strong>
                  <small>{item.cantidadConsumos} consumos incluidos</small>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">Sin cuotas futuras.</p>
        )}
      </section>
      {csvImportOpen && (
        <div className="modal-overlay tarjeta-csv-overlay" role="dialog" aria-modal="true" aria-labelledby="csv-import-title">
          <div className="modal-content tarjeta-csv-modal">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Tarjeta de credito</p>
                <h2 id="csv-import-title">Importar resumen desde CSV</h2>
              </div>
              <button className="close-btn" type="button" onClick={closeCsvImportModal} aria-label="Cerrar">
                x
              </button>
            </div>
            <div className="tarjeta-csv-steps">
              {csvImportSteps.map((step, index) => {
                const stepNumber = index + 1;
                return (
                  <div className={stepNumber === csvImportStep ? 'active' : stepNumber < csvImportStep ? 'done' : ''} key={step}>
                    <span>{stepNumber}</span>
                    <strong>{step}</strong>
                  </div>
                );
              })}
            </div>
            <div className="tarjeta-csv-placeholder">
              <span>Paso {csvImportStep}</span>
              <strong>{csvImportSteps[csvImportStep - 1]}</strong>
              {csvImportStep === 1 ? (
                <div className="tarjeta-csv-upload">
                  <button className="btn-inline secondary" type="button" onClick={downloadCsvTemplate}>
                    Descargar plantilla CSV
                  </button>
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} />
                  <small>{csvImportFileName || csvExpectedHeaders.join(',')}</small>
                  {csvImportError && <p className="tarjeta-csv-error">{csvImportError}</p>}
                  {!csvImportError && csvImportRows.length > 0 && (
                    <p className="tarjeta-csv-ok">{csvImportRows.length} filas detectadas.</p>
                  )}
                </div>
              ) : csvImportStep === 2 ? (
                <div className="tarjeta-csv-table-wrap">
                  <table className="tarjeta-table tarjeta-csv-table">
                    <thead>
                      <tr>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th>Descripcion</th>
                        <th>Categoria</th>
                        <th>Moneda</th>
                        <th>Cuota actual</th>
                        <th>Cuotas</th>
                        <th>Modo</th>
                        <th>Monto total</th>
                        <th>Monto cuota</th>
                        <th>Resumen asignado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRowsWithValidation.map((row) => {
                        const validation = row._validation;
                        const rowStatus = row._editing && validation.estado !== 'ignorada' ? 'editando' : validation.estado;
                        return (
                          <tr className={`csv-row-${validation.estado}`} key={row._id}>
                            <td>
                              <span className="pill">{rowStatus}</span>
                              <small>{validation.motivo}</small>
                              {validation.posibleDuplicado && <small className="tarjeta-csv-duplicate">posible duplicado</small>}
                            </td>
                            <td>{row._editing ? <input type="date" value={row.fecha_compra || ''} onChange={(e) => updateCsvImportRow(row._id, 'fecha_compra', e.target.value)} /> : row.fecha_compra}</td>
                            <td>{row._editing ? <input value={row.descripcion || ''} onChange={(e) => updateCsvImportRow(row._id, 'descripcion', e.target.value)} /> : row.descripcion}</td>
                            <td>{row._editing ? (
                              <select value={row.categoria || ''} onChange={(e) => updateCsvImportRow(row._id, 'categoria', e.target.value)}>
                                <option value="">Sin categoria</option>
                                {categoriasEgreso.map((categoria) => (
                                  <option key={categoria.id} value={categoria.nombre}>{categoria.nombre}</option>
                                ))}
                              </select>
                            ) : (row.categoria || 'Sin categoria')}</td>
                            <td>{row._editing ? (
                              <select value={row.moneda || 'ARS'} onChange={(e) => updateCsvImportRow(row._id, 'moneda', e.target.value)}>
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                              </select>
                            ) : row.moneda}</td>
                            <td>{row._editing ? <input type="number" min="1" step="1" value={row.cuota_actual || ''} onChange={(e) => updateCsvImportRow(row._id, 'cuota_actual', e.target.value)} placeholder="auto" /> : (row.cuota_actual || 'auto')}</td>
                            <td>{row._editing ? <input type="number" min="1" step="1" value={row.cantidad_cuotas || ''} onChange={(e) => updateCsvImportRow(row._id, 'cantidad_cuotas', e.target.value)} /> : row.cantidad_cuotas}</td>
                            <td>{row._editing ? (
                              <select value={row.modo_carga || 'total'} onChange={(e) => updateCsvImportRow(row._id, 'modo_carga', e.target.value)}>
                                <option value="total">total</option>
                                <option value="cuota">cuota</option>
                              </select>
                            ) : row.modo_carga}</td>
                            <td>{row._editing ? <input inputMode="decimal" value={row.monto_total || ''} onChange={(e) => updateCsvImportRow(row._id, 'monto_total', e.target.value)} placeholder="0,00" /> : row.monto_total}</td>
                            <td>{row._editing ? <input inputMode="decimal" value={row.monto_cuota || ''} onChange={(e) => updateCsvImportRow(row._id, 'monto_cuota', e.target.value)} placeholder="0,00" /> : row.monto_cuota}</td>
                            <td>
                              <span className="pill">{validation.assignedCycle ? formatCycleLabel(validation.assignedCycle) : '-'}</span>
                              {validation.pasaAlProximo && <small className="tarjeta-csv-next-badge">Pasa al proximo resumen</small>}
                              {validation.willCreateSummary && (
                                <small>
                                  Se creara con cierre {formatDate(validation.nextSummaryDefaults?.fecha_cierre)}
                                </small>
                              )}
                            </td>
                            <td>
                              {row._editing && (
                                <div className="tarjeta-csv-row-extra">
                                  <input placeholder="Titular" value={row.titular || ''} onChange={(e) => updateCsvImportRow(row._id, 'titular', e.target.value)} />
                                  <input placeholder="Observaciones" value={row.observaciones || ''} onChange={(e) => updateCsvImportRow(row._id, 'observaciones', e.target.value)} />
                                </div>
                              )}
                              <div className="acciones-inline">
                                <button className="btn-inline secondary" type="button" onClick={() => toggleCsvImportRowEdit(row._id)}>{row._editing ? 'OK' : 'Editar'}</button>
                                <button className="btn-inline secondary" type="button" onClick={() => toggleCsvImportRowIgnored(row._id)}>{row._ignored ? 'Restaurar' : 'Ignorar'}</button>
                                <button className="btn-inline danger" type="button" onClick={() => deleteCsvImportRow(row._id)}>Eliminar</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {csvHasInvalidRows && (
                    <p className="tarjeta-csv-error">Hay filas invalidas sin ignorar. Corregilas o ignoralas para continuar.</p>
                  )}
                </div>
              ) : (
                <div className="tarjeta-csv-confirm">
                  <div><span>Filas a importar</span><strong>{csvImportStats.toImport}</strong></div>
                  <div><span>Filas ignoradas</span><strong>{csvImportStats.ignored}</strong></div>
                  <div><span>Filas invalidas</span><strong>{csvImportStats.invalid}</strong></div>
                  <div><span>Estimado resumen ARS</span><strong>{formatMoney(csvImportStats.totalArs)}</strong></div>
                  <div><span>Estimado resumen USD</span><strong>{formatUsd(csvImportStats.totalUsd)}</strong></div>
                </div>
              )}
            </div>
            <div className="confirm-actions tarjeta-csv-actions">
              <button className="btn-inline secondary" type="button" onClick={closeCsvImportModal}>
                Cancelar
              </button>
              {csvImportStep > 1 && (
                <button className="btn-inline secondary" type="button" onClick={() => setCsvImportStep(csvImportStep === 2 ? 1 : 2)}>
                  {csvImportStep === 2 ? 'Volver' : 'Volver a revisar'}
                </button>
              )}
              {csvImportStep < csvImportSteps.length ? (
                <button className="btn-inline" type="button" onClick={() => setCsvImportStep((step) => Math.min(csvImportSteps.length, step + 1))} disabled={!csvCanContinue}>
                  Continuar
                </button>
              ) : (
                <button className="btn-inline btn-with-spinner" type="button" onClick={handleConfirmCsvImport} disabled={loading || csvImportStats.toImport === 0}>
                  {loadingAction === 'csv-import' && <span className="btn-spinner" aria-hidden="true" />}
                  {loadingAction === 'csv-import' ? 'Importando...' : 'Confirmar importacion'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      ) : vistaTarjeta === 'historial' ? (
        <>
      <section className="panel tarjeta-history tarjeta-section-card tarjeta-section-history">
        <div className="panel-header">
          <div>
            <h2>Historial de resumenes</h2>
            <p>{historialResumenes.length} recientes.</p>
          </div>
        </div>
        <div className="tarjeta-table-wrap">
          <table className="tarjeta-table tarjeta-history-table">
            <thead>
              <tr>
                <th>Ciclo/resumen</th>
                <th>Cierre</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th>Total ARS</th>
                <th>Total USD</th>
                <th>Consumos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {historialResumenes.map((item) => (
                <tr key={item.id} className={item.ciclo === selectedCiclo ? 'is-selected' : ''}>
                  <td>
                    <strong>{formatCycleLabel(item.ciclo)}</strong>
                    {item.ciclo === selectedCiclo && <small>Seleccionado</small>}
                  </td>
                  <td>{formatDate(item.fecha_cierre)}</td>
                  <td>{formatDate(item.fecha_vencimiento)}</td>
                  <td>
                    <span className={`tarjeta-history-status ${item.estado === 'cerrado' ? 'cerrado' : 'abierto'}`}>
                      {item.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}
                    </span>
                  </td>
                  <td>{formatMoney(item.total_ars)}</td>
                  <td>USD {Number(item.total_usd || 0).toLocaleString('es-AR', moneyFormat)}</td>
                  <td>{Number(item.consumos || 0)}</td>
                  <td>
                    <div className="acciones-inline tarjeta-history-actions">
                      <button type="button" className="btn-inline secondary" onClick={() => handleVerResumen(item.ciclo)}>
                        Ver
                      </button>
                      <button type="button" className="btn-inline secondary" onClick={() => handleEditarResumen(item)}>
                        Editar
                      </button>
                      <button type="button" className="btn-inline btn-with-spinner" onClick={() => handleToggleResumenHistorial(item)} disabled={loading}>
                        {loadingAction === 'historial-cierre' && <span className="btn-spinner" aria-hidden="true" />}
                        {loadingAction === 'historial-cierre' ? '...' : item.estado === 'cerrado' ? 'Reabrir' : 'Cerrar'}
                      </button>
                      {item.estado === 'cerrado' && (
                        <button type="button" className="btn-inline secondary btn-with-spinner" onClick={() => handleGenerarMovimientoResumen(item)} disabled={loading || Number(item.total_ars || 0) <= 0}>
                          {loadingAction === `movimiento-resumen-${item.id}` && <span className="btn-spinner" aria-hidden="true" />}
                          {loadingAction === `movimiento-resumen-${item.id}` ? '...' : 'Generar egreso'}
                        </button>
                      )}
                      {movimientoResumenGenerado?.cierreId === item.id && (
                        <button type="button" className="btn-inline secondary" onClick={() => onVerMovimientoGenerado?.(movimientoResumenGenerado)}>
                          Ver movimiento
                        </button>
                      )}
                    </div>
                    {movimientoResumenAviso?.cierreId === item.id && <small className="tarjeta-summary-warning">Ya existe un movimiento similar.</small>}
                  </td>
                </tr>
              ))}
              {historialResumenes.length === 0 && (
                <tr>
                  <td colSpan="8">Sin resumenes disponibles.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
        </>
      ) : (
        <>
      <section className="panel tarjeta-analisis-resumen tarjeta-section-card tarjeta-section-analysis">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Analisis</p>
            <h2>Analisis del resumen actual</h2>
            <p>Composicion, tendencia y comparacion contra resumenes anteriores.</p>
            <small className="tarjeta-analysis-context">
              Resumen analizado: {formatCycleLabel(analisisTarjeta?.ciclo_punta || selectedCiclo)}
              {analisisTarjeta?.ultimo_cerrado ? ` | ultimo cerrado: ${formatCycleLabel(analisisTarjeta.ultimo_cerrado)}` : ''}
            </small>
          </div>
          <em className={`tarjeta-analysis-status ${analysisStatus.tone}`}>
            {analysisStatus.label}
          </em>
          <em className={`tarjeta-analysis-status confidence-${tarjetaAnalysisConfidence.nivel}`}>
            {tarjetaAnalysisConfidence.label}
          </em>
        </div>
        <div className="tarjeta-analysis-grid">
          <article>
            <span>Total ARS del resumen</span>
            <strong>{formatMoney(analisisActual.total_ars || 0)}</strong>
            <small>Promedio previo {formatMoney(analisisTarjeta?.promedio_ars || 0)}</small>
          </article>
          <article>
            <span>Variacion ARS</span>
            <strong>{formatPercent(analisisTarjeta?.variacion_total_ars)}</strong>
            <small>Contra promedio de resumenes previos</small>
          </article>
          <article>
            <span>Suscripciones</span>
            <strong>{formatMoney(analisisActual.suscripciones_ars || 0)}</strong>
            <small>{formatUsd(analisisActual.suscripciones_usd || 0)} | {Math.round(analisisTarjeta?.participacion_suscripciones_ars || 0)}% ARS</small>
          </article>
          <article>
            <span>Cuotas</span>
            <strong>{formatMoney(analisisActual.cuotas_ars || 0)}</strong>
            <small>{formatUsd(analisisActual.cuotas_usd || 0)} | {Math.round(analisisTarjeta?.participacion_cuotas_ars || 0)}% ARS</small>
          </article>
          <article>
            <span>Total USD del resumen</span>
            <strong>{formatUsd(analisisActual.total_usd || 0)}</strong>
            <small>Promedio previo {formatUsd(analisisTarjeta?.promedio_usd || 0)}</small>
          </article>
          <article>
            <span>Variacion USD</span>
            <strong>{formatPercent(analisisTarjeta?.variacion_total_usd)}</strong>
            <small>Contra promedio de resumenes previos</small>
          </article>
          <article>
            <span>Categoria dominante</span>
            <strong>{categoriaPrincipalAnalisis?.categoria || 'Sin datos'}</strong>
            <small>{Math.round(analisisTarjeta?.participacion_categoria_principal || 0)}% del ARS</small>
          </article>
        </div>
        <div className="tarjeta-analysis-grid compact">
          <article>
            <span>Concentracion top 3 ARS</span>
            <strong>{Math.round(analisisCategorias.concentracionTop3Ars || 0)}%</strong>
            <small>{analisisCategorias.concentracionTop3Ars >= 70 ? 'Gasto muy concentrado' : 'Distribucion controlable'}</small>
          </article>
          <article>
            <span>Concentracion top 3 USD</span>
            <strong>{Math.round(analisisCategorias.concentracionTop3Usd || 0)}%</strong>
            <small>{analisisCategorias.concentracionTop3Usd >= 70 ? 'Dolares concentrados' : 'Sin concentracion fuerte'}</small>
          </article>
          <article>
            <span>Categorias activas</span>
            <strong>{analisisCategorias.distribucion.length}</strong>
            <small>En la punta analizada</small>
          </article>
        </div>
        <div className="tarjeta-analysis-block tarjeta-main-reading">
          <h3>Lectura principal</h3>
          {tarjetaAnalysisConfidence.isLow && (
            <p>Comparacion orientativa. {tarjetaAnalysisConfidence.note}</p>
          )}
          {lecturaPrincipal.map((line) => <p key={line}>{line}</p>)}
        </div>
        <div className="tarjeta-analysis-block tarjeta-category-distribution">
          <h3>Distribucion del resumen seleccionado por categoria</h3>
          <div className="tarjeta-category-bars">
            {analisisCategorias.distribucion.slice(0, 8).map((item) => (
              <div className="tarjeta-category-bar-row" key={item.categoria}>
                <div>
                  <strong>{item.categoria}</strong>
                  <small>{item.consumos} consumos</small>
                </div>
                <div className="tarjeta-category-bar-values">
                  <span>{formatMoney(item.ars)}</span>
                  <em style={{ width: `${Math.max(4, item.arsPct)}%` }} />
                  <small>{Math.round(item.arsPct)}%</small>
                </div>
                <div className="tarjeta-category-bar-values usd">
                  <span>{formatUsd(item.usd)}</span>
                  <em style={{ width: `${Math.max(4, item.usdPct)}%` }} />
                  <small>{Math.round(item.usdPct)}%</small>
                </div>
              </div>
            ))}
            {analisisCategorias.distribucion.length === 0 && <p className="empty-state">Sin consumos categorizados.</p>}
          </div>
        </div>
        <div className="tarjeta-analysis-block tarjeta-category-curve">
          <div className="tarjeta-curve-header">
            <div>
              <h3>Evolucion personalizada por categoria</h3>
              <p>
                Desde {formatCycleLabel(analisisTarjeta?.ciclo_base_abierto || selectedCiclo)} hacia atras.
              </p>
            </div>
            <div className="tarjeta-curve-controls">
              <label>
                Periodos
                <input
                  type="range"
                  min="6"
                  max="12"
                  value={analysisPeriodCount}
                  onChange={(e) => setAnalysisPeriodCount(Number(e.target.value))}
                />
                <strong>{analysisPeriodCount}</strong>
              </label>
              <div className="tarjeta-curve-currency" aria-label="Moneda del grafico">
                {['ARS', 'USD'].map((currency) => (
                  <button
                    key={currency}
                    type="button"
                    className={analysisCurveCurrency === currency ? 'active' : ''}
                    onClick={() => setAnalysisCurveCurrency(currency)}
                  >
                    {currency}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="tarjeta-category-picker">
            {analysisCategoryOptions.map((category) => {
              const active = selectedAnalysisCategories.includes(category);
              const disabled = !active && selectedAnalysisCategories.length >= 6;
              const color = analysisCategoryColorMap[category];
              return (
                <button
                  key={category}
                  type="button"
                  className={active ? 'active' : ''}
                  disabled={disabled}
                  style={{ '--category-color': color }}
                  onClick={() => toggleAnalysisCategory(category)}
                >
                  <i aria-hidden="true" />
                  {category}
                </button>
              );
            })}
            {analysisCategoryOptions.length === 0 && <p className="empty-state">Sin categorias para comparar.</p>}
          </div>
          <div className="tarjeta-category-curve-chart">
            <svg viewBox="0 0 920 250" role="img" aria-label="Evolucion de categorias seleccionadas">
              {(analysisCurveCurrency === 'USD' ? categoryCurveData.yTicksUsd : categoryCurveData.yTicksArs).map((value, index) => {
                const y = 38 + index * 76;
                return (
                  <g key={`${analysisCurveCurrency}-${value}-${index}`}>
                    <line x1="76" x2="880" y1={y} y2={y} />
                    <text className="axis-label" x="66" y={y + 4}>
                      {formatAxisMoney(value, analysisCurveCurrency)}
                    </text>
                  </g>
                );
              })}
              {categoryCurveData.visibleSerie.map((cycle, index) => {
                const x = 76 + (index * (804 / Math.max(categoryCurveData.visibleSerie.length - 1, 1)));
                return (
                  <g key={cycle.ciclo}>
                    <line className="period-line" x1={x} x2={x} y1="28" y2="190" />
                    <text x={x} y="224">{formatCycleLabel(cycle.ciclo).slice(0, 3)}</text>
                  </g>
                );
              })}
              {selectedAnalysisCategories.map((category) => {
                const color = analysisCategoryColorMap[category];
                const maxValue = analysisCurveCurrency === 'USD' ? categoryCurveData.maxUsd : categoryCurveData.maxArs;
                const points = categoryCurveData.visibleSerie.map((cycle, index) => {
                  const found = (cycle.categorias || []).find((entry) => entry.categoria === category) || {};
                  const value = Number(analysisCurveCurrency === 'USD' ? found.total_usd : found.total_ars) || 0;
                  const x = 76 + (index * (804 / Math.max(categoryCurveData.visibleSerie.length - 1, 1)));
                  const y = 190 - ((value / Math.max(maxValue, 1)) * 150);
                  return { x, y, value, cycle: cycle.ciclo };
                });
                return (
                  <g key={category}>
                    <path d={buildSmoothPath(points)} stroke={color} />
                    {points.map((point) => (
                      <circle key={`${category}-${point.cycle}`} cx={point.x} cy={point.y} r="3" fill={color}>
                        <title>{category} - {formatCycleLabel(point.cycle)}: {analysisCurveCurrency === 'USD' ? formatUsd(point.value) : formatMoney(point.value)}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="tarjeta-category-curve-legend">
            {selectedAnalysisCategories.map((category) => (
              <span key={category} style={{ '--curve-color': analysisCategoryColorMap[category] }}>
                {category}
              </span>
            ))}
          </div>
        </div>
        <div className="tarjeta-analysis-block tarjeta-cycle-chart">
          <h3>Evolucion por resumen: importe que impacta en cada ciclo</h3>
          <div className="tarjeta-cycle-table">
            <div className="tarjeta-cycle-table-head">
              <span>Ciclo</span>
              <span>Total ARS</span>
              <span>Total USD</span>
              <span>Vs anterior</span>
            </div>
            {cycleEvolutionRows.map((item) => (
              <div className="tarjeta-cycle-table-row" key={item.ciclo}>
                <strong>{formatCycleLabel(item.ciclo)}</strong>
                <span>{formatMoney(item.total_ars || 0)}</span>
                <span>{formatUsd(item.total_usd || 0)}</span>
                {item.deltaArs == null ? (
                  <em>Sin anterior</em>
                ) : (
                  <em className={getImpactTone(item.deltaArs)}>
                    ARS {formatSignedMoney(item.deltaArs, formatMoney)} / {formatSignedUsd(item.deltaUsd)}
                  </em>
                )}
              </div>
            ))}
          </div>
        </div>
        {showCategoryTrendTable && (
          <div className="tarjeta-analysis-block tarjeta-category-heatmap">
            <h3>Tendencia ARS de categorias principales</h3>
            <div className="tarjeta-category-heatmap-grid">
              <div className="tarjeta-category-heatmap-head">
                <span>Categoria</span>
                {analisisCategorias.serie.map((item) => <span key={item.ciclo}>{formatCycleLabel(item.ciclo).slice(0, 3)}</span>)}
              </div>
              {analisisCategorias.topCategorias.map((categoria) => (
                <div className="tarjeta-category-heatmap-row" key={categoria.categoria}>
                  <strong>{categoria.categoria}</strong>
                  {analisisCategorias.serie.map((item) => {
                    const found = (item.categorias || []).find((entry) => entry.categoria === categoria.categoria) || {};
                    const value = Number(found.total_ars || 0);
                    return (
                      <span
                        key={`${categoria.categoria}-${item.ciclo}`}
                        className={value > 0 ? 'has-value' : ''}
                        title={`${formatCycleLabel(item.ciclo)}: ${formatMoney(value)}`}
                      >
                        {formatMoney(value)}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="tarjeta-analysis-layout">
          <div className="tarjeta-analysis-block">
            <h3>Que cambio</h3>
            <div className="tarjeta-change-list">
              {topCategoryChanges.map((item) => (
                <div className={`tarjeta-change-row ${getImpactTone(item.diferencia_ars)}`} key={item.categoria}>
                  <strong>{describeCategoryChange(item, formatMoney)}</strong>
                  <small>Actual {formatMoney(item.actual_ars || 0)} | Promedio {formatMoney(item.promedio_ars || 0)}</small>
                </div>
              ))}
              {topCategoryChanges.length === 0 && <p className="empty-state">Sin cambios comparables.</p>}
            </div>
          </div>
          <div className="tarjeta-analysis-block">
            <h3>Categorias con impacto</h3>
            <div className="tarjeta-category-impact">
              {categoriasImpactoVisibles.map((item) => (
                <div className="tarjeta-category-row" key={item.categoria}>
                  <div>
                    <strong>{item.categoria}</strong>
                    <small>ARS: {describeCurrencyImpact(item, 'ars', formatMoney)}</small>
                    <small>USD: {describeCurrencyImpact(item, 'usd', formatUsd)}</small>
                  </div>
                  <span className={item.diferencia_ars > 0 ? 'warning' : item.diferencia_ars < 0 ? 'positive' : 'muted'}>
                    ARS {formatSignedMoney(item.diferencia_ars || 0, formatMoney)} / {formatSignedUsd(item.diferencia_usd || 0)}
                  </span>
                </div>
              ))}
              {categoriasComparadasAnalisis.length === 0 && (
                <p className="empty-state">Sin categorias comparables.</p>
              )}
            </div>
            {categoriasComparadasAnalisis.length > 3 && (
              <button type="button" className="btn-inline secondary tarjeta-impact-more" onClick={() => setShowAllCategoryImpacts((value) => !value)}>
                {showAllCategoryImpacts ? 'Ver menos' : 'Ver mas'}
              </button>
            )}
          </div>
        </div>
      </section>
        </>
      )}
    </section>
  );
}
