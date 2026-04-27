import { useEffect, useState } from 'react';
import {
  actualizarRolMiembroHogar,
  agregarMiembroHogar,
  getMiembrosHogar,
  quitarMiembroHogar
} from '../services/api.js';

const rolesHogar = [
  { value: 'hogar_admin', label: 'Hogar admin' },
  { value: 'hogar_member', label: 'Hogar member' }
];

export default function HogarAdminPanel({ hogarId, hogarNombre, usuarioActualId, compact = false }) {
  const [miembros, setMiembros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'hogar_member'
  });

  const cargarMiembros = async () => {
    if (!hogarId) return;

    try {
      setLoading(true);
      setError('');
      const data = await getMiembrosHogar(hogarId);
      setMiembros(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarMiembros();
  }, [hogarId]);

  const agregarMiembro = async (event) => {
    event.preventDefault();
    if (!form.email.trim()) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await agregarMiembroHogar(hogarId, {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        password: form.password,
        rol: form.rol
      });
      setForm({ nombre: '', email: '', password: '', rol: 'hogar_member' });
      setMensaje('Miembro agregado al hogar.');
      await cargarMiembros();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cambiarRol = async (usuarioId, rol) => {
    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await actualizarRolMiembroHogar(hogarId, usuarioId, { rol });
      setMensaje('Rol actualizado.');
      await cargarMiembros();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quitarMiembro = async (usuarioId) => {
    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await quitarMiembroHogar(hogarId, usuarioId);
      setMensaje('Miembro quitado del hogar.');
      await cargarMiembros();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={compact ? 'hogar-admin-panel hogar-admin-embedded' : 'panel hogar-admin-panel'}>
      <div className="panel-header">
        <h2>{compact ? 'Miembros del hogar' : 'Mi hogar'}</h2>
        <p>Gestion simple de miembros y roles para {hogarNombre || 'este hogar'}.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success-message">{mensaje}</p>}

      <div className="hogar-admin-layout">
        <form className="admin-card" onSubmit={agregarMiembro}>
          <h3>Agregar miembro</h3>
          <label>
            Nombre
            <input
              value={form.nombre}
              onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
              placeholder="Nombre visible"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="mail@ejemplo.com"
              required
            />
          </label>
          <label>
            Password inicial
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Solo si el usuario no existe"
            />
            <small>Si el usuario ya existe, solo se vincula al hogar.</small>
          </label>
          <label>
            Rol
            <select
              value={form.rol}
              onChange={(event) => setForm((prev) => ({ ...prev, rol: event.target.value }))}
            >
              {rolesHogar.map((rol) => (
                <option key={rol.value} value={rol.value}>
                  {rol.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={loading || !form.email.trim()}>
            Agregar al hogar
          </button>
        </form>

        <div className="admin-card">
          <h3>Miembros</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {miembros.map((miembro) => (
                  <tr key={miembro.id}>
                    <td>
                      <strong>{miembro.nombre}</strong>
                      <small>{miembro.correo}</small>
                    </td>
                    <td>
                      <select
                        value={miembro.rol}
                        disabled={loading || Number(miembro.id) === Number(usuarioActualId)}
                        onChange={(event) => cambiarRol(miembro.id, event.target.value)}
                      >
                        {rolesHogar.map((rol) => (
                          <option key={rol.value} value={rol.value}>
                            {rol.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{miembro.activo ? 'Activo' : 'Inactivo'}</td>
                    <td>
                      <button
                        type="button"
                        className="danger ghost-btn"
                        disabled={loading || Number(miembro.id) === Number(usuarioActualId)}
                        onClick={() => quitarMiembro(miembro.id)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
                {miembros.length === 0 && (
                  <tr>
                    <td colSpan={4}>No hay miembros vinculados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
