import { useEffect, useMemo, useState } from 'react';
import { createCategoria, deleteCategoria, updateCategoria } from '../services/api.js';

const tiposCategoria = [
  { id: 2, value: 'egreso', label: 'Egreso' },
  { id: 1, value: 'ingreso', label: 'Ingreso' },
  { id: 3, value: 'ahorro', label: 'Ahorro' }
];

const formInicial = {
  nombre: '',
  tipo_movimiento_id: 2
};

function getTipoId(categoria) {
  if (categoria.tipo_movimiento_id) return Number(categoria.tipo_movimiento_id);
  return tiposCategoria.find((tipo) => tipo.value === categoria.tipo_movimiento)?.id || 2;
}

export default function ConfiguracionPanel({
  hogarId,
  hogarNombre,
  categorias = [],
  onCategoriasChange
}) {
  const [form, setForm] = useState(formInicial);
  const [editandoId, setEditandoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const categoriasOrdenadas = useMemo(
    () =>
      [...categorias].sort((a, b) => {
        const tipoA = String(a.tipo_movimiento || '');
        const tipoB = String(b.tipo_movimiento || '');
        if (tipoA !== tipoB) return tipoA.localeCompare(tipoB, 'es-AR');
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es-AR');
      }),
    [categorias]
  );

  useEffect(() => {
    setForm(formInicial);
    setEditandoId(null);
    setError('');
    setMensaje('');
  }, [hogarId]);

  const limpiarForm = () => {
    setForm(formInicial);
    setEditandoId(null);
  };

  const guardarCategoria = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (!form.nombre.trim()) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      const payload = {
        hogar_id: hogarId,
        nombre: form.nombre.trim(),
        tipo_movimiento_id: Number(form.tipo_movimiento_id)
      };

      if (editandoId) {
        await updateCategoria(editandoId, payload);
        setMensaje('Categoría actualizada.');
      } else {
        await createCategoria(payload);
        setMensaje('Categoría creada.');
      }

      limpiarForm();
      await onCategoriasChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const editarCategoria = (categoria) => {
    setEditandoId(categoria.id);
    setForm({
      nombre: categoria.nombre || '',
      tipo_movimiento_id: getTipoId(categoria)
    });
    setMensaje('');
    setError('');
  };

  const eliminarCategoria = async (categoria) => {
    if (loading) return;
    const confirmado = window.confirm(`Eliminar la categoría "${categoria.nombre}"?`);
    if (!confirmado) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await deleteCategoria(categoria.id);
      if (Number(editandoId) === Number(categoria.id)) limpiarForm();
      setMensaje('Categoría eliminada.');
      await onCategoriasChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="config-panel">
      <div className="panel config-hero-panel">
        <div className="panel-header">
          <p className="eyebrow">Configuración</p>
          <h2>Categorías</h2>
          <p>Administración de categorías para {hogarNombre || 'este hogar'}.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success-message">{mensaje}</p>}

      <form className="admin-card config-category-form" onSubmit={guardarCategoria}>
        <div className="admin-card-header">
          <div>
            <h3>{editandoId ? 'Editar categoría' : 'Nueva categoría'}</h3>
            <small>Se crea solo para este hogar.</small>
          </div>
        </div>

        <label>
          Nombre
          <input
            value={form.nombre}
            onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
            placeholder="Ej: Veterinaria"
            required
          />
        </label>

        <label>
          Tipo
          <select
            value={form.tipo_movimiento_id}
            onChange={(event) => setForm((prev) => ({ ...prev, tipo_movimiento_id: Number(event.target.value) }))}
          >
            {tiposCategoria.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.label}
              </option>
            ))}
          </select>
        </label>

        <div className="config-form-actions">
          {editandoId && (
            <button type="button" className="ghost-btn" onClick={limpiarForm}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn-with-spinner" disabled={loading || !form.nombre.trim()}>
            {loading && <span className="btn-spinner" aria-hidden="true" />}
            {loading ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear categoría'}
          </button>
        </div>
      </form>

      <div className="admin-card config-category-list">
        <div className="admin-card-header">
          <div>
            <h3>Categorías del hogar</h3>
            <small>{categoriasOrdenadas.length} activas</small>
          </div>
        </div>

        <div className="table-wrapper config-category-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categoriasOrdenadas.map((categoria) => (
                <tr key={categoria.id}>
                  <td>{categoria.nombre}</td>
                  <td>
                    <span className={`badge badge-${categoria.tipo_movimiento}`}>{categoria.tipo_movimiento}</span>
                  </td>
                  <td>
                    <div className="acciones-inline">
                      <button type="button" className="btn-inline secondary" onClick={() => editarCategoria(categoria)} title="Editar" disabled={loading}>
                        ✎
                      </button>
                      <button type="button" className="btn-inline danger" onClick={() => eliminarCategoria(categoria)} title="Eliminar" disabled={loading}>
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categoriasOrdenadas.length === 0 && (
                <tr>
                  <td colSpan={3}>No hay categorías activas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
