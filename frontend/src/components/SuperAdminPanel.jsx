import { useEffect, useMemo, useState } from 'react';
import {
  createAdminHogar,
  createAdminUsuario,
  deleteAdminHogar,
  getAdminHogares,
  getAdminUsuarios,
  deleteMiembroHogar,
  updateAdminUsuario,
  updateAdminUsuarioPassword,
  updateAdminHogar,
  updateMiembroHogar,
  vincularAdminUsuarioHogar
} from '../services/api.js';
import PasswordSetupForm from './PasswordSetupForm.jsx';

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

const sortDefaults = {
  campo: 'creado_en',
  direccion: 'desc'
};

const userGlobalRoles = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'hogar_admin', label: 'Hogar admin' },
  { value: 'hogar_member', label: 'Hogar member' }
];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

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
  const [usuariosSort, setUsuariosSort] = useState(sortDefaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modal, setModal] = useState(null);
  const [nuevoHogar, setNuevoHogar] = useState('');
  const [hogarEditado, setHogarEditado] = useState({ id: '', nombre: '' });
  const [hogarAEliminar, setHogarAEliminar] = useState(null);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [usuarioEditandoOriginal, setUsuarioEditandoOriginal] = useState(null);
  const [passwordChangeNow, setPasswordChangeNow] = useState(false);
  const [passwordForceChange, setPasswordForceChange] = useState(false);
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
  const usuariosOrdenados = useMemo(() => {
    const items = [...usuarios];
    const { campo, direccion } = usuariosSort;
    const factor = direccion === 'asc' ? 1 : -1;

    const getSortValue = (usuario) => {
      if (campo === 'hogares') return (usuario.hogares || []).length;
      if (campo === 'creado_en') return Date.parse(usuario.creado_en || '') || 0;
      if (campo === 'password') return Number(Boolean(usuario.force_password_change));
      if (campo === 'activo') return Number(Boolean(usuario.activo));
      if (campo === 'rol_global') return String(usuario.rol_global || '');
      return String(usuario.nombre || '');
    };

    items.sort((a, b) => {
      const av = getSortValue(a);
      const bv = getSortValue(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv), 'es-AR') * factor;
    });

    return items;
  }, [usuarios, usuariosSort]);
  const resumenAdmin = useMemo(
    () => ({
      hogares: hogares.length,
      usuarios: usuarios.length,
      hogaresActivos: usuariosPorHogar.filter((hogar) => hogar.usuarios.length > 0).length,
      usuariosSinHogar: usuariosSinHogar.length
    }),
    [hogares.length, usuarios.length, usuariosPorHogar, usuariosSinHogar.length]
  );
  const modalError = modal && modal !== 'password-usuario' && error ? <p className="error full-width">{error}</p> : null;
  const modalUsuarioError = modal === 'editar-usuario' && error ? <p className="error full-width">{error}</p> : null;

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

  const abrirEditarUsuario = (usuario) => {
    const hogaresUsuario = (usuario.hogares || []).map((hogar) => ({
      id: Number(hogar.id),
      nombre: hogar.nombre,
      rol: hogar.rol || 'hogar_member',
      asignado: true
    }));
    const hogaresIniciales = hogares.map((hogar) => {
      const actual = (usuario.hogares || []).find((item) => Number(item.id) === Number(hogar.id));
      return {
        id: Number(hogar.id),
        nombre: hogar.nombre,
        rol: actual?.rol || 'hogar_member',
        asignado: Boolean(actual)
      };
    });

    setUsuarioEditando({
      id: Number(usuario.id),
      nombre: usuario.nombre || '',
      correo: usuario.correo || '',
      rol_global: usuario.rol_global || 'hogar_member',
      activo: Boolean(usuario.activo),
      force_password_change: Boolean(usuario.force_password_change),
      creado_en: usuario.creado_en || '',
      hogares: hogaresIniciales
    });
    setUsuarioEditandoOriginal({
      id: Number(usuario.id),
      correo: usuario.correo || '',
      hogares: hogaresUsuario
    });
    setPasswordChangeNow(false);
    setPasswordForceChange(Boolean(usuario.force_password_change));
    setError('');
    setModal('editar-usuario');
  };

  const cerrarModal = () => {
    setModal(null);
    setError('');
    setHogarAEliminar(null);
    setUsuarioEditando(null);
    setUsuarioEditandoOriginal(null);
    setPasswordChangeNow(false);
    setPasswordForceChange(false);
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

  const toggleUsuarioSort = (campo) => {
    setUsuariosSort((prev) => ({
      campo,
      direccion: prev.campo === campo ? (prev.direccion === 'asc' ? 'desc' : 'asc') : (campo === 'creado_en' ? 'desc' : 'asc')
    }));
  };

  const sortIndicator = (campo) => (usuariosSort.campo === campo ? (usuariosSort.direccion === 'asc' ? ' ▲' : ' ▼') : '');

  const actualizarUsuarioEditando = (campo, value) => {
    setUsuarioEditando((prev) => (prev ? { ...prev, [campo]: value } : prev));
  };

  const actualizarHogarUsuarioEditando = (hogarId, cambios) => {
    setUsuarioEditando((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        hogares: prev.hogares.map((hogar) => (Number(hogar.id) === Number(hogarId) ? { ...hogar, ...cambios } : hogar))
      };
    });
  };

  const guardarUsuarioEditado = async (event) => {
    event.preventDefault();
    if (!usuarioEditando?.id) return;

    try {
      setLoading(true);
      setError('');
      setMensaje('');

      await updateAdminUsuario(usuarioEditando.id, {
        nombre: usuarioEditando.nombre.trim(),
        email: usuarioEditando.correo.trim(),
        rol_global: usuarioEditando.rol_global,
        activo: Boolean(usuarioEditando.activo),
        force_password_change: Boolean(passwordForceChange)
      });

      const originales = new Map((usuarioEditandoOriginal?.hogares || []).map((hogar) => [Number(hogar.id), hogar]));

      for (const hogar of usuarioEditando.hogares || []) {
        const hogarId = Number(hogar.id);
        const estabaAsignado = originales.has(hogarId);
        const quiereAsignado = Boolean(hogar.asignado);
        const rolDeseado = hogar.rol || 'hogar_member';

        if (quiereAsignado && !estabaAsignado) {
          await vincularAdminUsuarioHogar(hogarId, {
            usuario_id: Number(usuarioEditando.id),
            rol: rolDeseado
          });
        } else if (quiereAsignado && estabaAsignado) {
          const original = originales.get(hogarId);
          if (original?.rol !== rolDeseado) {
            await updateMiembroHogar(hogarId, usuarioEditando.id, { rol: rolDeseado });
          }
        } else if (!quiereAsignado && estabaAsignado) {
          await deleteMiembroHogar(hogarId, usuarioEditando.id);
        }
      }

      setMensaje('Usuario actualizado correctamente.');
      setUsuarioEditandoOriginal({
        id: Number(usuarioEditando.id),
        correo: usuarioEditando.correo.trim(),
        hogares: (usuarioEditando.hogares || [])
          .filter((hogar) => hogar.asignado)
          .map((hogar) => ({
            id: Number(hogar.id),
            nombre: hogar.nombre,
            rol: hogar.rol || 'hogar_member'
          }))
      });
      await cargarAdmin();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const guardarPasswordUsuario = async ({ password }) => {
    if (!usuarioEditando?.id) return;
    if (!passwordChangeNow && !passwordForceChange) {
      setError('Elegí al menos una acción para la password.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setMensaje('');
      await updateAdminUsuarioPassword(usuarioEditando.id, {
        password: passwordChangeNow ? password : '',
        force_password_change: passwordForceChange
      });
      setMensaje('Configuracion de password actualizada.');
      setPasswordChangeNow(false);
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

        <div className="admin-card superadmin-table-card full-span">
          <div className="admin-card-header">
            <div>
              <h3>Usuarios del sistema</h3>
              <small>Desde aca podes editar todo el usuario, incluyendo password y hogares vinculados.</small>
            </div>
            <small>{usuarios.length} usuarios</small>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleUsuarioSort('nombre')}>
                    Usuario{sortIndicator('nombre')}
                  </th>
                  <th className="sortable" onClick={() => toggleUsuarioSort('hogares')}>
                    Hogares{sortIndicator('hogares')}
                  </th>
                  <th className="sortable" onClick={() => toggleUsuarioSort('rol_global')}>
                    Rol global{sortIndicator('rol_global')}
                  </th>
                  <th className="sortable" onClick={() => toggleUsuarioSort('creado_en')}>
                    Creado{sortIndicator('creado_en')}
                  </th>
                  <th className="sortable" onClick={() => toggleUsuarioSort('password')}>
                    Password{sortIndicator('password')}
                  </th>
                  <th className="sortable" onClick={() => toggleUsuarioSort('activo')}>
                    Estado{sortIndicator('activo')}
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosOrdenados.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>
                      <strong>{usuario.nombre}</strong>
                      <small>{usuario.correo}</small>
                    </td>
                    <td>
                      <div className="admin-user-hogares">
                        {(usuario.hogares || []).map((hogar) => (
                          <span key={`${usuario.id}-${hogar.id}`} className="pill">
                            {hogar.nombre}
                          </span>
                        ))}
                        {(usuario.hogares || []).length === 0 && <span className="pill muted">Sin hogar</span>}
                      </div>
                    </td>
                    <td>{usuario.rol_global}</td>
                    <td>{formatDateTime(usuario.creado_en)}</td>
                    <td>
                      {usuario.force_password_change ? (
                        <span className="pill muted">Cambio pendiente</span>
                      ) : (
                        <span className="pill success">OK</span>
                      )}
                    </td>
                    <td>{usuario.activo ? <span className="pill success">Activo</span> : <span className="pill muted">Inactivo</span>}</td>
                    <td>
                      <div className="acciones-inline">
                        <button
                          type="button"
                          className="btn-inline icon-btn"
                          onClick={() => abrirEditarUsuario(usuario)}
                          aria-label={`Editar ${usuario.nombre}`}
                          title="Editar usuario"
                        >
                          <ActionIcon type="edit" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {usuarios.length === 0 && (
                  <tr>
                    <td colSpan={7}>No hay usuarios cargados.</td>
                  </tr>
                )}
              </tbody>
            </table>
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
          <div className="modal-content modal-compact modal-vincular-usuario">
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
              <label className="full-width">
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

      {modal === 'editar-usuario' && usuarioEditando && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-user-edit">
            <div className="modal-header">
              <h3>Editar usuario</h3>
              <button type="button" className="close-btn" onClick={cerrarModal}>x</button>
            </div>
            {modalUsuarioError}
            <div className="password-admin-summary">
              <strong>{usuarioEditando.nombre}</strong>
              <small>{usuarioEditando.correo}</small>
              <small>Creado: {formatDateTime(usuarioEditando.creado_en)}</small>
            </div>

            <div className="user-edit-layout">
              <form id="user-edit-form" className="user-edit-form admin-surface-card" onSubmit={guardarUsuarioEditado}>
                <div className="admin-card-header">
                  <div>
                    <h3>Datos del usuario</h3>
                    <small>Edita identidad, estado y acceso general.</small>
                  </div>
                </div>

                <div className="form-grid">
                  <label>
                    Nombre
                    <input
                      value={usuarioEditando.nombre}
                      onChange={(event) => actualizarUsuarioEditando('nombre', event.target.value)}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={usuarioEditando.correo}
                      onChange={(event) => actualizarUsuarioEditando('correo', event.target.value)}
                    />
                  </label>
                  <label>
                    Rol global
                    <select
                      value={usuarioEditando.rol_global}
                      onChange={(event) => actualizarUsuarioEditando('rol_global', event.target.value)}
                    >
                      {userGlobalRoles.map((rol) => (
                        <option key={rol.value} value={rol.value}>
                          {rol.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Estado
                    <select
                      value={usuarioEditando.activo ? 'true' : 'false'}
                      onChange={(event) => actualizarUsuarioEditando('activo', event.target.value === 'true')}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </label>
                </div>

                <div className="admin-card compact-table user-home-access">
                  <div className="admin-card-header">
                    <div>
                      <h3>Hogares</h3>
                      <small>Marca a que hogares pertenece y con que rol opera en cada uno.</small>
                    </div>
                  </div>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Asignado</th>
                          <th>Hogar</th>
                          <th>Rol</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(usuarioEditando.hogares || []).map((hogar) => (
                          <tr key={hogar.id}>
                            <td>
                              <label className="home-access-check">
                                <input
                                  type="checkbox"
                                  checked={Boolean(hogar.asignado)}
                                  onChange={(event) => actualizarHogarUsuarioEditando(hogar.id, { asignado: event.target.checked })}
                                />
                              </label>
                            </td>
                            <td>{hogar.nombre}</td>
                            <td>
                              <select
                                value={hogar.rol}
                                disabled={!hogar.asignado}
                                onChange={(event) => actualizarHogarUsuarioEditando(hogar.id, { rol: event.target.value })}
                              >
                                {roles.map((rol) => (
                                  <option key={rol.value} value={rol.value}>
                                    {rol.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </form>

              <div className="password-admin-shell admin-surface-card">
                <div className="admin-card-header">
                  <div>
                    <h3>Password</h3>
                    <small>Redefine la clave o deja preparado el cambio para el proximo ingreso.</small>
                  </div>
                </div>

                <div className="password-admin-option-list">
                  <label className="password-admin-toggle">
                    <input type="checkbox" checked={passwordChangeNow} onChange={(event) => setPasswordChangeNow(event.target.checked)} />
                    <span>
                      <strong>Definir nueva password</strong>
                      <small>Guarda una clave nueva ahora mismo.</small>
                    </span>
                  </label>

                  <label className="password-admin-toggle">
                    <input
                      type="checkbox"
                      checked={passwordForceChange}
                      onChange={(event) => setPasswordForceChange(event.target.checked)}
                    />
                    <span>
                      <strong>Forzar cambio al ingresar</strong>
                      <small>Le pedira actualizar la clave en el proximo login.</small>
                    </span>
                  </label>
                </div>

                {passwordChangeNow ? (
                  <div className="password-admin-form-card">
                    <PasswordSetupForm
                      title="Nueva password"
                      subtitle="La clave se guarda directamente para este usuario."
                      submitLabel="Guardar password"
                      loading={loading}
                      error={error}
                      onSubmit={guardarPasswordUsuario}
                    />
                  </div>
                ) : (
                  <div className="password-admin-actions">
                    <p>Si no cambias la clave ahora, igual puedes guardar solo el cambio forzado.</p>
                    <button
                      type="button"
                      className="btn-inline success"
                      disabled={loading || !passwordForceChange}
                      onClick={() => guardarPasswordUsuario({ password: '' })}
                    >
                      Guardar configuracion de password
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer-actions">
              <button type="button" className="btn-inline secondary" onClick={cerrarModal}>Cancelar</button>
              <button type="submit" form="user-edit-form" className="btn-inline success" disabled={loading}>
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
