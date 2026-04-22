import { useEffect, useState } from 'react';
import {
  createAdminHogar,
  createAdminUsuario,
  getAdminHogares,
  getAdminUsuarios,
  updateAdminHogar,
  vincularAdminUsuarioHogar
} from '../services/api.js';

const roles = [
  { value: 'hogar_admin', label: 'Hogar admin' },
  { value: 'hogar_member', label: 'Hogar member' }
];

export default function SuperAdminPanel({ hogarActivoId, onHogaresChange, onHogarSelect }) {
  const [hogares, setHogares] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [nuevoHogar, setNuevoHogar] = useState('');
  const [hogarEditado, setHogarEditado] = useState({ id: '', nombre: '' });
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre: '',
    email: '',
    password: '',
    hogar_id: '',
    rol: 'hogar_member'
  });
  const [vinculo, setVinculo] = useState({
    hogar_id: '',
    usuario_id: '',
    rol: 'hogar_member'
  });

  const cargarAdmin = async () => {
    try {
      setLoading(true);
      setError('');
      const [hogaresData, usuariosData] = await Promise.all([getAdminHogares(), getAdminUsuarios()]);
      setHogares(hogaresData.items || []);
      setUsuarios(usuariosData.items || []);
      setVinculo((prev) => ({
        ...prev,
        hogar_id: String(hogarActivoId || prev.hogar_id || hogaresData.items?.[0]?.id || ''),
        usuario_id: prev.usuario_id || String(usuariosData.items?.[0]?.id || '')
      }));
      setNuevoUsuario((prev) => ({
        ...prev,
        hogar_id: String(prev.hogar_id || hogarActivoId || hogaresData.items?.[0]?.id || '')
      }));
      setHogarEditado((prev) => {
        const hogar = hogaresData.items?.find((item) => Number(item.id) === Number(prev.id || hogarActivoId)) || hogaresData.items?.[0];
        return hogar ? { id: String(hogar.id), nombre: hogar.nombre } : prev;
      });
      if (onHogaresChange) await onHogaresChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarAdmin();
  }, []);

  useEffect(() => {
    if (!hogarActivoId) return;
    setVinculo((prev) => ({ ...prev, hogar_id: String(hogarActivoId) }));
    setNuevoUsuario((prev) => ({ ...prev, hogar_id: String(hogarActivoId) }));
  }, [hogarActivoId]);

  const crearHogar = async (event) => {
    event.preventDefault();
    if (!nuevoHogar.trim()) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await createAdminHogar({ nombre: nuevoHogar.trim() });
      setNuevoHogar('');
      setMensaje('Hogar creado correctamente.');
      await cargarAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const editarHogar = async (event) => {
    event.preventDefault();
    if (!hogarEditado.id || !hogarEditado.nombre.trim()) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await updateAdminHogar(hogarEditado.id, { nombre: hogarEditado.nombre.trim() });
      setMensaje('Hogar actualizado correctamente.');
      await cargarAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const crearUsuario = async (event) => {
    event.preventDefault();
    if (!nuevoUsuario.email.trim() || !nuevoUsuario.password.trim() || !nuevoUsuario.hogar_id) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await createAdminUsuario({
        nombre: nuevoUsuario.nombre.trim(),
        email: nuevoUsuario.email.trim(),
        password: nuevoUsuario.password,
        hogar_id: Number(nuevoUsuario.hogar_id),
        rol: nuevoUsuario.rol
      });
      setNuevoUsuario((prev) => ({ ...prev, nombre: '', email: '', password: '' }));
      setMensaje('Usuario creado y asignado al hogar.');
      await cargarAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const vincularUsuario = async (event) => {
    event.preventDefault();
    if (!vinculo.hogar_id || !vinculo.usuario_id) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await vincularAdminUsuarioHogar(vinculo.hogar_id, {
        usuario_id: Number(vinculo.usuario_id),
        rol: vinculo.rol
      });
      setMensaje('Usuario vinculado al hogar correctamente.');
      await cargarAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel superadmin-panel">
      <div className="panel-header">
        <h2>Panel superadmin</h2>
        <p>Gestion simple de hogares, usuarios y roles por hogar.</p>
      </div>

      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success-message">{mensaje}</p>}

      <div className="superadmin-actions">
        <form className="admin-card" onSubmit={crearHogar}>
          <h3>Crear hogar</h3>
          <label>
            Nombre del hogar
            <input
              value={nuevoHogar}
              onChange={(event) => setNuevoHogar(event.target.value)}
              placeholder="Ej: Colon 260"
            />
          </label>
          <button type="submit" disabled={loading || !nuevoHogar.trim()}>
            Crear hogar
          </button>
        </form>

        <form className="admin-card" onSubmit={editarHogar}>
          <h3>Gestionar hogar</h3>
          <label>
            Hogar
            <select
              value={hogarEditado.id}
              onChange={(event) => {
                const hogar = hogares.find((item) => Number(item.id) === Number(event.target.value));
                setHogarEditado({ id: event.target.value, nombre: hogar?.nombre || '' });
              }}
            >
              {hogares.map((hogar) => (
                <option key={hogar.id} value={hogar.id}>
                  {hogar.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre
            <input
              value={hogarEditado.nombre}
              onChange={(event) => setHogarEditado((prev) => ({ ...prev, nombre: event.target.value }))}
              placeholder="Nombre del hogar"
            />
          </label>
          <button type="submit" disabled={loading || !hogarEditado.id || !hogarEditado.nombre.trim()}>
            Guardar hogar
          </button>
        </form>

        <form className="admin-card" onSubmit={crearUsuario}>
          <h3>Crear usuario</h3>
          <label>
            Nombre
            <input
              value={nuevoUsuario.nombre}
              onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, nombre: event.target.value }))}
              placeholder="Nombre visible"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={nuevoUsuario.email}
              onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="mail@ejemplo.com"
              required
            />
          </label>
          <label>
            Password inicial
            <input
              type="password"
              value={nuevoUsuario.password}
              onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Password temporal"
              required
            />
          </label>
          <label>
            Hogar
            <select
              value={nuevoUsuario.hogar_id}
              onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, hogar_id: event.target.value }))}
            >
              {hogares.map((hogar) => (
                <option key={hogar.id} value={hogar.id}>
                  {hogar.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rol en el hogar
            <select
              value={nuevoUsuario.rol}
              onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, rol: event.target.value }))}
            >
              {roles.map((rol) => (
                <option key={rol.value} value={rol.value}>
                  {rol.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={loading || !nuevoUsuario.email.trim() || !nuevoUsuario.password.trim() || !nuevoUsuario.hogar_id}>
            Crear y asignar
          </button>
        </form>

        <form className="admin-card" onSubmit={vincularUsuario}>
          <h3>Vincular usuario a hogar</h3>
          <label>
            Hogar
            <select
              value={vinculo.hogar_id}
              onChange={(event) => setVinculo((prev) => ({ ...prev, hogar_id: event.target.value }))}
            >
              {hogares.map((hogar) => (
                <option key={hogar.id} value={hogar.id}>
                  {hogar.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Usuario
            <select
              value={vinculo.usuario_id}
              onChange={(event) => setVinculo((prev) => ({ ...prev, usuario_id: event.target.value }))}
            >
              {usuarios.map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nombre} ({usuario.correo})
                </option>
              ))}
            </select>
          </label>
          <label>
            Rol
            <select
              value={vinculo.rol}
              onChange={(event) => setVinculo((prev) => ({ ...prev, rol: event.target.value }))}
            >
              {roles.map((rol) => (
                <option key={rol.value} value={rol.value}>
                  {rol.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={loading || !vinculo.hogar_id || !vinculo.usuario_id}>
            Vincular usuario
          </button>
        </form>
      </div>

      <div className="superadmin-grid">
        <div className="admin-card">
          <h3>Hogares</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Usuarios</th>
                  <th>Administrar</th>
                </tr>
              </thead>
              <tbody>
                {hogares.map((hogar) => (
                  <tr key={hogar.id}>
                    <td>{hogar.id}</td>
                    <td>{hogar.nombre}</td>
                    <td>{hogar.usuarios_vinculados || 0}</td>
                    <td>
                      {Number(hogarActivoId) === Number(hogar.id) ? (
                        <span className="pill success">Activo</span>
                      ) : (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => onHogarSelect?.(hogar.id)}
                        >
                          Administrar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {hogares.length === 0 && (
                  <tr>
                    <td colSpan={4}>No hay hogares cargados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-card">
          <h3>Usuarios</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Rol global</th>
                  <th>Hogares</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>{usuario.id}</td>
                    <td>
                      <strong>{usuario.nombre}</strong>
                      <small>{usuario.correo}</small>
                    </td>
                    <td>{usuario.rol_global}</td>
                    <td>
                      {(usuario.hogares || []).length > 0
                        ? usuario.hogares.map((hogar) => `${hogar.nombre} (${hogar.rol})`).join(', ')
                        : '-'}
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={4}>No hay usuarios cargados.</td>
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
