import { useEffect, useMemo, useState } from 'react';

const moneyFormat = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', moneyFormat)}`;
}

function formatUsd(value) {
  return `US$ ${Number(value || 0).toLocaleString('es-AR', moneyFormat)}`;
}

function parseMonto(value) {
  const raw = String(value ?? '').trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return Number(normalized);
}

function getDefaultDate(ciclo) {
  const today = new Date().toISOString().slice(0, 10);
  return today.startsWith(ciclo) ? today : `${ciclo || today.slice(0, 7)}-01`;
}

function buildSavingSeries(movimientos = [], ciclo = '') {
  const [anioTexto, mesTexto] = String(ciclo || '').split('-');
  const anioBase = Number(anioTexto);
  const mesBase = Number(mesTexto) - 1;

  if (!Number.isInteger(anioBase) || !Number.isInteger(mesBase)) return [];

  return Array.from({ length: 6 }, (_, index) => {
    const fecha = new Date(anioBase, mesBase - 5 + index, 1);
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const items = movimientos.filter(
      (mov) => mov.activo !== false && mov.tipo_movimiento === 'ahorro' && String(mov.fecha || '').startsWith(key)
    );

    const ars = items
      .filter((mov) => String(mov.moneda_original || 'ARS').toUpperCase() !== 'USD')
      .reduce((acc, mov) => acc + Number(mov.monto_original || mov.monto_ars || 0), 0);
    const usd = items
      .filter((mov) => String(mov.moneda_original || '').toUpperCase() === 'USD')
      .reduce((acc, mov) => acc + Number(mov.monto_original || 0), 0);
    const valorizadoArs = items.reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

    return {
      key,
      label: fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', ''),
      ars,
      usd,
      valorizadoArs
    };
  });
}

