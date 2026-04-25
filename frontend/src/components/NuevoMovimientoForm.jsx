import { useEffect, useRef, useState } from 'react';

const initialState = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo_movimiento_id: 2,
  categoria_id: '',
  descripcion: '',
  monto_ars: '',
  moneda_original: 'ARS',
  usa_ahorro: false
};

function normalizeInputDate(value) {
  if (!value) return initialState.fecha;
  if (value.includes('T')) return value.slice(0, 10);
  if (value.includes('/')) {
    const [day, month, year] = value.split('/');
    if (day && month && year) return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return value;
}

export default function NuevoMovimientoForm({ categorias, onCrear, loading, modo = 'crear', initialValues = null }) {
  const [form, setForm] = useState(initialState);
  const montoRef = useRef(null);
  const tipoSeleccionado =
    Number(form.tipo_movimiento_id) === 1 ? 'ingreso' : Number(form.tipo_movimiento_id) === 3 ? 'ahorro' : 'egreso';
  const categoriasFiltradas = categorias.filter((categoria) => categoria.tipo_movimiento === tipoSeleccionado);

  useEffect(() => {
    if (!initialValues) {
      setForm(initialState);
      return;
    }

    setForm({
      fecha: normalizeInputDate(initialValues.fecha),
      tipo_movimiento_id:
        initialValues.tipo_movimiento === 'ingreso'
          ? 1
          : initialValues.tipo_movimiento === 'ahorro'
          ? 3
          : 2,
      categoria_id: initialValues.categoria_id ? String(initialValues.categoria_id) : '',
      descripcion: initialValues.descripcion || '',
      monto_ars: String(initialValues.monto_ars ?? ''),
      moneda_original: initialState.moneda_original,
      usa_ahorro: Boolean(initialValues.usa_ahorro)
    });
  }, [initialValues]);

  useEffect(() => {
    if (!form.categoria_id && categoriasFiltradas.length > 0 && modo === 'crear') {
      setForm((prev) => ({ ...prev, categoria_id: String(categoriasFiltradas[0].id) }));
      return;
    }

    if (!form.categoria_id) return;
    const existe = categoriasFiltradas.some((categoria) => Number(categoria.id) === Number(form.categoria_id));
    if (!existe) {
      setForm((prev) => ({
        ...prev,
        categoria_id: categoriasFiltradas[0] ? String(categoriasFiltradas[0].id) : ''
      }));
    }
  }, [tipoSeleccionado, categoriasFiltradas, form.categoria_id, modo]);

  useEffect(() => {
    if (!montoRef.current) return;
    montoRef.current.focus();
    montoRef.current.select?.();
  }, [modo, initialValues]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    await onCrear({
      hogar_id: 1,
      cuenta_id: 1,
      tipo_movimiento_id: Number(form.tipo_movimiento_id),
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      fecha: form.fecha,
      descripcion: form.descripcion,
      moneda_original: form.moneda_original,
      monto_original: Number(form.monto_ars),
      monto_ars: Number(form.monto_ars),
      usa_ahorro: Number(form.tipo_movimiento_id) === 2 ? Boolean(form.usa_ahorro) : false,
      creado_por_usuario_id: 1
    });

    if (modo === 'crear') {
      setForm((prev) => ({ ...initialState, fecha: prev.fecha }));
    }
  };

  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <h2>{modo === 'editar' ? 'Editar movimiento' : 'Cargar movimiento'}</h2>
        <p>Completa primero monto y categoria para una carga mas rapida.</p>
      </div>

      <form className="form-grid movement-form" onSubmit={handleSubmit}>
        <label className="field-strong">
          Monto ARS
          <input
            ref={montoRef}
            type="number"
            min="0.01"
            step="0.01"
            value={form.monto_ars}
            onChange={(e) => handleChange('monto_ars', e.target.value)}
            placeholder="0"
            required
          />
        </label>

        <label>
          Tipo
          <select value={form.tipo_movimiento_id} onChange={(e) => handleChange('tipo_movimiento_id', e.target.value)}>
            <option value={1}>Ingreso</option>
            <option value={2}>Egreso</option>
            <option value={3}>Ahorro</option>
          </select>
        </label>

        <label className="field-strong">
          Categoria
          <select value={form.categoria_id} onChange={(e) => handleChange('categoria_id', e.target.value)}>
            <option value="">Sin categoria</option>
            {categoriasFiltradas.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>

        <label>
          Fecha
          <input type="date" value={form.fecha} onChange={(e) => handleChange('fecha', e.target.value)} required />
        </label>

        <label className="full-width movement-form-description">
          <div className="field-heading">
            <span>Descripcion</span>
            <small>Opcional</small>
          </div>
          <input
            type="text"
            value={form.descripcion}
            onChange={(e) => handleChange('descripcion', e.target.value)}
            placeholder="Ej: Supermercado, sueldo, transferencia"
          />
        </label>

        {Number(form.tipo_movimiento_id) === 2 && (
          <label className="full-width checkbox-card">
            <span className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(form.usa_ahorro)}
                onChange={(e) => handleChange('usa_ahorro', e.target.checked)}
              />
              <span>Este egreso se paga con ahorros acumulados</span>
            </span>
          </label>
        )}

        <button type="submit" className="full-width movement-submit" disabled={loading}>
          {loading ? 'Guardando...' : modo === 'editar' ? 'Guardar cambios' : 'Guardar movimiento'}
        </button>
      </form>
    </section>
  );
}
