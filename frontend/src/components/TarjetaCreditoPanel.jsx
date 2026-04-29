import { useEffect, useMemo, useState } from 'react';
import { createConsumoTarjeta, deleteConsumoTarjeta, getTarjetasCredito, updateCierreTarjeta, updateConsumoTarjeta } from '../services/api.js';
import MonthPicker from './MonthPicker.jsx';

const moneyFormat = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

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

function parseAmount(value) {
  const raw = String(value ?? '').trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return Number(normalized);
}

function calcularMontosPorModo(form, source) {
  const next = { ...form };
  const cuotas = Math.max(Number(next.cantidad_cuotas || 1), 1);

  if (source === 'total') {
    const total = parseAmount(next.monto_total);
    if (total > 0 && cuotas > 0) next.monto_cuota = (total / cuotas).toFixed(2);
  }

  if (source === 'cuota') {
    const cuota = parseAmount(next.monto_cuota);
    if (cuota > 0 && cuotas > 0) next.monto_total = (cuota * cuotas).toFixed(2);
  }

  return next;
}

function addMonthsToCycle(ciclo, offset) {
  if (!ciclo) return '';
  const [yearText, monthText] = String(ciclo).split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function TarjetaCreditoPanel({ hogarId, ciclo = '', categorias = [], formatMoney, onToast }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [cierre, setCierre] = useState(null);
  const [selectedCiclo, setSelectedCiclo] = useState(ciclo);
  const [cierreForm, setCierreForm] = useState({ fecha_cierre: '', fecha_vencimiento: '' });
  const [savedCierreForm, setSavedCierreForm] = useState({ fecha_cierre: '', fecha_vencimiento: '' });
  const [resumen, setResumen] = useState({ total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 });
  const [historialResumenes, setHistorialResumenes] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [filters, setFilters] = useState({ ciclo: '', categoria: '', moneda: '', cuotas: '', texto: '' });
  const [calcSource, setCalcSource] = useState('total');
  const [vistaTarjeta, setVistaTarjeta] = useState('principal');
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState('');
  const [error, setError] = useState('');

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
      const cuotas = Number(item.cantidad_cuotas || 1);
      const cuotaInicial = Number(item.cuota_inicial || 1);
      if (cuotas <= 1) return;

      const pendientes = Math.max(cuotas - cuotaInicial, 0);
      for (let index = 1; index <= pendientes; index += 1) {
        const futureCycle = addMonthsToCycle(item.ciclo_asignado, index);
        if (!byCycle.has(futureCycle)) {
          byCycle.set(futureCycle, { ciclo: futureCycle, totalArs: 0, totalUsd: 0, consumos: new Set() });
        }
        const bucket = byCycle.get(futureCycle);
        if (item.moneda === 'USD') bucket.totalUsd += Number(item.monto_cuota || 0);
        else bucket.totalArs += Number(item.monto_cuota || 0);
        bucket.consumos.add(item.id);
      }
    });

    return Array.from(byCycle.values())
      .map((item) => ({ ...item, cantidadConsumos: item.consumos.size }))
      .sort((a, b) => String(a.ciclo).localeCompare(String(b.ciclo)));
  }, [consumos]);
  const previewCicloAsignado = useMemo(() => {
    if (!form.fecha_compra || !savedCierreForm.fecha_cierre) return selectedCiclo;
    return form.fecha_compra <= savedCierreForm.fecha_cierre ? selectedCiclo : addMonthsToCycle(selectedCiclo, 1);
  }, [form.fecha_compra, savedCierreForm.fecha_cierre, selectedCiclo]);
  const previewPasaAlSiguiente = previewCicloAsignado !== selectedCiclo;
  const consumoAsignadoAResumenCerrado = resumenSeleccionadoCerrado && previewCicloAsignado === selectedCiclo;
  const resumenAnalisis = useMemo(() => {
    const actuales = consumos.filter((item) => item.ciclo_asignado === selectedCiclo);
    const categorias = new Map();
    let totalArs = 0;
    let totalUsd = 0;
    let totalCuotas = 0;
    let totalUnPago = 0;
    let consumoMayor = null;

    actuales.forEach((item) => {
      const monto = Number(item.monto_total || 0);
      const categoria = item.categoria || 'Sin categoria';
      categorias.set(categoria, (categorias.get(categoria) || 0) + monto);
      if (item.moneda === 'USD') totalUsd += monto;
      else totalArs += monto;
      if (Number(item.cantidad_cuotas || 1) > 1) totalCuotas += monto;
      else totalUnPago += monto;
      if (!consumoMayor || monto > Number(consumoMayor.monto_total || 0)) consumoMayor = item;
    });

    const categoriaPrincipal = Array.from(categorias.entries())
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total)[0] || null;
    const baseCuotas = totalCuotas + totalUnPago;

    return {
      totalArs,
      totalUsd,
      categoriaPrincipal,
      consumoMayor,
      porcentajeCuotas: baseCuotas > 0 ? Math.round((totalCuotas / baseCuotas) * 100) : 0,
      cantidadConsumos: actuales.length,
      nuevosConsumosCuotas: actuales.filter((item) => Number(item.cantidad_cuotas || 1) > 1).length
    };
  }, [consumos, selectedCiclo]);

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
    setResumen(data.resumen || { total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 });
    setHistorialResumenes(data.historial_resumenes || []);
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
    cargarTarjetas().catch((err) => setError(err.message));
  }, [hogarId, selectedCiclo]);

  const handleTarjetaChange = (value) => {
    setForm((prev) => ({ ...prev, tarjeta_id: value }));
    cargarTarjetas(value, selectedCiclo).catch((err) => setError(err.message));
  };

  const handleCicloChange = (value) => {
    setSelectedCiclo(value);
    setFilters((prev) => ({ ...prev, ciclo: value }));
  };

  const handleCierreFieldChange = async (field, value) => {
    setCierreForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGuardarCierre = async () => {
    if (!cierre?.id || cierre?.estado === 'cerrado' || !cierreForm.fecha_cierre) return;
    setLoading(true);
    setLoadingAction('cierre-form');
    setError('');

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
      setError(err.message);
      onToast?.({ type: 'error', message: err.message || 'No se pudo guardar el resumen.' });
    } finally {
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
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
    setLoading(true);
    setLoadingAction('consumo');
    setError('');

    try {
      const payload = {
        tarjeta_id: Number(form.tarjeta_id),
        ciclo_actual: selectedCiclo,
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
      await cargarTarjetas();
      onToast?.({ message: editingId ? 'Consumo actualizado.' : 'Consumo guardado.' });
    } catch (err) {
      setError(err.message);
      onToast?.({ type: 'error', message: err.message || 'No se pudo guardar el consumo.' });
    } finally {
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleEdit = (consumo) => {
    if (resumenSeleccionadoCerrado && consumo.ciclo_asignado === selectedCiclo) return;
    setEditingId(consumo.id);
    setForm({
      fecha_compra: String(consumo.fecha_compra || '').slice(0, 10),
      descripcion: consumo.descripcion || '',
      categoria: consumo.categoria || '',
      moneda: consumo.moneda || 'ARS',
      monto_total: String(consumo.monto_total || ''),
      cantidad_cuotas: String(consumo.cantidad_cuotas || 1),
      monto_cuota: String(consumo.monto_cuota || ''),
      tarjeta_id: String(consumo.tarjeta_id || tarjetaActual?.id || ''),
      titular: consumo.titular || '',
      observaciones: consumo.observaciones || ''
    });
    setCalcSource('total');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm((prev) => ({ ...initialForm, fecha_compra: prev.fecha_compra, tarjeta_id: prev.tarjeta_id }));
  };

  const handleDelete = async (consumo) => {
    if (resumenSeleccionadoCerrado && consumo.ciclo_asignado === selectedCiclo) return;
    if (!window.confirm(`Eliminar consumo "${consumo.descripcion}"?`)) return;
    setLoading(true);
    setLoadingAction('delete-consumo');
    setError('');
    try {
      await deleteConsumoTarjeta(consumo.id);
      await cargarTarjetas();
      onToast?.({ message: 'Consumo eliminado.' });
    } catch (err) {
      setError(err.message);
      onToast?.({ type: 'error', message: err.message || 'No se pudo eliminar el consumo.' });
    } finally {
      setLoading(false);
      setLoadingAction('');
    }
  };
  const handleToggleCierre = async () => {
    if (!cierre?.id) return;
    setLoading(true);
    setLoadingAction('toggle-cierre');
    setError('');
    try {
      const siguienteEstado = cierre.estado === 'cerrado' ? 'abierto' : 'cerrado';
      await updateCierreTarjeta(cierre.id, { estado: cierre.estado === 'cerrado' ? 'abierto' : 'cerrado' });
      await cargarTarjetas();
      onToast?.({ message: siguienteEstado === 'cerrado' ? 'Resumen cerrado.' : 'Resumen reabierto.' });
    } catch (err) {
      setError(err.message);
      onToast?.({ type: 'error', message: err.message || 'No se pudo cambiar el estado del resumen.' });
    } finally {
      setLoading(false);
      setLoadingAction('');
    }
  };

  const handleVerResumen = (cicloResumen) => {
    if (!cicloResumen) return;
    setDetailItem(null);
    setEditingId(null);
    handleCicloChange(cicloResumen);
    setVistaTarjeta('principal');
  };

  const handleEditarResumen = (item) => {
    handleVerResumen(item.ciclo);
  };

  const handleToggleResumenHistorial = async (item) => {
    if (!item?.id) return;
    setLoading(true);
    setLoadingAction('historial-cierre');
    setError('');
    try {
      const siguienteEstado = item.estado === 'cerrado' ? 'abierto' : 'cerrado';
      await updateCierreTarjeta(item.id, { estado: siguienteEstado });
      await cargarTarjetas(form.tarjeta_id, selectedCiclo);
      onToast?.({ message: siguienteEstado === 'cerrado' ? 'Resumen cerrado.' : 'Resumen reabierto.' });
    } catch (err) {
      setError(err.message);
      onToast?.({ type: 'error', message: err.message || 'No se pudo cambiar el estado del resumen.' });
    } finally {
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

  return (
    <section className="tarjeta-panel">
      <div className="panel tarjeta-hero">
        <div>
          <p className="eyebrow">Tarjeta de credito</p>
          <h2>{vistaTarjeta === 'principal' ? 'Consumo actual' : 'Historial y analisis'}</h2>
          <p>
            {vistaTarjeta === 'principal'
              ? `${tarjetaActual?.nombre || 'Tarjeta principal'} - resumen en curso y cuotas futuras.`
              : 'Resumenes anteriores y analisis del ciclo seleccionado.'}
          </p>
        </div>
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
            className={vistaTarjeta === 'secundaria' ? 'active' : ''}
            aria-pressed={vistaTarjeta === 'secundaria'}
            onClick={() => setVistaTarjeta('secundaria')}
          >
            Historial y analisis
          </button>
        </div>
      </div>

      {vistaTarjeta === 'principal' ? (
        <>
      <div className="tarjeta-screen-indicator">
        <span>Pantalla activa</span>
        <strong>Resumen en curso, consumos y cuotas futuras</strong>
      </div>

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
        <div className="tarjeta-current-grid">
          <label>
            Tarjeta seleccionada
            <select value={form.tarjeta_id} onChange={(e) => handleTarjetaChange(e.target.value)}>
              {tarjetas.map((tarjeta) => (
                <option key={tarjeta.id} value={tarjeta.id}>{tarjeta.nombre}</option>
              ))}
            </select>
          </label>
          <MonthPicker
            label="Ciclo / resumen actual"
            value={selectedCiclo}
            onChange={handleCicloChange}
            className="tarjeta-cycle-picker"
          />
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
              className="btn-inline tarjeta-save-config"
              onClick={handleGuardarCierre}
              disabled={loading || !cierre?.id || resumenSeleccionadoCerrado || !cierreTieneCambios || !cierreForm.fecha_cierre}
            >
              Guardar configuracion del resumen
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
        <section className="panel tarjeta-closed-summary">
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
        </section>
      )}

      <section className="panel panel-form tarjeta-form-panel tarjeta-section-card tarjeta-section-form">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Paso 2</p>
            <h2>{editingId ? 'Editar consumo' : 'Nuevo consumo'}</h2>
            <p>Alta rapida de tarjeta.</p>
          </div>
          <span className={`tarjeta-assignment-preview ${previewPasaAlSiguiente ? 'next' : ''}`} aria-live="polite">
            {previewPasaAlSiguiente ? 'Pasa a ' : 'Resumen '}
            <strong>{formatCycleLabel(previewCicloAsignado)}</strong>
          </span>
        </div>
        {error && <p className="error">{error}</p>}
        <form className="form-grid tarjeta-consumo-form" onSubmit={handleSubmit}>
          <div className="tarjeta-form-group tarjeta-form-group-purchase">
            <span className="tarjeta-form-group-title">Compra</span>
            <label>
              Fecha
              <input type="date" value={form.fecha_compra} onChange={(e) => handleChange('fecha_compra', e.target.value)} required />
            </label>
            <label className="field-strong tarjeta-field-wide">
              Comercio / descripcion
              <input value={form.descripcion} onChange={(e) => handleChange('descripcion', e.target.value)} placeholder="Ej: Mercado, farmacia" required />
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
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto_total}
                onChange={(e) => handleChange('monto_total', e.target.value)}
                placeholder="0.00"
                readOnly={calcSource !== 'total'}
                required
              />
            </label>
            <label className="field-strong">
              Monto de cuota
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto_cuota}
                onChange={(e) => handleChange('monto_cuota', e.target.value)}
                placeholder="0.00"
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
                <th>Resumen asignado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {consumosFiltrados.map((consumo) => (
                <tr key={consumo.id}>
                  <td>{String(consumo.fecha_compra).slice(0, 10)}</td>
                  <td>{consumo.descripcion}</td>
                  <td>{consumo.categoria || 'Sin categoria'}</td>
                  <td>{consumo.moneda}</td>
                  <td>{consumo.moneda === 'USD' ? `US$ ${Number(consumo.monto_total).toLocaleString('es-AR', moneyFormat)}` : formatMoney(consumo.monto_total)}</td>
                  <td>{Number(consumo.cantidad_cuotas || 1) > 1 ? `${consumo.cantidad_cuotas} cuotas` : '1 cuota'}</td>
                  <td>{consumo.moneda === 'USD' ? `US$ ${Number(consumo.monto_cuota).toLocaleString('es-AR', moneyFormat)}` : formatMoney(consumo.monto_cuota)}</td>
                  <td>
                    <span className="pill">{formatCycleLabel(consumo.ciclo_asignado)}</span>
                    <small>{consumo.resumen_relativo === 'actual' ? 'Actual' : 'Siguiente'}</small>
                  </td>
                  <td>
                    <div className="acciones-inline">
                      <button className="icon-btn" type="button" onClick={() => setDetailItem(consumo)} title="Ver detalle">i</button>
                      <button className="icon-btn" type="button" onClick={() => handleEdit(consumo)} title="Editar">✎</button>
                      <button className="icon-btn danger" type="button" onClick={() => handleDelete(consumo)} title="Eliminar">×</button>
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
        ) : (
          <p className="empty-state">Sin cuotas futuras.</p>
        )}
      </section>
        </>
      ) : (
        <>
      <section className="panel tarjeta-secondary-screen tarjeta-section-card tarjeta-section-history">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Pantalla activa</p>
            <h2>Historial y analisis</h2>
            <p>Resumenes anteriores y lectura del ciclo seleccionado.</p>
          </div>
          <span className="tarjeta-screen-pill">Vista secundaria</span>
        </div>
      </section>

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
                    </div>
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

      <section className="panel tarjeta-analisis-resumen tarjeta-section-card tarjeta-section-analysis">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Analisis</p>
            <h2>Analisis del resumen</h2>
            <p>Lectura del ciclo seleccionado.</p>
          </div>
        </div>
        <div className="tarjeta-analysis-grid">
          <article>
            <span>Total ARS</span>
            <strong>{formatMoney(resumenAnalisis.totalArs)}</strong>
          </article>
          <article>
            <span>Total USD</span>
            <strong>USD {Number(resumenAnalisis.totalUsd || 0).toLocaleString('es-AR', moneyFormat)}</strong>
          </article>
          <article>
            <span>Cantidad de consumos</span>
            <strong>{resumenAnalisis.cantidadConsumos}</strong>
          </article>
          <article>
            <span>Nuevos consumos en cuotas</span>
            <strong>{resumenAnalisis.nuevosConsumosCuotas}</strong>
          </article>
        </div>
        <div className="tarjeta-insights-list">
          <p>
            La categoria principal es {resumenAnalisis.categoriaPrincipal?.categoria || 'sin datos'} con{' '}
            {formatMoney(resumenAnalisis.categoriaPrincipal?.total || 0)}.
          </p>
          <p>
            El consumo mas alto fue {resumenAnalisis.consumoMayor?.descripcion || 'sin datos'}.
          </p>
          <p>
            El {resumenAnalisis.porcentajeCuotas}% del resumen corresponde a compras en cuotas.
          </p>
        </div>
      </section>
        </>
      )}
    </section>
  );
}