export default function AhorrosPanel({
  movimientos = [],
  movimientosHistoricos = [],
  cotizaciones = [],
  categorias = [],
  ciclo,
  loading = false,
  onCrearAhorro
}) {
  const cotizacionOficial = Number(cotizaciones[0]?.venta || 0);
  const categoriaAhorro = categorias.find((categoria) => categoria.tipo_movimiento === 'ahorro');
  const [form, setForm] = useState({
    monto: '',
    moneda: 'ARS',
    fecha: getDefaultDate(ciclo),
    descripcion: ''
  });

  useEffect(() => {
    setForm((prev) => ({ ...prev, fecha: getDefaultDate(ciclo) }));
  }, [ciclo]);

  const ahorrosCiclo = useMemo(
    () =>
      movimientos.filter(
        (mov) =>
          mov.activo !== false &&
          mov.tipo_movimiento === 'ahorro' &&
          ['registrado', 'cobrado'].includes(mov.estado_consolidado || mov.estado_ingreso || 'registrado')
      ),
    [movimientos]
  );

  const resumen = useMemo(() => {
    const ars = ahorrosCiclo
      .filter((mov) => String(mov.moneda_original || 'ARS').toUpperCase() !== 'USD')
      .reduce((acc, mov) => acc + Number(mov.monto_original || mov.monto_ars || 0), 0);
    const usd = ahorrosCiclo
      .filter((mov) => String(mov.moneda_original || '').toUpperCase() === 'USD')
      .reduce((acc, mov) => acc + Number(mov.monto_original || 0), 0);
    const valorizadoArs = ahorrosCiclo.reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);
    return { ars, usd, valorizadoArs };
  }, [ahorrosCiclo]);

  const serie = useMemo(() => buildSavingSeries(movimientosHistoricos, ciclo), [movimientosHistoricos, ciclo]);
  const maxSerie = Math.max(...serie.map((item) => item.valorizadoArs), 0);
  const montoPreview = parseMonto(form.monto);
  const valorPreviewArs =
    form.moneda === 'USD' && cotizacionOficial > 0 && Number.isFinite(montoPreview)
      ? montoPreview * cotizacionOficial
      : montoPreview;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const monto = parseMonto(form.monto);
    if (!monto || monto <= 0 || !categoriaAhorro) return;

    const esUsd = form.moneda === 'USD';
    const cotizacion = esUsd ? cotizacionOficial : 1;
    if (esUsd && cotizacion <= 0) return;

    await onCrearAhorro?.({
      tipo_movimiento_id: 3,
      categoria_id: categoriaAhorro.id,
      fecha: form.fecha,
      descripcion: form.descripcion || `Ahorro ${form.moneda}`,
      moneda_original: form.moneda,
      monto_original: monto,
      cotizacion_aplicada: cotizacion,
      monto_ars: esUsd ? Number((monto * cotizacion).toFixed(2)) : monto,
      estado_ingreso: 'registrado'
    });

    setForm((prev) => ({ ...prev, monto: '', descripcion: '' }));
  };

  return (
    <section className="ahorros-panel">
      <div className="panel ahorros-hero">
        <div className="panel-header">
          <p className="eyebrow">Ahorros</p>
          <h2>Reserva del ciclo</h2>
          <p>Los ahorros registrados descuentan del balance del mes y quedan separados por moneda.</p>
        </div>
        <div className="ahorros-summary-grid">
          <article>
            <span>Ahorro ARS</span>
            <strong>{formatMoney(resumen.ars)}</strong>
          </article>
          <article>
            <span>Ahorro USD</span>
            <strong>{formatUsd(resumen.usd)}</strong>
          </article>
          <article>
            <span>Impacto en balance</span>
            <strong>{formatMoney(resumen.valorizadoArs)}</strong>
          </article>
        </div>
      </div>

      <form className="panel ahorro-form" onSubmit={handleSubmit}>
        <div className="panel-header">
          <h3>Registrar ahorro</h3>
        </div>
        <label>
          Monto
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.monto}
            onChange={(event) => setForm((prev) => ({ ...prev, monto: event.target.value }))}
            placeholder="0,00"
            required
          />
        </label>
        <label>
          Moneda
          <select value={form.moneda} onChange={(event) => setForm((prev) => ({ ...prev, moneda: event.target.value }))}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>
          Fecha
          <input
            type="date"
            value={form.fecha}
            onChange={(event) => setForm((prev) => ({ ...prev, fecha: event.target.value }))}
            required
          />
        </label>
        <label>
          Descripcion
          <input
            value={form.descripcion}
            onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
            placeholder="Ej: Reserva sueldo"
          />
        </label>
        <div className="ahorro-form-preview">
          <span>{form.moneda === 'USD' ? `Cotizacion: ${formatMoney(cotizacionOficial)}` : 'Impacto directo en ARS'}</span>
          <strong>{Number.isFinite(valorPreviewArs) ? formatMoney(valorPreviewArs) : formatMoney(0)}</strong>
        </div>
        <button type="submit" disabled={loading || !categoriaAhorro || (form.moneda === 'USD' && cotizacionOficial <= 0)}>
          Registrar ahorro
        </button>
      </form>

      <div className="panel ahorro-evolution">
        <div className="panel-header">
          <h3>Evolucion mensual</h3>
          <p>Lectura valorizada en ARS para comparar el esfuerzo de ahorro mes a mes.</p>
        </div>
        <div className="ahorro-evolution-list">
          {serie.map((item) => (
            <article key={item.key} className="ahorro-evolution-row">
              <div>
                <strong>{item.label}</strong>
                <span>
                  {formatMoney(item.ars)} · {formatUsd(item.usd)}
                </span>
              </div>
              <div className="ahorro-evolution-bar" aria-hidden="true">
                <i style={{ width: `${maxSerie > 0 ? Math.max(4, (item.valorizadoArs / maxSerie) * 100) : 0}%` }} />
              </div>
              <strong>{formatMoney(item.valorizadoArs)}</strong>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
