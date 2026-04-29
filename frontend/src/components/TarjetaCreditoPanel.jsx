import { useEffect, useMemo, useState } from 'react';
import { createConsumoTarjeta, deleteConsumoTarjeta, getTarjetasCredito, updateCierreTarjeta, updateConsumoTarjeta } from '../services/api.js';

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

function parseAmount(value) {
  const raw = String(value ?? '').trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return Number(normalized);
}

function addMonthsToCycle(ciclo, offset) {
  if (!ciclo) return '';
  const [yearText, monthText] = String(ciclo).split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function TarjetaCreditoPanel({ hogarId, ciclo = '', categorias = [], formatMoney }) {
  const [tarjetas, setTarjetas] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [cierre, setCierre] = useState(null);
  const [cierreForm, setCierreForm] = useState({ fecha_cierre: '', fecha_vencimiento: '' });
  const [resumen, setResumen] = useState({ total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 });
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [filters, setFilters] = useState({ ciclo: '', categoria: '', moneda: '', cuotas: '', texto: '' });
  const [calcSource, setCalcSource] = useState('total');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tarjetaActual = tarjetas.find((tarjeta) => Number(tarjeta.id) === Number(form.tarjeta_id)) || tarjetas[0];
  const categoriasEgreso = useMemo(
    () => categorias.filter((categoria) => categoria.tipo_movimiento === 'egreso' || Number(categoria.tipo_movimiento_id) === 2),
    [categorias]
  );
  const ciclosDisponibles = useMemo(
    () => Array.from(new Set(consumos.map((item) => item.ciclo_asignado).filter(Boolean))).sort().reverse(),
    [consumos]
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
    if (!form.fecha_compra || !cierreForm.fecha_cierre) return ciclo;
    return form.fecha_compra <= cierreForm.fecha_cierre ? ciclo : addMonthsToCycle(ciclo, 1);
  }, [form.fecha_compra, cierreForm.fecha_cierre, ciclo]);
  const resumenAnalisis = useMemo(() => {
    const actuales = consumos.filter((item) => item.ciclo_asignado === ciclo);
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
  }, [consumos, ciclo]);

  const cargarTarjetas = async (tarjetaId = form.tarjeta_id) => {
    if (!hogarId) return;
    const data = await getTarjetasCredito(hogarId, ciclo, tarjetaId);
    setTarjetas(data.tarjetas || []);
    setCierre(data.cierre || null);
    setCierreForm({
      fecha_cierre: data.cierre?.fecha_cierre ? String(data.cierre.fecha_cierre).slice(0, 10) : getClosingDateIso(ciclo),
      fecha_vencimiento: data.cierre?.fecha_vencimiento ? String(data.cierre.fecha_vencimiento).slice(0, 10) : ''
    });
    setConsumos(data.consumos || []);
    setResumen(data.resumen || { total_ars: 0, total_usd: 0, consumos: 0, cuotas_futuras: 0 });
    setForm((prev) => ({
      ...prev,
      tarjeta_id: tarjetaId ? String(tarjetaId) : prev.tarjeta_id || String(data.tarjetas?.[0]?.id || '')
    }));
  };

  useEffect(() => {
    cargarTarjetas().catch((err) => setError(err.message));
  }, [hogarId, ciclo]);

  const handleTarjetaChange = (value) => {
    setForm((prev) => ({ ...prev, tarjeta_id: value }));
    cargarTarjetas(value).catch((err) => setError(err.message));
  };

  const handleCierreFieldChange = async (field, value) => {
    const next = { ...cierreForm, [field]: value };
    setCierreForm(next);
    if (!cierre?.id || cierre?.estado === 'cerrado') return;
    if (field === 'fecha_cierre' && !value) return;

    try {
      const data = await updateCierreTarjeta(cierre.id, {
        fecha_cierre: next.fecha_cierre,
        fecha_vencimiento: next.fecha_vencimiento || null
      });
      setCierre(data.item || cierre);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChange = (field, value) => {
    const nextSource = field === 'monto_total' ? 'total' : field === 'monto_cuota' ? 'cuota' : calcSource;
    if (field === 'monto_total') setCalcSource('total');
    if (field === 'monto_cuota') setCalcSource('cuota');

    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const cuotas = Math.max(Number(next.cantidad_cuotas || 1), 1);

      if (nextSource === 'total' && (field === 'monto_total' || field === 'cantidad_cuotas')) {
        const total = parseAmount(next.monto_total);
        if (total > 0 && cuotas > 0) next.monto_cuota = (total / cuotas).toFixed(2);
      }

      if (nextSource === 'cuota' && (field === 'monto_cuota' || field === 'cantidad_cuotas')) {
        const cuota = parseAmount(next.monto_cuota);
        if (cuota > 0 && cuotas > 0) next.monto_total = (cuota * cuotas).toFixed(2);
      }

      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        tarjeta_id: Number(form.tarjeta_id),
        ciclo_actual: ciclo,
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (consumo) => {
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
    if (!window.confirm(`Eliminar consumo "${consumo.descripcion}"?`)) return;
    setLoading(true);
    setError('');
    try {
      await deleteConsumoTarjeta(consumo.id);
      await cargarTarjetas();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleToggleCierre = async () => {
    if (!cierre?.id) return;
    setLoading(true);
    setError('');
    try {
      await updateCierreTarjeta(cierre.id, { estado: cierre.estado === 'cerrado' ? 'abierto' : 'cerrado' });
      await cargarTarjetas();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          <h2>{tarjetaActual?.nombre || 'Tarjeta principal'}</h2>
          <p>Resumen separado para consumos de tarjeta, sin impacto en movimientos.</p>
        </div>
      </div>

      <section className="panel tarjeta-current-summary">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Resumen actual de tarjeta</p>
            <h2>Resumen actual de tarjeta</h2>
            <p>Los consumos se asignan automaticamente segun la fecha de compra y el cierre del resumen.</p>
          </div>
          <em className={`tarjeta-cierre-status ${cierre?.estado === 'cerrado' ? 'cerrado' : 'abierto'}`}>
            {cierre?.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}
          </em>
        </div>
        <div className="tarjeta-current-grid">
          <label>
            Tarjeta seleccionada
            <select value={form.tarjeta_id} onChange={(e) => handleTarjetaChange(e.target.value)}>
              {tarjetas.map((tarjeta) => (
                <option key={tarjeta.id} value={tarjeta.id}>{tarjeta.nombre}</option>
              ))}
            </select>
          </label>
          <label>
            Ciclo / resumen actual
            <input value={formatCycleLabel(ciclo)} readOnly />
          </label>
          <label>
            Fecha de cierre del resumen
            <input
              type="date"
              value={cierreForm.fecha_cierre}
              disabled={cierre?.estado === 'cerrado'}
              onChange={(e) => handleCierreFieldChange('fecha_cierre', e.target.value)}
            />
          </label>
          <label>
            Fecha de vencimiento
            <input
              type="date"
              value={cierreForm.fecha_vencimiento}
              disabled={cierre?.estado === 'cerrado'}
              onChange={(e) => handleCierreFieldChange('fecha_vencimiento', e.target.value)}
            />
          </label>
        </div>
        <button type="button" className="btn-inline secondary tarjeta-close-action" onClick={handleToggleCierre} disabled={loading || !cierre?.id}>
          {cierre?.estado === 'cerrado' ? 'Reabrir resumen' : 'Cerrar resumen'}
        </button>
      </section>

      <div className="tarjeta-summary-grid">
        {cards.map((card) => (
          <article className={`card tarjeta-summary-card tarjeta-${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      {cierre?.estado === 'cerrado' && (
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

      <section className="panel panel-form tarjeta-form-panel">
        <div className="panel-header">
          <h2>{editingId ? 'Editar consumo de tarjeta' : 'Nuevo consumo de tarjeta'}</h2>
          <p>Este consumo se asignara automaticamente al resumen correspondiente.</p>
        </div>
        {error && <p className="error">{error}</p>}
        <form className="form-grid tarjeta-consumo-form" onSubmit={handleSubmit}>
          <label>
            Fecha de compra
            <input type="date" value={form.fecha_compra} onChange={(e) => handleChange('fecha_compra', e.target.value)} required />
          </label>
          <label className="field-strong">
            Descripcion / comercio
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
          <label>
            Moneda
            <select value={form.moneda} onChange={(e) => handleChange('moneda', e.target.value)}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label>
            Cantidad de cuotas
            <input type="number" min="1" step="1" value={form.cantidad_cuotas} onChange={(e) => handleChange('cantidad_cuotas', e.target.value)} required />
          </label>
          <label className="field-strong">
            Monto total
            <input type="number" min="0.01" step="0.01" value={form.monto_total} onChange={(e) => handleChange('monto_total', e.target.value)} placeholder="0.00" required />
          </label>
          <label className="field-strong">
            Monto de cuota
            <input type="number" min="0.01" step="0.01" value={form.monto_cuota} onChange={(e) => handleChange('monto_cuota', e.target.value)} placeholder="0.00" required />
          </label>
          <label>
            Titular / adicional
            <input value={form.titular} onChange={(e) => handleChange('titular', e.target.value)} placeholder="Opcional" />
          </label>
          <label className="full-width movement-form-description">
            <div className="field-heading">
              <span>Observaciones</span>
              <small>Opcional</small>
            </div>
            <textarea value={form.observaciones} onChange={(e) => handleChange('observaciones', e.target.value)} rows="3" />
          </label>
          <button className="full-width movement-submit" type="submit" disabled={loading || tarjetas.length === 0}>
            {loading ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar consumo'}
          </button>
          <div className="tarjeta-assignment-preview full-width">
            Entrara en: <strong>{formatCycleLabel(previewCicloAsignado)}</strong>
          </div>
          {editingId && (
            <button className="full-width btn-inline secondary" type="button" onClick={handleCancelEdit}>
              Cancelar edicion
            </button>
          )}
        </form>
      </section>

      <section className="panel tarjeta-consumos-list">
        <div className="panel-header">
          <h2>Consumos de tarjeta</h2>
          <p>{consumosFiltrados.length} consumos visibles.</p>
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

      <section className="panel tarjeta-cuotas-futuras">
        <div className="panel-header">
          <h2>Cuotas futuras</h2>
          <p>Impacto estimado de compras en cuotas en los proximos meses.</p>
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
          <p className="empty-state">No hay cuotas futuras cargadas todavia.</p>
        )}
      </section>

      <section className="panel tarjeta-analisis-resumen">
        <div className="panel-header">
          <h2>Analisis del resumen</h2>
          <p>Lectura rapida del resumen seleccionado.</p>
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
    </section>
  );
}
