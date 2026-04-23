import { useEffect, useMemo, useState } from 'react';
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

const crearUsuarioInicial = {
  nombre: '',
  email: '',
  password: '',
  hogar_id: '',
  rol: 'hogar_member'
};

export default function SuperAdminPanel({ hogarActivoId, onHogaresChange, onHogarSelect }) {
  const [hogares, setHogares] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modal, setModal] = useState(null);
  const [nuevoHogar, setNuevoHogar] = useState('');
  const [hogarEditado, setHogarEditado] = useState({ id: '', nombre: '' });
  const [nuevoUsuario, setNuevoUsuario] = useState(crearUsuarioInicial);
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
      const hogaresItems = hogaresData.items || [];
      const usuariosItems = usuariosData.items || [];

      setHogares(hogaresItems);
      setUsuarios(usuariosItems);
      setNuevoUsuario((prev) => ({
        ...prev,
        hogar_id: String(prev.hogar_id || hogarActivoId || hogaresItems[0]?.id || '')
      }));
      setVinculo((prev) => ({
        ...prev,
        hogar_id: String(prev.hogar_id || hogarActivoId || hogaresItems[0]?.id || ''),
        usuario_id: String(prev.usuario_id || usuariosItems[0]?.id || '')
      }));

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
    setNuevoUsuario((prev) => ({ ...prev, hogar_id: String(hogarActivoId) }));
    setVinculo((prev) => ({ ...prev, hogar_id: String(hogarActivoId) }));
  }, [hogarActivoId]);

  const usuariosPorHogar = useMemo(
    () =>
      hogares.map((hogar) => ({
        ...hogar,
        usuarios: usuarios
          .filter((usuario) => (usuario.hogares || []).some((item) => Number(item.id) === Number(hogar.id)))
          .map((usuario) => ({
            ...usuario,
            rol_hogar: usuario.hogares.find((item) => Number(item.id) === Number(hogar.id))?.rol || '-'
          }))
          .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es-AR'))
      })),
    [hogares, usuarios]
  );

  const usuariosSinHogar = useMemo(
    () => usuarios.filter((usuario) => (usuario.hogares || []).length === 0),
    [usuarios]
  );
  const modalError = modal && error ? <p className="error full-width">{error}</p> : null;

  const abrirCrearHogar = () => {
    setNuevoHogar('');
    setModal('crear-hogar');
  };

  const abrirEditarHogar = (hogar) => {
    setHogarEditado({ id: String(hogar.id), nombre: hogar.nombre || '' });
    setModal('editar-hogar');
  };

  const abrirCrearUsuario = (hogarId = hogarActivoId) => {
    setNuevoUsuario({
      ...crearUsuarioInicial,
      hogar_id: String(hogarId || hogares[0]?.id || '')
    });
    setModal('crear-usuario');
  };

  const abrirVincularUsuario = (hogarId = hogarActivoId) => {
    setVinculo({
      hogar_id: String(hogarId || hogares[0]?.id || ''),
      usuario_id: String(usuarios[0]?.id || ''),
      rol: 'hogar_member'
    });
    setModal('vincular-usuario');
  };

  const cerrarModal = () => {
    setModal(null);
    setError('');
  };

  const crearHogar = async (event) => {
    event.preventDefault();
    if (!nuevoHogar.trim()) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await createAdminHogar({ nombre: nuevoHogar.trim() });
      setMensaje('Hogar creado correctamente.');
      cerrarModal();
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
      cerrarModal();
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
      setMensaje('Usuario creado y asignado al hogar.');
      cerrarModal();
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
      cerrarModal();
      await cargarAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel superadmin-panel">
      <div className="panel-header superadmin-header">
        <div>
          <h2>Superadmin</h2>
          <p>Gestion de hogares y usuarios por hogar.</p>
        </div>
        <div className="superadmin-toolbar">
          <button type="button" onClick={abrirCrearHogar}>
            + Hogar
          </button>
          <button type="button" onClick={() => abrirCrearUsuario()}>
            + Usuario
          </button>
          <button type="button" className="ghost-btn" onClick={() => abrirVincularUsuario()}>
            Vincular existente
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {mensaje && <p className="success-message">{mensaje}</p>}

      <div className="superadmin-grid">
        <div className="admin-card superadmin-table-card">
          <div className="admin-card-header">
            <h3>Hogares</h3>
            <small>{hogares.length} hogares cargados</small>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Hogar</th>
                  <th>Usuarios</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {hogares.map((hogar) => (
                  <tr key={hogar.id}>
                    <td>
                      <strong>{hogar.nombre}</strong>
                      <small>#{hogar.id}</small>
                    </td>
                    <td>{hogar.usuarios_vinculados || 0}</td>
                    <td>
                      {Number(hogarActivoId) === Number(hogar.id) ? (
                        <span className="pill success">Activo</span>
                      ) : (
                        <span className="pill">Disponible</span>
                      )}
                    </td>
                    <td>
                      <div className="acciones-inline">
                        <button type="button" className="btn-inline" onClick={() => abrirEditarHogar(hogar)}>
                          Editar
                        </button>
                        <button type="button" className="btn-inline" onClick={() => abrirCrearUsuario(hogar.id)}>
                          Usuario
                        </button>
                        {Number(hogarActivoId) !== Number(hogar.id) && (
                          <button type="button" className="btn-inline secondary" onClick={() => onHogarSelect?.(hogar.id)}>
                            Ver
                          </button>
                        )}
                      </div>
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

        <div className="admin-card superadmin-table-card">
          <div className="admin-card-header">
            <h3>Usuarios por hogar</h3>
            <small>{usuarios.length} usuarios cargados</small>
          </div>

          <div className="superadmin-house-users">
            {usuariosPorHogar.map((hogar) => (
              <article className="house-users-card" key={hogar.id}>
                <div className="house-users-header">
                  <div>
                    <strong>{hogar.nombre}</strong>
                    <small>#{hogar.id}</small>
                  </div>
                  <button type="button" className="btn-inline" onClick={() => abrirVincularUsuario(hogar.id)}>
                    Vincular
                  </button>
                </div>

                <div className="table-wrapper compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>Rol</th>
                        <th>Global</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hogar.usuarios.map((usuario) => (
                        <tr key={`${hogar.id}-${usuario.id}`}>
                          <td>
                            <strong>{usuario.nombre}</strong>
                            <small>{usuario.correo}</small>
                          </td>
                          <td>{usuario.rol_hogar}</td>
                          <td>{usuario.rol_global}</td>
                        </tr>
                      ))}
                      {hogar.usuarios.length === 0 && (
                        <tr>
                          <td colSpan={3}>Este hogar no tiene usuarios vinculados.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}

            {usuariosSinHogar.length > 0 && (
              <article className="house-users-card">
                <div className="house-users-header">
                  <div>
                    <strong>Sin hogar</strong>
                    <small>Usuarios pendientes de asignacion</small>
                  </div>
                </div>
                {usuariosSinHogar.map((usuario) => (
                  <p className="unassigned-user" key={usuario.id}>
                    <strong>{usuario.nombre}</strong>
                    <span>{usuario.correo}</span>
                  </p>
                ))}
              </article>
            )}
          </div>
        </div>
      </div>

      {modal === 'crear-hogar' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-compact">
            <div className="modal-header">
              <h3>Crear hogar</h3>
              <button type="button" className="close-btn" onClick={cerrarModal}>x</button>
            </div>
            {modalError}
            <form className="form-grid" onSubmit={crearHogar}>
              <label className="full-width">
                Nombre del hogar
                <input value={nuevoHogar} onChange={(event) => setNuevoHogar(event.target.value)} placeholder="Ej: Colon 260" autoFocus />
              </label>
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" className="btn-inline success" disabled={loading || !nuevoHogar.trim()}>Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'editar-hogar' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-compact">
            <div className="modal-header">
              <h3>Editar hogar</h3>
              <button type="button" className="close-btn" onClick={cerrarModal}>x</button>
            </div>
            {modalError}
            <form className="form-grid" onSubmit={editarHogar}>
              <label className="full-width">
                Nombre
                <input value={hogarEditado.nombre} onChange={(event) => setHogarEditado((prev) => ({ ...prev, nombre: event.target.value }))} autoFocus />
              </label>
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" className="btn-inline success" disabled={loading || !hogarEditado.nombre.trim()}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'crear-usuario' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Crear usuario</h3>
              <button type="button" className="close-btn" onClick={cerrarModal}>x</button>
            </div>
            {modalError}
            <form className="form-grid" onSubmit={crearUsuario}>
              <label>
                Nombre
                <input value={nuevoUsuario.nombre} onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, nombre: event.target.value }))} placeholder="Nombre visible" />
              </label>
              <label>
                Email
                <input type="email" value={nuevoUsuario.email} onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, email: event.target.value }))} placeholder="mail@ejemplo.com" required autoFocus />
              </label>
              <label>
                Password inicial
                <input type="password" value={nuevoUsuario.password} onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, password: event.target.value }))} required />
              </label>
              <label>
                Hogar
                <select value={nuevoUsuario.hogar_id} onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, hogar_id: event.target.value }))}>
                  {hogares.map((hogar) => (
                    <option key={hogar.id} value={hogar.id}>{hogar.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                Rol en el hogar
                <select value={nuevoUsuario.rol} onChange={(event) => setNuevoUsuario((prev) => ({ ...prev, rol: event.target.value }))}>
                  {roles.map((rol) => (
                    <option key={rol.value} value={rol.value}>{rol.label}</option>
                  ))}
                </select>
              </label>
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" className="btn-inline success" disabled={loading || !nuevoUsuario.email.trim() || !nuevoUsuario.password.trim() || !nuevoUsuario.hogar_id}>Crear y asignar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'vincular-usuario' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-compact">
            <div className="modal-header">
              <h3>Vincular usuario</h3>
              <button type="button" className="close-btn" onClick={cerrarModal}>x</button>
            </div>
            {modalError}
            <form className="form-grid" onSubmit={vincularUsuario}>
              <label>
                Hogar
                <select value={vinculo.hogar_id} onChange={(event) => setVinculo((prev) => ({ ...prev, hogar_id: event.target.value }))}>
                  {hogares.map((hogar) => (
                    <option key={hogar.id} value={hogar.id}>{hogar.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                Usuario
                <select value={vinculo.usuario_id} onChange={(event) => setVinculo((prev) => ({ ...prev, usuario_id: event.target.value }))}>
                  {usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>{usuario.nombre} ({usuario.correo})</option>
                  ))}
                </select>
              </label>
              <label>
                Rol
                <select value={vinculo.rol} onChange={(event) => setVinculo((prev) => ({ ...prev, rol: event.target.value }))}>
                  {roles.map((rol) => (
                    <option key={rol.value} value={rol.value}>{rol.label}</option>
                  ))}
                </select>
              </label>
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" className="btn-inline success" disabled={loading || !vinculo.hogar_id || !vinculo.usuario_id}>Vincular</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
