import { useEffect, useMemo, useRef, useState } from 'react';
import { parseDecimalInput, sanitizeDecimalInput } from '../utils/numberFormat.js';

export default function GastoRapidoModal({ categorias, loading, onClose, onSubmit }) {
  const categoriasEgreso = useMemo(
    () => categorias.filter((categoria) => categoria.tipo_movimiento === 'egreso'),
    [categorias]
  );
  const [form, setForm] = useState({
    monto: '',
    categoria_id: categoriasEgreso[0] ? String(categoriasEgreso[0].id) : '',
    descripcion: ''
  });
  const montoRef = useRef(null);

  useEffect(() => {
    if (!form.categoria_id && categoriasEgreso[0]) {
      setForm((prev) => ({ ...prev, categoria_id: String(categoriasEgreso[0].id) }));
    }
  }, [categoriasEgreso, form.categoria_id]);

  useEffect(() => {
    montoRef.current?.focus();
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    await onSubmit({
      monto: parseDecimalInput(form.monto),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      descripcion: form.descripcion.trim()
    });
  };

  return (
    <div className="modal-overlay quick-expense-overlay" role="dialog" aria-modal="true">
      <div className="modal-content quick-expense-modal">
        <div className="modal-header">
          <div>
            <h3>Gasto rapido</h3>
            <p className="quick-expense-subtitle">Egreso manual confirmado, sin descripcion obligatoria.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar gasto rapido">
            ✕
          </button>
        </div>

        <form className="quick-expense-form" onSubmit={handleSubmit}>
          <label className="field-strong">
            Monto ARS
            <input
              ref={montoRef}
              type="text"
              inputMode="decimal"
              value={form.monto}
              onChange={(event) => handleChange('monto', sanitizeDecimalInput(event.target.value))}
              placeholder="0,00"
              required
            />
          </label>

          <label className="field-strong">
            Categoria
            <select value={form.categoria_id} onChange={(event) => handleChange('categoria_id', event.target.value)}>
              <option value="">Sin categoria</option>
              {categoriasEgreso.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-heading">
              <span>Descripcion</span>
              <small>Opcional</small>
            </span>
            <input
              type="text"
              value={form.descripcion}
              onChange={(event) => handleChange('descripcion', event.target.value)}
              placeholder="Ej: kiosco, taxi, farmacia"
            />
          </label>

          <button type="submit" className="quick-expense-submit btn-with-spinner" disabled={loading}>
            {loading && <span className="btn-spinner" aria-hidden="true" />}
            {loading ? 'Guardando...' : 'Guardar gasto'}
          </button>
        </form>
      </div>
    </div>
  );
}
