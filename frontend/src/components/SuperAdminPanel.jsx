import { useEffect, useMemo, useState } from 'react';
import {
  createAdminHogar,
  createAdminUsuario,
  deleteAdminHogar,
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

function ActionIcon({ type }) {
  if (type === 'edit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58ZM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.33a1.003 1.003 0 0 0-1.42 0l-1.54 1.54 3.75 3.75 1.55-1.54Z" />
      </svg>
    );
  }

  if (type === 'user') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm-6 0c1.66 0 3-1.34 3-3S10.66 6 9 6 6 7.34 6 9s1.34 3 3 3Zm6 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Zm-6 0c-.41 0-.87.02-1.36.07C5.34 14.37 2 15.5 2 18v2h4v-2c0-1.16.59-2.2 1.57-3.03A9.7 9.7 0 0 1 9 14Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12v2H6V7Zm1 3h10l-1 10H8L7 10Zm3-5h4l1 1h4v2H5V6h4l1-1Z" />
    </svg>
  );
}

export default function SuperAdminPanel({ hogarActivoId, onHogaresChange, onHogarSelect }) {
  const [hogares, setHogares] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modal, setModal] = useState(null);
  const [nuevoHogar, setNuevoHogar] = useState('');
  const [hogarEditado, setHogarEditado] = useState({ id: '', nombre: '' });
  const [hogarAEliminar, setHogarAEliminar] = useState(null);
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
  const resumenAdmin = useMemo(
    () => ({
      hogares: hogares.length,
      usuarios: usuarios.length,
      hogaresActivos: usuariosPorHogar.filter((hogar) => hogar.usuarios.length > 0).length,
      usuariosSinHogar: usuariosSinHogar.length
    }),
    [hogares.length, usuarios.length, usuariosPorHogar, usuariosSinHogar.length]
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

  const abrirEliminarHogar = (hogar) => {
    setHogarAEliminar(hogar);
    setModal('eliminar-hogar');
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
    setHogarAEliminar(null);
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

  const eliminarHogar = async () => {
    if (!hogarAEliminar?.id) return;

    const hogaresRestantes = hogares.filter((hogar) => Number(hogar.id) !== Number(hogarAEliminar.id));

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await deleteAdminHogar(hogarAEliminar.id);

      if (Number(hogarActivoId) === Number(hogarAEliminar.id)) {
        onHogarSelect?.(hogaresRestantes[0]?.id || '');
      }

      setMensaje('Hogar eliminado correctamente.');
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

      <div className="superadmin-summary-grid">
        <article className="superadmin-summary-card">
          <span>Hogares</span>
          <strong>{resumenAdmin.hogares}</strong>
          <small>Espacios creados para organizar la app</small>
        </article>
        <article className="superadmin-summary-card">
          <span>Usuarios</span>
          <strong>{resumenAdmin.usuarios}</strong>
          <small>Personas cargadas en el sistema</small>
        </article>
        <article className="superadmin-summary-card">
          <span>Hogares con usuarios</span>
          <strong>{resumenAdmin.hogaresActivos}</strong>
          <small>Hogares que ya tienen miembros vinculados</small>
        </article>
        <article className="superadmin-summary-card">
          <span>Sin hogar</span>
          <strong>{resumenAdmin.usuariosSinHogar}</strong>
          <small>Usuarios pendientes de asignacion</small>
        </article>
      </div>

      <div className="superadmin-grid">
        <div className="admin-card superadmin-table-card">
          <div className="admin-card-header">
            <div>
              <h3>Hogares</h3>
              <small>Administracion general de hogares y acceso rapido al contexto activo.</small>
            </div>
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
                      {Number(hogar.id) === 1 ? (
                        <span className="pill muted">Protegido</span>
                      ) : Number(hogarActivoId) === Number(hogar.id) ? (
                        <span className="pill success">Activo</span>
                      ) : (
                        <span className="pill">Disponible</span>
                      )}
                    </td>
                    <td>
                      <div className="acciones-inline acciones-inline-iconos">
                        <button
                          type="button"
                          className="btn-inline icon-btn"
                          onClick={() => abrirEditarHogar(hogar)}
                          aria-label={`Editar ${hogar.nombre}`}
                          title="Editar hogar"
                        >
                          <ActionIcon type="edit" />
                        </button>
                        <button
                          type="button"
                          className="btn-inline icon-btn"
                          onClick={() => abrirCrearUsuario(hogar.id)}
                          aria-label={`Crear usuario en ${hogar.nombre}`}
                          title="Crear usuario en este hogar"
                        >
                          <ActionIcon type="user" />
                        </button>
                        <button
                          type="button"
                          className="btn-inline danger ghost-btn icon-btn"
                          disabled={Number(hogar.id) === 1}
                          onClick={() => abrirEliminarHogar(hogar)}
                          aria-label={`Eliminar ${hogar.nombre}`}
                          title={Number(hogar.id) === 1 ? 'Hogar protegido' : 'Eliminar hogar'}
                        >
                          <ActionIcon type="delete" />
                        </button>
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
            <div>
              <h3>Usuarios por hogar</h3>
              <small>Vista agrupada para entender rapido quienes acceden a cada hogar.</small>
            </div>
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

      {modal === 'eliminar-hogar' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-compact confirm-modal">
            <div className="modal-header">
              <h3>Eliminar hogar</h3>
              <button type="button" className="close-btn" onClick={cerrarModal}>x</button>
            </div>
            {modalError}
            <div className="confirm-copy">
              <strong>{hogarAEliminar?.nombre}</strong>
              <p>
                Se van a borrar sus configuraciones basicas y las vinculaciones de usuarios. Si el hogar tiene movimientos,
                valores fijos o cierres, la eliminacion se bloquea para proteger la informacion.
              </p>
            </div>
            <div className="confirm-actions full-width">
              <button type="button" className="btn-inline secondary" onClick={cerrarModal}>Cancelar</button>
              <button type="button" className="btn-inline danger" onClick={eliminarHogar} disabled={loading || !hogarAEliminar?.id}>
                Eliminar hogar
              </button>
            </div>
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
