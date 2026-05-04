import { useEffect, useState } from 'react';
import MonthPicker from './MonthPicker.jsx';
import { formatDecimalInput, formatMoneyArs as formatMoney, parseDecimalInput, sanitizeDecimalInput } from '../utils/numberFormat.js';

export default function GastosFijosPanel({
  gastos,
  categorias,
  ciclo,
  onCicloChange,
  onCrear,
  onEditar,
  onAjustar,
  onEliminarEnCiclo,
  onHistorialAjustes,
  readOnly = false,
  loading = false
}) {
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [form, setForm] = useState({
    descripcion: '',
    categoria_id: '',
    moneda: 'ARS',
    monto_base: '',
    dia_vencimiento: '',
    ciclo_desde: ciclo,
    ciclo_hasta: ''
  });
  const [gastoEditando, setGastoEditando] = useState(null);
  const [formEditar, setFormEditar] = useState({
    descripcion: '',
    categoria_id: '',
    moneda: 'ARS',
    monto_base: '',
    dia_vencimiento: '',
    activo_desde_ciclo: ciclo,
    activo_hasta_ciclo: ''
  });
  const [gastoAjustando, setGastoAjustando] = useState(null);
  const [formAjuste, setFormAjuste] = useState({
    ciclo_aplicacion: ciclo,
    alcance: 'desde_ciclo',
    tipo_ajuste: 'porcentaje',
    valor: '',
    nota: ''
  });
  const [gastoFinalizando, setGastoFinalizando] = useState(null);
  const [historialAjustes, setHistorialAjustes] = useState(null);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState('');

  useEffect(() => {
    setForm((current) => ({
      ...current,
      ciclo_desde: mostrarAlta ? current.ciclo_desde : ciclo
    }));
    setFormEditar((current) => ({
      ...current,
      activo_desde_ciclo: gastoEditando ? current.activo_desde_ciclo : ciclo
    }));
    setFormAjuste((current) => ({
      ...current,
      ciclo_aplicacion: gastoAjustando ? current.ciclo_aplicacion : ciclo
    }));
  }, [ciclo, gastoAjustando, gastoEditando, mostrarAlta]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    await onCrear({
      hogar_id: 1,
      descripcion: form.descripcion,
      categoria_id: Number(form.categoria_id),
      moneda: form.moneda,
      monto_base: parseDecimalInput(form.monto_base),
      dia_vencimiento: form.dia_vencimiento ? Number(form.dia_vencimiento) : null,
      ciclo_desde: form.ciclo_desde || ciclo,
      ciclo_hasta: form.ciclo_hasta || null
    });

    setForm({
      descripcion: '',
      categoria_id: '',
      moneda: 'ARS',
      monto_base: '',
      dia_vencimiento: '',
      ciclo_desde: ciclo,
      ciclo_hasta: ''
    });
    setMostrarAlta(false);
  };

  const abrirAjuste = (gasto) => {
    setGastoAjustando(gasto);
    setFormAjuste({
      ciclo_aplicacion: ciclo,
      alcance: 'desde_ciclo',
      tipo_ajuste: 'porcentaje',
      valor: '',
      nota: ''
    });
  };

  const confirmarAjuste = async () => {
    if (!gastoAjustando || loading) return;
    const valorIngresado = parseDecimalInput(formAjuste.valor);
    const valorPersistido = formAjuste.tipo_ajuste === 'monto_fijo'
      ? Number((valorIngresado - montoActualAjuste).toFixed(2))
      : valorIngresado;
    if (!valorPersistido) return;
    await onAjustar(gastoAjustando.id, {
      ciclo_aplicacion: formAjuste.ciclo_aplicacion,
      alcance: formAjuste.alcance,
      tipo_ajuste: formAjuste.tipo_ajuste,
      valor: valorPersistido,
      nota: formAjuste.nota || null
    });
    setGastoAjustando(null);
  };

  const abrirHistorial = async (gasto) => {
    if (!onHistorialAjustes) return;
    setHistorialAjustes({ gasto, items: [] });
    setHistorialError('');
    setHistorialLoading(true);
    try {
      const data = await onHistorialAjustes(gasto.id);
      setHistorialAjustes({
        gasto: data.gasto || gasto,
        items: data.items || []
      });
    } catch (err) {
      setHistorialError(err.message);
    } finally {
      setHistorialLoading(false);
    }
  };

  const confirmarFinalizacion = async () => {
    if (!gastoFinalizando || loading) return;
    await onEliminarEnCiclo(gastoFinalizando.id, ciclo);
    setGastoFinalizando(null);
  };

  const abrirEdicion = (gasto) => {
    setGastoEditando(gasto);
    setFormEditar({
      descripcion: gasto.descripcion || '',
      categoria_id: gasto.categoria_id || '',
      moneda: gasto.moneda || 'ARS',
      monto_base: formatDecimalInput(gasto.monto_base || 0),
      dia_vencimiento: gasto.dia_vencimiento || '',
      activo_desde_ciclo: gasto.activo_desde_ciclo || ciclo,
      activo_hasta_ciclo: gasto.activo_hasta_ciclo || ''
    });
  };

  const confirmarEdicion = async () => {
    if (!gastoEditando || loading) return;
    await onEditar(gastoEditando.id, {
      descripcion: formEditar.descripcion,
      monto_base: parseDecimalInput(formEditar.monto_base),
      categoria_id: formEditar.categoria_id ? Number(formEditar.categoria_id) : null,
      moneda: formEditar.moneda,
      dia_vencimiento: formEditar.dia_vencimiento ? Number(formEditar.dia_vencimiento) : null,
      activo_desde_ciclo: formEditar.activo_desde_ciclo || null,
      activo_hasta_ciclo: formEditar.activo_hasta_ciclo || null
    });
    setGastoEditando(null);
  };

  const formatVigencia = (gasto) => {
    const desde = gasto.activo_desde_ciclo || '-';
    const hasta = gasto.activo_hasta_ciclo ? ` a ${gasto.activo_hasta_ciclo}` : '';
    return `${desde}${hasta}`;
  };

  const gastosOrdenados = [...gastos].sort((a, b) => {
    const diaA = Number(a.dia_vencimiento || 0);
    const diaB = Number(b.dia_vencimiento || 0);

    if (diaA && diaB && diaA !== diaB) return diaA - diaB;
    if (diaA && !diaB) return -1;
    if (!diaA && diaB) return 1;

    return String(a.descripcion || '').localeCompare(String(b.descripcion || ''), 'es-AR');
  });

  const montoActualAjuste = Number(gastoAjustando?.monto_vigente ?? gastoAjustando?.monto_base ?? 0);
  const valorAjuste = parseDecimalInput(formAjuste.valor);
  const montoEstimado =
    formAjuste.tipo_ajuste === 'porcentaje'
      ? montoActualAjuste + (montoActualAjuste * valorAjuste) / 100
      : valorAjuste;
  const cicloHastaImpacto = gastoAjustando?.activo_hasta_ciclo || null;
  const impactoAjuste =
    formAjuste.alcance === 'solo_ciclo'
      ? `Impacta solo en el ciclo ${formAjuste.ciclo_aplicacion}.`
      : cicloHastaImpacto
        ? `Impacta desde ${formAjuste.ciclo_aplicacion} hasta ${cicloHastaImpacto}.`
        : `Impacta desde ${formAjuste.ciclo_aplicacion} en adelante.`;

  const detalleResultado =
    formAjuste.tipo_ajuste === 'porcentaje'
      ? `${valorAjuste >= 0 ? '+' : ''}${valorAjuste.toLocaleString('es-AR', { maximumFractionDigits: 2 })}% sobre el valor actual`
      : `Queda en ${formatMoney(valorAjuste)}`;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Valores fijos</h2>
        <p>Defini importes recurrentes para contemplar gastos e ingresos fijos.</p>
        <div className="fixed-values-cycle-selector">
          <MonthPicker label="Ciclo seleccionado" value={ciclo} onChange={onCicloChange} />
        </div>
        {!readOnly && (
          <div className="panel-header-actions">
            <button type="button" onClick={() => setMostrarAlta(true)} disabled={loading}>
              + Nuevo valor fijo
            </button>
          </div>
        )}
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Descripcion</th>
              <th>Categoria</th>
              <th>Moneda</th>
              <th>Monto</th>
              <th>Monto vigente</th>
              <th>Vigencia</th>
              <th>Dia</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {gastosOrdenados.map((gasto) => (
              <tr key={gasto.id}>
                <td>{gasto.descripcion}</td>
                <td>{gasto.categoria}</td>
                <td>{gasto.moneda}</td>
                <td>{formatMoney(gasto.monto_base)}</td>
                <td>{formatMoney(gasto.monto_vigente ?? gasto.monto_base)}</td>
                <td>{formatVigencia(gasto)}</td>
                <td>{gasto.dia_vencimiento ? `Dia ${gasto.dia_vencimiento}` : 'Sin dia'}</td>
                <td>
                  {!readOnly && (
                    <div className="acciones-inline">
                      <button type="button" className="btn-inline" onClick={() => abrirEdicion(gasto)} disabled={loading}>
                        ✏️
                      </button>
                      <button type="button" className="btn-inline" onClick={() => abrirAjuste(gasto)} disabled={loading}>
                        Ajustar
                      </button>
                      <button type="button" className="btn-inline secondary" onClick={() => abrirHistorial(gasto)} disabled={loading || historialLoading}>
                        Historial
                      </button>
                      <button
                        type="button"
                        className="btn-inline danger"
                        onClick={() => setGastoFinalizando(gasto)}
                        disabled={loading}
                        title={`Finalizar desde ciclo ${ciclo}`}
                      >
                        Finalizar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {gastos.length === 0 && (
              <tr>
                <td colSpan={8}>Todavia no hay valores fijos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {gastoEditando && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Editar valor fijo</h3>
              <button type="button" className="close-btn" onClick={() => setGastoEditando(null)}>
                x
              </button>
            </div>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); confirmarEdicion(); }}>
              <label>
                Descripcion
                <input value={formEditar.descripcion} onChange={(e) => setFormEditar((p) => ({ ...p, descripcion: e.target.value }))} required />
              </label>
              <label>
                Categoria
                <select value={formEditar.categoria_id} onChange={(e) => setFormEditar((p) => ({ ...p, categoria_id: e.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Moneda
                <select value={formEditar.moneda} onChange={(e) => setFormEditar((p) => ({ ...p, moneda: e.target.value }))}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label>
                Monto base
                <input
                  type="text"
                  inputMode="decimal"
                  value={formEditar.monto_base}
                  onChange={(e) => setFormEditar((p) => ({ ...p, monto_base: sanitizeDecimalInput(e.target.value) }))}
                  placeholder="0,00"
                  required
                />
              </label>
              <label>
                Dia vencimiento
                <input type="number" min="1" max="31" value={formEditar.dia_vencimiento} onChange={(e) => setFormEditar((p) => ({ ...p, dia_vencimiento: e.target.value }))} />
              </label>
              <MonthPicker
                label="Ciclo inicio"
                value={formEditar.activo_desde_ciclo}
                onChange={(value) => setFormEditar((p) => ({ ...p, activo_desde_ciclo: value }))}
              />
              <MonthPicker
                label="Ciclo fin"
                min={formEditar.activo_desde_ciclo || ciclo}
                value={formEditar.activo_hasta_ciclo}
                onChange={(value) => setFormEditar((p) => ({ ...p, activo_hasta_ciclo: value }))}
                allowClear
                emptyLabel="Sin fin"
              />
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline" onClick={() => setGastoEditando(null)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn-inline success btn-with-spinner" disabled={loading}>
                  {loading && <span className="btn-spinner" aria-hidden="true" />}
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarAlta && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Nuevo valor fijo</h3>
              <button type="button" className="close-btn" onClick={() => setMostrarAlta(false)}>
                x
              </button>
            </div>
            <form className="form-grid" onSubmit={handleSubmit}>
              <label>
                Descripcion
                <input value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} required />
              </label>

              <label>
                Categoria
                <select value={form.categoria_id} onChange={(e) => setForm((p) => ({ ...p, categoria_id: e.target.value }))} required>
                  <option value="">Seleccionar</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Moneda
                <select value={form.moneda} onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value }))}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <label>
                Monto base
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.monto_base}
                  onChange={(e) => setForm((p) => ({ ...p, monto_base: sanitizeDecimalInput(e.target.value) }))}
                  placeholder="0,00"
                  required
                />
              </label>

              <label>
                Dia vencimiento
                <input type="number" min="1" max="31" value={form.dia_vencimiento} onChange={(e) => setForm((p) => ({ ...p, dia_vencimiento: e.target.value }))} />
                <small className="field-helper">Opcional. Sirve para ordenar y priorizar este valor fijo dentro del ciclo.</small>
              </label>

              <MonthPicker
                label="Ciclo inicio"
                value={form.ciclo_desde}
                onChange={(value) => setForm((p) => ({ ...p, ciclo_desde: value }))}
              />

              <MonthPicker
                label="Ciclo fin"
                min={form.ciclo_desde || ciclo}
                value={form.ciclo_hasta}
                onChange={(value) => setForm((p) => ({ ...p, ciclo_hasta: value }))}
                allowClear
                emptyLabel="Sin fin"
              />

              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline secondary" onClick={() => setMostrarAlta(false)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn-inline success btn-with-spinner" disabled={loading}>
                  {loading && <span className="btn-spinner" aria-hidden="true" />}
                  {loading ? 'Guardando...' : 'Guardar valor fijo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {gastoAjustando && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Ajuste de valor fijo</h3>
              <button type="button" className="close-btn" onClick={() => setGastoAjustando(null)}>
                x
              </button>
            </div>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); confirmarAjuste(); }}>
              <div className="adjustment-preview full-width">
                <div className="adjustment-preview-header">
                  <strong>{gastoAjustando.descripcion}</strong>
                  <span>{gastoAjustando.categoria}</span>
                </div>
                <div className="adjustment-preview-grid">
                  <div className="adjustment-preview-item">
                    <small>Valor actual</small>
                    <strong>{formatMoney(montoActualAjuste)}</strong>
                    <span>Vigente en {ciclo}</span>
                  </div>
                  <div className="adjustment-preview-item adjustment-preview-emphasis">
                    <small>Valor resultante estimado</small>
                    <strong>{formatMoney(montoEstimado)}</strong>
                    <span>{detalleResultado}</span>
                  </div>
                </div>
                <div className="adjustment-impact">
                  <small>Impacto estimado</small>
                  <strong>{impactoAjuste}</strong>
                  <span>
                    {formAjuste.alcance === 'solo_ciclo'
                      ? 'Los demas ciclos conservan su valor actual.'
                      : 'Los ciclos dentro de ese rango usaran el valor ajustado.'}
                  </span>
                </div>
              </div>
              <label className="full-width">
                Alcance del ajuste
                <div className="adjustment-scope">
                  <label className={`scope-option ${formAjuste.alcance === 'solo_ciclo' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="alcance-ajuste"
                      checked={formAjuste.alcance === 'solo_ciclo'}
                      onChange={() => setFormAjuste((p) => ({ ...p, alcance: 'solo_ciclo' }))}
                    />
                    <span>
                      <strong>Solo este ciclo</strong>
                      <small>Impacta unicamente en {formAjuste.ciclo_aplicacion}.</small>
                    </span>
                  </label>
                  <label className={`scope-option ${formAjuste.alcance === 'desde_ciclo' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="alcance-ajuste"
                      checked={formAjuste.alcance === 'desde_ciclo'}
                      onChange={() => setFormAjuste((p) => ({ ...p, alcance: 'desde_ciclo' }))}
                    />
                    <span>
                      <strong>Desde este ciclo en adelante</strong>
                      <small>Impacta desde {formAjuste.ciclo_aplicacion} y se mantiene en los ciclos futuros.</small>
                    </span>
                  </label>
                </div>
              </label>
              <MonthPicker
                label="Ciclo de aplicacion"
                min={ciclo}
                value={formAjuste.ciclo_aplicacion}
                onChange={(value) => setFormAjuste((p) => ({ ...p, ciclo_aplicacion: value }))}
              />
              <label>
                Tipo ajuste
                <select
                  value={formAjuste.tipo_ajuste}
                  onChange={(e) => setFormAjuste((p) => ({
                    ...p,
                    tipo_ajuste: e.target.value,
                    valor: e.target.value === 'monto_fijo' ? formatDecimalInput(montoActualAjuste) : ''
                  }))}
                >
                  <option value="porcentaje">Porcentaje</option>
                  <option value="monto_fijo">Monto fijo</option>
                </select>
              </label>
              <label>
                {formAjuste.tipo_ajuste === 'porcentaje' ? 'Porcentaje de ajuste' : 'Monto final'}
                <input
                  type="text"
                  inputMode="decimal"
                  value={formAjuste.valor}
                  onChange={(e) => setFormAjuste((p) => ({ ...p, valor: sanitizeDecimalInput(e.target.value, { allowNegative: true }) }))}
                  placeholder={formAjuste.tipo_ajuste === 'porcentaje' ? '0,00' : '0,00'}
                  required
                />
                {formAjuste.tipo_ajuste === 'monto_fijo' && (
                  <small className="field-helper">Ingresá el importe en el que debe quedar este valor fijo.</small>
                )}
              </label>
              <label className="full-width">
                Nota
                <input value={formAjuste.nota} onChange={(e) => setFormAjuste((p) => ({ ...p, nota: e.target.value }))} />
              </label>
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline" onClick={() => setGastoAjustando(null)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn-inline success btn-with-spinner" disabled={loading}>
                  {loading && <span className="btn-spinner" aria-hidden="true" />}
                  {loading ? 'Aplicando...' : 'Aplicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {gastoFinalizando && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-compact">
            <div className="modal-header">
              <h3>Finalizar valor fijo</h3>
              <button type="button" className="close-btn" onClick={() => setGastoFinalizando(null)}>
                x
              </button>
            </div>
            <div className="confirm-copy">
              <strong>{gastoFinalizando.descripcion}</strong>
              <p>Se finaliza desde el ciclo {ciclo}.</p>
              <p>El historico anterior se conserva y este valor fijo deja de generar movimientos desde ese ciclo en adelante.</p>
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn-inline secondary" onClick={() => setGastoFinalizando(null)} disabled={loading}>
                Cancelar
              </button>
              <button type="button" className="btn-inline danger btn-with-spinner" onClick={confirmarFinalizacion} disabled={loading}>
                {loading && <span className="btn-spinner" aria-hidden="true" />}
                {loading ? 'Finalizando...' : 'Confirmar finalizacion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historialAjustes && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h3>Historial de ajustes</h3>
                <small>{historialAjustes.gasto?.descripcion || 'Valor fijo'}</small>
              </div>
              <button type="button" className="close-btn" onClick={() => setHistorialAjustes(null)} disabled={historialLoading}>
                x
              </button>
            </div>
            {historialError && <p className="error full-width">{historialError}</p>}
            {historialLoading ? (
              <div className="adjustment-history-loading">
                <span className="btn-spinner" aria-hidden="true" />
                Cargando historial...
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Antes</th>
                      <th>Despues</th>
                      <th>Alcance</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(historialAjustes.items || []).map((ajuste) => (
                      <tr key={ajuste.id}>
                        <td>{String(ajuste.fecha_aplicacion || '').slice(0, 10)}</td>
                        <td>{ajuste.tipo_ajuste === 'porcentaje' ? 'Porcentaje' : 'Monto final'}</td>
                        <td>
                          {ajuste.tipo_ajuste === 'porcentaje'
                            ? `${Number(ajuste.valor || 0).toLocaleString('es-AR')}%`
                            : formatMoney(ajuste.monto_posterior)}
                        </td>
                        <td>{formatMoney(ajuste.monto_anterior)}</td>
                        <td>{formatMoney(ajuste.monto_posterior)}</td>
                        <td>{ajuste.ciclo_hasta_aplicacion ? `Hasta ${ajuste.ciclo_hasta_aplicacion}` : 'Desde fecha'}</td>
                        <td>{ajuste.nota || '-'}</td>
                      </tr>
                    ))}
                    {(!historialAjustes.items || historialAjustes.items.length === 0) && (
                      <tr>
                        <td colSpan={7}>Sin ajustes aplicados.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
