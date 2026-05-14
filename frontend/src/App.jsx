import { useEffect, useMemo, useRef, useState } from 'react';
import {
  changeOwnPassword,
  clearSession,
  createAjusteGastoFijo,
  cerrarCiclo,
  createGastoFijo,
  createMovimiento,
  deleteGastoFijoEnCiclo,
  deleteMovimiento,
  getCategorias,
  getAjustesGastoFijo,
  getCurrentUser,
  getEstadoCierreCiclo,
  getCotizaciones,
  getGastosFijos,
  getGastosFijosRango,
  getHogares,
  forgotPassword,
  getMovimientos,
  getMovimientosRango,
  getTarjetasCredito,
  getStoredSession,
  login,
  reabrirCiclo,
  resetPasswordWithToken,
  saveSession,
  updateGastoFijo,
  validateResetPasswordToken,
  updateEstadoGastoFijoEnCiclo,
  updateMovimiento
} from './services/api.js';
import ResumenCards from './components/ResumenCards.jsx';
import MovimientosTable from './components/MovimientosTable.jsx';
import NuevoMovimientoForm from './components/NuevoMovimientoForm.jsx';
import MenuLateral from './components/MenuLateral.jsx';
import MonthPicker from './components/MonthPicker.jsx';
import CotizacionesPanel from './components/CotizacionesPanel.jsx';
import GastosFijosPanel from './components/GastosFijosPanel.jsx';
import ReportesPanel from './components/ReportesPanel.jsx';
import AhorrosPanel from './components/AhorrosPanel.jsx';
import TarjetaCreditoPanel from './components/TarjetaCreditoPanel.jsx';
import DecisionesPanel from './components/DecisionesPanel.jsx';
import LoginPanel from './components/LoginPanel.jsx';
import PasswordSetupForm from './components/PasswordSetupForm.jsx';
import ResetPasswordPanel from './components/ResetPasswordPanel.jsx';
import SuperAdminPanel from './components/SuperAdminPanel.jsx';
import ConfiguracionPanel from './components/ConfiguracionPanel.jsx';
import HogarAdminPanel from './components/HogarAdminPanel.jsx';
import GastoRapidoModal from './components/GastoRapidoModal.jsx';
import {
  agruparEgresosConfirmadosPorCategoria,
  construirMovimientosConsolidadosDelCiclo,
  construirSerieResumenMensualConsolidada,
  derivarResumenFinanciero,
  derivarResumenOperativo,
  getEstadoMovimientoConsolidado
} from './utils/financials.js';
import { getCycleContext } from './utils/cycle.js';
import { calcularNivelControlCiclo } from './utils/cycleControl.js';
import { getAnalysisConfidence } from './utils/analysisConfidence.js';
import { formatDecimalInput, parseDecimalInput, sanitizeDecimalInput } from './utils/numberFormat.js';

const THEME_STORAGE_KEY = 'finanzapp_theme';
const DASHBOARD_AMOUNTS_HIDDEN_STORAGE_KEY = 'finanzapp_dashboard_amounts_hidden';
const MONEY_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

function formatMoneyText(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', MONEY_FORMAT)}`;
}

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalIsoCycle(date = new Date()) {
  return getLocalIsoDate(date).slice(0, 7);
}

function getNextIsoCycle(ciclo) {
  const [anioTexto, mesTexto] = String(ciclo || '').split('-');
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return getLocalIsoCycle();
  }
  const fecha = new Date(anio, mes, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function formatCycleMonth(ciclo) {
  const fecha = new Date(`${ciclo}-01T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return 'próximo ciclo';
  return fecha.toLocaleDateString('es-AR', { month: 'long' });
}

function getStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getStoredDashboardAmountsHidden() {
  try {
    return window.localStorage.getItem(DASHBOARD_AMOUNTS_HIDDEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getAuthRouteState() {
  if (typeof window === 'undefined') {
    return { view: 'login', token: '' };
  }

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const token = new URLSearchParams(window.location.search).get('token') || '';

  if (path === '/reset-password') {
    return { view: 'reset-password', token };
  }

  return { view: 'login', token: '' };
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className={`app-toast ${toast.type}`} role="status" key={toast.id}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Cerrar aviso">
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function ButtonSpinner() {
  return <span className="btn-spinner" aria-hidden="true" />;
}

export default function App() {
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [dashboardAmountsHidden, setDashboardAmountsHidden] = useState(() => getStoredDashboardAmountsHidden());
  const [session, setSession] = useState(() => getStoredSession());
  const [authLoading, setAuthLoading] = useState(() => Boolean(getStoredSession()?.token));
  const [authError, setAuthError] = useState('');
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');
  const [authRoute, setAuthRoute] = useState(() => getAuthRouteState());
  const [resetPasswordValidating, setResetPasswordValidating] = useState(false);
  const [resetPasswordValid, setResetPasswordValid] = useState(false);
  const [passwordUpdateError, setPasswordUpdateError] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [dashboardMovimientosExpandido, setDashboardMovimientosExpandido] = useState(false);
  const [gastosFijos, setGastosFijos] = useState([]);
  const [gastosFijosHistoricosPorCiclo, setGastosFijosHistoricosPorCiclo] = useState({});
  const [movimientosHistoricos, setMovimientosHistoricos] = useState([]);
  const [estimadoTarjetasProximoCiclo, setEstimadoTarjetasProximoCiclo] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cycleActionLoading, setCycleActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const dataLoadIdRef = useRef(0);
  const actionLockRef = useRef(false);
  const [openModal, setOpenModal] = useState(false);
  const [gastoRapidoAbierto, setGastoRapidoAbierto] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [modoModal, setModoModal] = useState('crear');
  const [movimientoEditando, setMovimientoEditando] = useState(null);
  const [menuCollapsed, setMenuCollapsed] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [seccionActiva, setSeccionActiva] = useState('dashboard');
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [cicloSeleccionado, setCicloSeleccionado] = useState(getLocalIsoCycle());
  const [fijoEditModal, setFijoEditModal] = useState(null);
  const [fijoEditForm, setFijoEditForm] = useState({
    gasto_fijo_id: null,
    descripcion: '',
    categoria_id: '',
    moneda: 'ARS',
    monto_base: '',
    dia_vencimiento: '',
    monto_ciclo: ''
  });
  const [filtrosGrilla, setFiltrosGrilla] = useState({
    fechaDesde: '',
    fechaHasta: '',
    tipoMovimiento: '',
    categoria: '',
    busqueda: ''
  });
  const [ordenGrilla, setOrdenGrilla] = useState({
    campo: 'registro',
    direccion: 'desc',
    manual: true
  });
  const [estadoOverrides, setEstadoOverrides] = useState({});
  const [reporteActivo, setReporteActivo] = useState('mensual');
  const [cierreCicloAbierto, setCierreCicloAbierto] = useState(false);
  const [saldoRealFinal, setSaldoRealFinal] = useState('');
  const [generarSaldoInicial, setGenerarSaldoInicial] = useState(true);
  const [estadoCierreCiclo, setEstadoCierreCiclo] = useState({ cerrado: false, cierre: null });
  const [hogaresDisponibles, setHogaresDisponibles] = useState([]);
  const [hogarSeleccionadoId, setHogarSeleccionadoId] = useState('');
  const hogaresSesion = session?.usuario?.hogares || [];
  const isSuperadmin = session?.usuario?.rol_global === 'superadmin';
  const hogaresContexto = isSuperadmin && hogaresDisponibles.length > 0 ? hogaresDisponibles : hogaresSesion;
  const hogarActivo =
    hogaresContexto.find((hogar) => Number(hogar.id) === Number(hogarSeleccionadoId)) ||
    hogaresContexto.find((hogar) => Number(hogar.id) === Number(session?.usuario?.hogar_id)) ||
    hogaresContexto[0] ||
    (session?.usuario?.hogar_id
      ? { id: session.usuario.hogar_id, nombre: session.usuario.hogar_nombre || 'Hogar', rol: session.usuario.rol }
      : null);
  const hogarId = Number(hogarActivo?.id || 1);
  const usuarioId = Number(session?.usuario?.id || 1);
  const rolActivo = session?.usuario?.rol_global === 'superadmin' ? 'superadmin' : hogarActivo?.rol || session?.usuario?.rol;
  const canManageHome = rolActivo === 'superadmin' || rolActivo === 'hogar_admin';
  const canOperateHome = canManageHome || rolActivo === 'hogar_member';
  const canAccessFixedValues = canOperateHome;
  const canSwitchHogar = hogaresContexto.length > 1;
  const mostrarAccionesCiclo = seccionActiva === 'dashboard' || seccionActiva === 'movimientos';

  const ciclosTendencia = useMemo(() => {
    const [anioTexto, mesTexto] = cicloSeleccionado.split('-');
    const anio = Number(anioTexto);
    const mes = Number(mesTexto) - 1;

    return Array.from({ length: 12 }, (_, index) => {
      const fecha = new Date(anio, mes - 11 + index, 1);
      return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    });
  }, [cicloSeleccionado]);

  const getEstadoMovimiento = (mov) => {
    return getEstadoMovimientoConsolidado(mov, estadoOverrides);
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const addToast = ({ type = 'success', message }) => {
    if (!message) return;
    toastIdRef.current += 1;
    const id = `${Date.now()}-${toastIdRef.current}`;
    setToasts((prev) => [...prev, { id, type, message }].slice(-4));
    window.setTimeout(() => dismissToast(id), type === 'error' ? 6500 : 5000);
  };

  const beginAction = (cycleAction = false) => {
    if (actionLockRef.current) return false;
    actionLockRef.current = true;
    setLoading(true);
    if (cycleAction) setCycleActionLoading(true);
    return true;
  };

  const endAction = () => {
    actionLockRef.current = false;
    setLoading(false);
    setCycleActionLoading(false);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Si localStorage no esta disponible, el tema sigue funcionando en memoria.
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_AMOUNTS_HIDDEN_STORAGE_KEY, String(dashboardAmountsHidden));
    } catch {
      // Si localStorage no esta disponible, la preferencia sigue funcionando en memoria.
    }
  }, [dashboardAmountsHidden]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (accountMenuRef.current?.contains(event.target)) return;
      setAccountMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    const handlePopState = () => {
      setAuthRoute(getAuthRouteState());
      setAuthError('');
      setForgotPasswordMessage('');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const cargarHogaresContexto = async () => {
    if (!session) return;

    try {
      const data = await getHogares();
      const items = data.items || [];
      setHogaresDisponibles(items);
      setHogarSeleccionadoId((actual) => {
        if (actual && items.some((hogar) => Number(hogar.id) === Number(actual))) return actual;
        return String(session.usuario?.hogar_id || items[0]?.id || '');
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleEstadoMovimiento = async (mov) => {
    const estadoActual = getEstadoMovimiento(mov);
    let siguiente = estadoActual;

    if (mov.tipo_movimiento === 'egreso') {
      siguiente = estadoActual === 'pagado' ? 'pendiente' : 'pagado';
    } else if (['ingreso', 'ahorro'].includes(mov.tipo_movimiento)) {
      siguiente = estadoActual === 'registrado' ? 'proyectado' : 'registrado';
    } else {
      return;
    }
    if (!beginAction()) return;

    setEstadoOverrides((prev) => ({ ...prev, [mov.id]: siguiente }));

    try {
      setError('');
      if (mov.esProyectado) {
        if (mov.tipo_movimiento === 'egreso') {
          await updateEstadoGastoFijoEnCiclo(mov.gasto_fijo_id, {
            ciclo: cicloSeleccionado,
            estado_egreso: siguiente
          });
        } else if (['ingreso', 'ahorro'].includes(mov.tipo_movimiento)) {
          await updateEstadoGastoFijoEnCiclo(mov.gasto_fijo_id, {
            ciclo: cicloSeleccionado,
            estado_ingreso: siguiente
          });
        }
      } else if (mov.tipo_movimiento === 'egreso') {
        await updateMovimiento(mov.id, { estado_egreso: siguiente });
      } else if (['ingreso', 'ahorro'].includes(mov.tipo_movimiento)) {
        await updateMovimiento(mov.id, { estado_ingreso: siguiente });
      }
      await cargarDatos();
      addToast({ message: 'Estado actualizado.' });
    } catch (err) {
      setEstadoOverrides((prev) => ({ ...prev, [mov.id]: estadoActual }));
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo actualizar el estado.' });
    } finally {
      endAction();
    }
  };

  const cargarDatos = async () => {
    const loadId = dataLoadIdRef.current + 1;
    dataLoadIdRef.current = loadId;
    setDataLoading(true);
    try {
      setError('');
      const [anioTexto, mesTexto] = cicloSeleccionado.split('-');
      const anio = Number(anioTexto);
      const mes = Number(mesTexto) - 1;
      const inicioRango = new Date(anio, mes - 11, 1);
      const finRango = new Date(anio, mes + 1, 0);
      const desdeHistorico = `${inicioRango.getFullYear()}-${String(inicioRango.getMonth() + 1).padStart(2, '0')}-01`;
      const hastaHistorico = `${finRango.getFullYear()}-${String(finRango.getMonth() + 1).padStart(2, '0')}-${String(finRango.getDate()).padStart(2, '0')}`;
      const cicloDesdeHistorico = ciclosTendencia[0];
      const cicloHastaHistorico = ciclosTendencia[ciclosTendencia.length - 1];
      const cicloEstimadoTarjetas = getNextIsoCycle(getLocalIsoCycle());

      const [movData, catData, cotiData, gastosData, historicoData, cierreData, gastosHistoricosData, tarjetasEstimadoData] = await Promise.allSettled([
        getMovimientos(hogarId, mostrarEliminados, cicloSeleccionado),
        getCategorias(hogarId),
        getCotizaciones(),
        getGastosFijos(hogarId, cicloSeleccionado),
        getMovimientosRango(hogarId, desdeHistorico, hastaHistorico, mostrarEliminados),
        getEstadoCierreCiclo(hogarId, cicloSeleccionado),
        getGastosFijosRango(hogarId, cicloDesdeHistorico, cicloHastaHistorico),
        getTarjetasCredito(hogarId, cicloEstimadoTarjetas)
      ]);

      if (movData.status === 'fulfilled') setMovimientos(movData.value.items || []);
      if (catData.status === 'fulfilled') setCategorias(catData.value.items || []);
      if (cotiData.status === 'fulfilled') setCotizaciones(cotiData.value.items || []);
      if (gastosData.status === 'fulfilled') setGastosFijos(gastosData.value.items || []);
      if (historicoData.status === 'fulfilled') setMovimientosHistoricos(historicoData.value.items || []);
      if (cierreData.status === 'fulfilled') setEstadoCierreCiclo(cierreData.value || { cerrado: false, cierre: null });
      if (gastosHistoricosData.status === 'fulfilled') {
        const porCiclo = gastosHistoricosData.value.por_ciclo || {};
        setGastosFijosHistoricosPorCiclo(Object.fromEntries(ciclosTendencia.map((ciclo) => [ciclo, porCiclo[ciclo] || []])));
      }
      if (tarjetasEstimadoData.status === 'fulfilled') {
        const totalArs = Number(tarjetasEstimadoData.value?.resumen_todas_tarjetas?.total_ars || 0);
        setEstimadoTarjetasProximoCiclo(totalArs > 0 ? { ciclo: cicloEstimadoTarjetas, totalArs } : null);
      } else {
        setEstimadoTarjetasProximoCiclo(null);
      }

      const errores = [movData, catData, cotiData, gastosData, historicoData, cierreData, gastosHistoricosData, tarjetasEstimadoData].filter(
        (r) => r.status === 'rejected'
      );
      if (errores.length > 0) {
        setError(errores[0].reason?.message || 'Hubo errores parciales al cargar el dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (dataLoadIdRef.current === loadId) setDataLoading(false);
    }
  };

  const handleCicloSeleccionado = (ciclo) => {
    if (!ciclo || ciclo === cicloSeleccionado) return;
    setDataLoading(true);
    setCicloSeleccionado(ciclo);
  };

  useEffect(() => {
    let activo = true;
    const stored = getStoredSession();

    if (!stored?.token) {
      setAuthLoading(false);
      return () => {
        activo = false;
      };
    }

    getCurrentUser()
      .then((data) => {
        if (!activo) return;
        const refreshedSession = { token: stored.token, usuario: data.usuario || stored.usuario };
        saveSession(refreshedSession);
        setSession(refreshedSession);
        setAuthError('');
      })
      .catch(() => {
        if (!activo) return;
        clearSession();
        setSession(null);
      })
      .finally(() => {
        if (activo) setAuthLoading(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (session || authRoute.view !== 'reset-password') return undefined;

    let activo = true;

    if (!authRoute.token) {
      setResetPasswordValid(false);
      setAuthError('Token invalido o inexistente');
      return () => {
        activo = false;
      };
    }

    setResetPasswordValidating(true);
    setAuthError('');

    validateResetPasswordToken(authRoute.token)
      .then((data) => {
        if (!activo) return;
        setResetPasswordValid(Boolean(data.valid));
        setAuthError(data.valid ? '' : data.error || 'Token invalido o inexistente');
      })
      .catch((err) => {
        if (!activo) return;
        setResetPasswordValid(false);
        setAuthError(err.message);
      })
      .finally(() => {
        if (activo) setResetPasswordValidating(false);
      });

    return () => {
      activo = false;
    };
  }, [session, authRoute]);

  useEffect(() => {
    if (!session) return;
    cargarDatos();
  }, [mostrarEliminados, cicloSeleccionado, ciclosTendencia, session, hogarId]);

  useEffect(() => {
    if (!session) return;
    cargarHogaresContexto();
  }, [session]);

  useEffect(() => {
    if (!session || hogarSeleccionadoId) return;
    const hogarInicial = session.usuario?.hogar_id || hogaresContexto[0]?.id;
    if (hogarInicial) setHogarSeleccionadoId(String(hogarInicial));
  }, [session, hogaresContexto, hogarSeleccionadoId]);

  useEffect(() => {
    setMovimientos([]);
    setGastosFijos([]);
    setGastosFijosHistoricosPorCiclo({});
    setMovimientosHistoricos([]);
    setEstadoOverrides({});
    setEstadoCierreCiclo({ cerrado: false, cierre: null });
  }, [hogarId]);

  useEffect(() => {
    setDashboardMovimientosExpandido(false);
  }, [hogarId, cicloSeleccionado]);

  useEffect(() => {
    if (!canAccessFixedValues && seccionActiva === 'gastos_fijos') {
      setSeccionActiva('dashboard');
    }
    if (!isSuperadmin && seccionActiva === 'superadmin') {
      setSeccionActiva('dashboard');
    }
    if (canManageHome && seccionActiva === 'configuracion') {
      setSeccionActiva('mi_hogar');
    }
    if (!canManageHome && ['configuracion', 'mi_hogar', 'categorias'].includes(seccionActiva)) {
      setSeccionActiva('dashboard');
    }
  }, [canAccessFixedValues, canManageHome, isSuperadmin, seccionActiva]);

  const handleLogin = async ({ email, password }) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      setForgotPasswordMessage('');
      const data = await login(email, password);
      const nextSession = { token: data.token, usuario: data.usuario };
      saveSession(nextSession);
      setSession(nextSession);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async ({ email }) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      const data = await forgotPassword(email);
      setForgotPasswordMessage(data.mensaje || 'Si el email existe, vas a recibir instrucciones para restablecer la password.');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const goToLogin = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
    setAuthRoute({ view: 'login', token: '' });
    setResetPasswordValid(false);
    setResetPasswordValidating(false);
    setAuthError('');
  };

  const handleResetPassword = async ({ password, confirmPassword }) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      const data = await resetPasswordWithToken({
        token: authRoute.token,
        password,
        confirmPassword
      });
      setForgotPasswordMessage(data.mensaje || 'Password actualizada correctamente');
      goToLogin();
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setMovimientos([]);
    setGastosFijos([]);
    setGastosFijosHistoricosPorCiclo({});
    setMovimientosHistoricos([]);
    setHogaresDisponibles([]);
    setHogarSeleccionadoId('');
    setEstadoOverrides({});
    setAuthError('');
    setPasswordUpdateError('');
    setForgotPasswordMessage('');
  };

  const handleForcePasswordChange = async ({ password }) => {
    try {
      setAuthLoading(true);
      setPasswordUpdateError('');
      const data = await changeOwnPassword({ new_password: password });
      const nextSession = { token: data.token, usuario: data.usuario };
      saveSession(nextSession);
      setSession(nextSession);
    } catch (err) {
      setPasswordUpdateError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCambiarHogar = (event) => {
    setHogarSeleccionadoId(event.target.value);
    setError('');
    setMostrarEliminados(false);
  };

  const handleCrearMovimiento = async (payload) => {
    if (!canOperateHome) {
      setError('Tu rol no permite operar en este hogar');
      return;
    }
    if (!beginAction(true)) return;

    try {
      setError('');

      if (modoModal === 'editar' && movimientoEditando) {
        if (!canManageHome) {
          throw new Error('Tu rol no permite editar movimientos');
        }
        await updateMovimiento(movimientoEditando.id, {
          fecha: payload.fecha,
          tipo_movimiento_id: payload.tipo_movimiento_id,
          descripcion: payload.descripcion,
          categoria_id: payload.categoria_id,
          cuenta_id: payload.cuenta_id,
          monto_original: payload.monto_original,
          monto_ars: payload.monto_ars,
          usa_ahorro: payload.usa_ahorro,
          estado_egreso:
            Number(payload.tipo_movimiento_id) === 2
              ? movimientoEditando.estado_egreso || getEstadoMovimiento(movimientoEditando)
              : null,
          estado_ingreso:
            [1, 3].includes(Number(payload.tipo_movimiento_id))
              ? movimientoEditando.estado_ingreso || getEstadoMovimiento(movimientoEditando)
              : null
        });
      } else {
        await createMovimiento({
          ...payload,
          hogar_id: hogarId,
          creado_por_usuario_id: usuarioId
        });
      }

      await cargarDatos();
      setOpenModal(false);
      setMovimientoEditando(null);
      setModoModal('crear');
      addToast({ message: modoModal === 'editar' ? 'Movimiento actualizado.' : 'Movimiento registrado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo guardar el movimiento.' });
    } finally {
      endAction();
    }
  };

  const handleCrearGastoFijo = async (payload) => {
    if (!canAccessFixedValues) {
      setError('Tu rol no permite gestionar valores fijos');
      return;
    }
    if (!beginAction()) return;

    try {
      setError('');
      await createGastoFijo({ ...payload, hogar_id: hogarId, ciclo_desde: payload.ciclo_desde || cicloSeleccionado });
      await cargarDatos();
      setSeccionActiva('gastos_fijos');
      addToast({ message: 'Valor fijo creado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo crear el valor fijo.' });
    } finally {
      endAction();
    }
  };

  const handleEditarGastoFijo = async (id, payload) => {
    if (!canAccessFixedValues) {
      setError('Tu rol no permite gestionar valores fijos');
      return;
    }
    if (!beginAction()) return;

    try {
      setError('');
      await updateGastoFijo(id, payload);
      await cargarDatos();
      addToast({ message: 'Valor fijo actualizado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo actualizar el valor fijo.' });
    } finally {
      endAction();
    }
  };

  const handleAjustarGastoFijo = async (id, payload) => {
    if (!canAccessFixedValues) {
      setError('Tu rol no permite ajustar valores fijos');
      return;
    }
    if (!beginAction()) return;

    try {
      setError('');
      await createAjusteGastoFijo(id, payload);
      await cargarDatos();
      addToast({ message: 'Ajuste aplicado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo aplicar el ajuste.' });
    } finally {
      endAction();
    }
  };

  const handleEliminarGastoFijoEnCiclo = async (id, cicloFinalizacion = cicloSeleccionado) => {
    if (!canAccessFixedValues) {
      setError('Tu rol no permite finalizar valores fijos');
      return;
    }
    if (!beginAction()) return;

    try {
      setError('');
      await deleteGastoFijoEnCiclo(id, cicloFinalizacion);
      await cargarDatos();
      addToast({ message: 'Valor fijo finalizado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo finalizar el valor fijo.' });
    } finally {
      endAction();
    }
  };

  const handleEditar = (movimiento) => {
    if (!canManageHome) {
      setError('Tu rol no permite editar movimientos');
      return;
    }
    setModoModal('editar');
    setMovimientoEditando(movimiento);
    setOpenModal(true);
  };

  const handleEditarFijoEnGrilla = async (movimiento) => {
    if (!canAccessFixedValues) {
      setError('Tu rol no permite editar valores fijos');
      return;
    }
    const gasto = gastosFijos.find((item) => Number(item.id) === Number(movimiento.gasto_fijo_id));
    if (!gasto) return;
    setFijoEditModal(movimiento);
    setFijoEditForm({
      gasto_fijo_id: gasto.id,
      descripcion: gasto.descripcion || '',
      categoria_id: gasto.categoria_id || '',
      moneda: gasto.moneda || 'ARS',
      monto_base: formatDecimalInput(gasto.monto_base || 0),
      dia_vencimiento: gasto.dia_vencimiento || '',
      monto_ciclo: formatDecimalInput(gasto.monto_vigente ?? gasto.monto_base ?? movimiento.monto_ars ?? 0)
    });
  };

  const confirmarEditarFijoEnGrilla = async () => {
    if (!fijoEditModal || !fijoEditForm.gasto_fijo_id) return;
    const gastoActual = gastosFijos.find((item) => Number(item.id) === Number(fijoEditForm.gasto_fijo_id));
    const montoActual = Number(gastoActual?.monto_vigente ?? gastoActual?.monto_base ?? 0);
    const nuevoMontoCiclo = parseDecimalInput(fijoEditForm.monto_ciclo);
    const delta = nuevoMontoCiclo - montoActual;

    await handleEditarGastoFijo(fijoEditForm.gasto_fijo_id, {
      descripcion: fijoEditForm.descripcion,
      categoria_id: fijoEditForm.categoria_id ? Number(fijoEditForm.categoria_id) : null,
      moneda: fijoEditForm.moneda,
      dia_vencimiento: fijoEditForm.dia_vencimiento ? Number(fijoEditForm.dia_vencimiento) : null
    });

    if (delta !== 0) {
      await handleAjustarGastoFijo(fijoEditForm.gasto_fijo_id, {
        ciclo_aplicacion: cicloSeleccionado,
        alcance: 'solo_ciclo',
        tipo_ajuste: 'monto_fijo',
        valor: delta,
        nota: `Ajuste manual solo para ciclo ${cicloSeleccionado}`
      });
    }

    setFijoEditModal(null);
  };

  const handleEliminarFijoEnGrilla = async (movimiento) => {
    await handleEliminarGastoFijoEnCiclo(movimiento.gasto_fijo_id);
  };

  const handleEliminar = async (id) => {
    if (!canManageHome) {
      setError('Tu rol no permite eliminar movimientos');
      return;
    }
    setDeleteTargetId(id);
  };

  const getFechaGastoRapido = () => {
    const hoy = getLocalIsoDate();
    if (hoy.startsWith(cicloSeleccionado)) return hoy;
    return `${cicloSeleccionado}-01`;
  };

  const handleCrearGastoRapido = async ({ monto, categoria_id, descripcion }) => {
    if (!canOperateHome) {
      setError('Tu rol no permite operar en este hogar');
      return;
    }
    if (!beginAction(true)) return;

    try {
      setError('');
      await createMovimiento({
        hogar_id: hogarId,
        cuenta_id: 1,
        tipo_movimiento_id: 2,
        categoria_id,
        fecha: getFechaGastoRapido(),
        descripcion: descripcion || '',
        moneda_original: 'ARS',
        monto_original: monto,
        monto_ars: monto,
        usa_ahorro: false,
        estado_egreso: 'pagado',
        clasificacion_movimiento: 'normal',
        creado_por_usuario_id: usuarioId
      });
      await cargarDatos();
      setGastoRapidoAbierto(false);
      addToast({ message: 'Gasto rapido registrado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo registrar el gasto.' });
    } finally {
      endAction();
    }
  };

  const handleCrearAhorro = async (payload) => {
    if (!canOperateHome) {
      setError('Tu rol no permite operar en este hogar');
      return;
    }
    if (!beginAction()) return;

    try {
      setError('');
      await createMovimiento({
        ...payload,
        hogar_id: hogarId,
        cuenta_id: 1,
        creado_por_usuario_id: usuarioId
      });
      await cargarDatos();
      addToast({ message: 'Ahorro registrado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo registrar el ahorro.' });
    } finally {
      endAction();
    }
  };

  const confirmarEliminar = async () => {
    if (!deleteTargetId) return;
    if (!beginAction()) return;

    try {
      setError('');
      await deleteMovimiento(deleteTargetId);
      await cargarDatos();
      setDeleteTargetId(null);
      addToast({ message: 'Movimiento eliminado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo eliminar el movimiento.' });
    } finally {
      endAction();
    }
  };

  const abrirModalCrear = () => {
    if (!canOperateHome) {
      setError('Tu rol no permite crear movimientos');
      return;
    }
    setModoModal('crear');
    setMovimientoEditando(null);
    setOpenModal(true);
  };

  const handleVerMovimientoGeneradoTarjeta = (movimiento) => {
    const cicloMovimiento = String(movimiento?.fecha || '').slice(0, 7);
    if (cicloMovimiento) setCicloSeleccionado(cicloMovimiento);
    setSeccionActiva('movimientos');
  };

  const fabContext = (() => {
    if (!canOperateHome) return null;
    if (seccionActiva === 'dashboard') {
      return {
        label: 'Gasto rapido',
        aria: 'Cargar gasto rapido',
        className: 'quick-expense-fab fab-dashboard',
        onClick: () => setGastoRapidoAbierto(true)
      };
    }
    if (seccionActiva === 'movimientos') {
      return {
        label: 'Nuevo movimiento',
        aria: 'Cargar nuevo movimiento',
        className: 'quick-expense-fab fab-movimientos',
        onClick: abrirModalCrear
      };
    }
    return null;
  })();

  const getFechaFinDeCiclo = (ciclo) => {
    const [anioTexto, mesTexto] = String(ciclo || '').split('-');
    const anio = Number(anioTexto);
    const mes = Number(mesTexto);
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return getLocalIsoDate();
    }
    const ultimoDia = new Date(anio, mes, 0).getDate();
    return `${ciclo}-${String(ultimoDia).padStart(2, '0')}`;
  };

  const getCicloSiguiente = (ciclo) => {
    return getNextIsoCycle(ciclo);
  };

  const getCicloAnterior = (ciclo) => {
    const [anioTexto, mesTexto] = String(ciclo || '').split('-');
    const anio = Number(anioTexto);
    const mes = Number(mesTexto) - 2;
    if (!Number.isInteger(anio) || !Number.isInteger(mes)) {
      return getLocalIsoCycle();
    }
    const fecha = new Date(anio, mes, 1);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  };

  const ultimaActualizacion = useMemo(() => new Date().toLocaleString('es-AR'), [movimientos, cotizaciones, gastosFijos]);
  const tituloPantalla = {
    dashboard: 'Dashboard',
    movimientos: 'Movimientos',
    gastos_fijos: 'Valores fijos',
    categorias: 'Categorias',
    cotizacion: 'Cotizacion dolar',
    ahorros: 'Ahorros',
    tarjeta_credito: 'Tarjeta de credito',
    decisiones: 'Decisiones',
    reportes: 'Reportes',
    mi_hogar: 'Mi hogar',
    superadmin: 'Superadmin'
  }[seccionActiva] || 'Panel mensual';
  const cicloActual = useMemo(
    () => {
      const label = new Date(`${cicloSeleccionado}-01T00:00:00`).toLocaleDateString('es-AR', {
        month: 'long',
        year: 'numeric'
      });
      return label.charAt(0).toUpperCase() + label.slice(1);
    },
    [cicloSeleccionado]
  );
  const cycleContext = useMemo(
    () => getCycleContext(cicloSeleccionado, estadoCierreCiclo.cerrado),
    [cicloSeleccionado, estadoCierreCiclo.cerrado]
  );
  const movimientosVirtualesTarjeta = useMemo(() => {
    if (!estimadoTarjetasProximoCiclo || estimadoTarjetasProximoCiclo.ciclo !== cicloSeleccionado) return [];
    const categoriaTarjeta = categorias.find(
      (categoria) =>
        String(categoria.nombre || '').trim().toLowerCase() === 'tarjeta' &&
        (Number(categoria.tipo_movimiento_id) === 2 || categoria.tipo_movimiento === 'egreso')
    );
    return [{
      id: `estimado-tarjetas-${estimadoTarjetasProximoCiclo.ciclo}`,
      fecha: `${estimadoTarjetasProximoCiclo.ciclo}-01`,
      tipo_movimiento_id: 2,
      categoria_id: categoriaTarjeta?.id || null,
      tipo_movimiento: 'egreso',
      categoria: categoriaTarjeta?.nombre || 'Tarjeta',
      descripcion: `Estimado Tarjetas ${formatCycleMonth(estimadoTarjetasProximoCiclo.ciclo)}`,
      monto_ars: Number(estimadoTarjetasProximoCiclo.totalArs || 0),
      estado_egreso: 'pendiente',
      activo: true,
      esProyectado: true,
      esEstimadoTarjetas: true,
      ciclo: estimadoTarjetasProximoCiclo.ciclo,
      clasificacion_movimiento: 'normal'
    }];
  }, [categorias, cicloSeleccionado, estimadoTarjetasProximoCiclo]);
  const movimientosConsolidados = useMemo(
    () =>
      construirMovimientosConsolidadosDelCiclo({
        movimientos,
        gastosFijos,
        movimientosVirtuales: movimientosVirtualesTarjeta,
        cotizaciones,
        ciclo: cicloSeleccionado,
        estadoOverrides
      }),
    [movimientos, gastosFijos, movimientosVirtualesTarjeta, cotizaciones, cicloSeleccionado, estadoOverrides]
  );
  const cicloAnteriorSeleccionado = useMemo(() => getCicloAnterior(cicloSeleccionado), [cicloSeleccionado]);
  const movimientosConsolidadosCicloAnterior = useMemo(
    () =>
      construirMovimientosConsolidadosDelCiclo({
        movimientos: movimientosHistoricos.filter((mov) => String(mov.fecha || '').startsWith(cicloAnteriorSeleccionado)),
        gastosFijos: gastosFijosHistoricosPorCiclo[cicloAnteriorSeleccionado] || [],
        cotizaciones,
        ciclo: cicloAnteriorSeleccionado
      }),
    [cicloAnteriorSeleccionado, cotizaciones, gastosFijosHistoricosPorCiclo, movimientosHistoricos]
  );
  const movimientosConsolidadosHistorialDecisiones = useMemo(() => {
    const [anioTexto, mesTexto] = String(cicloSeleccionado || '').split('-');
    const anioBase = Number(anioTexto);
    const mesBase = Number(mesTexto) - 1;
    if (!Number.isFinite(anioBase) || !Number.isFinite(mesBase)) return [];

    return Array.from({ length: 5 }, (_, index) => {
      const fecha = new Date(anioBase, mesBase - 5 + index, 1);
      const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      return construirMovimientosConsolidadosDelCiclo({
        movimientos: movimientosHistoricos.filter((mov) => String(mov.fecha || '').startsWith(key)),
        gastosFijos: gastosFijosHistoricosPorCiclo[key] || [],
        cotizaciones,
        ciclo: key
      });
    }).flat();
  }, [cicloSeleccionado, cotizaciones, gastosFijosHistoricosPorCiclo, movimientosHistoricos]);
  const movimientosPorCicloReportes = useMemo(
    () =>
      ciclosTendencia.map((key) => ({
        ciclo: key,
        movimientos: construirMovimientosConsolidadosDelCiclo({
          movimientos: key === cicloSeleccionado
            ? movimientos
            : movimientosHistoricos.filter((mov) => String(mov.fecha || '').startsWith(key)),
          gastosFijos: key === cicloSeleccionado ? gastosFijos : gastosFijosHistoricosPorCiclo[key] || [],
          movimientosVirtuales: key === cicloSeleccionado ? movimientosVirtualesTarjeta : [],
          cotizaciones,
          ciclo: key,
          estadoOverrides: key === cicloSeleccionado ? estadoOverrides : {}
        })
      })),
    [cicloSeleccionado, ciclosTendencia, cotizaciones, gastosFijos, gastosFijosHistoricosPorCiclo, movimientos, movimientosHistoricos, movimientosVirtualesTarjeta, estadoOverrides]
  );

  const movimientosFiltradosYOrdenados = useMemo(() => {
    let items = [...movimientosConsolidados];

    if (filtrosGrilla.fechaDesde) {
      items = items.filter((mov) => String(mov.fecha) >= filtrosGrilla.fechaDesde);
    }
    if (filtrosGrilla.fechaHasta) {
      items = items.filter((mov) => String(mov.fecha) <= filtrosGrilla.fechaHasta);
    }
    if (filtrosGrilla.tipoMovimiento) {
      items = items.filter((mov) => mov.tipo_movimiento === filtrosGrilla.tipoMovimiento);
    }
    if (filtrosGrilla.categoria) {
      items = items.filter((mov) => String(mov.categoria || '') === filtrosGrilla.categoria);
    }
    if (filtrosGrilla.busqueda?.trim()) {
      const textoBusqueda = filtrosGrilla.busqueda.trim().toLocaleLowerCase('es-AR');
      items = items.filter((mov) => String(mov.descripcion || '').toLocaleLowerCase('es-AR').includes(textoBusqueda));
    }

    const { campo, direccion } = ordenGrilla;
    const factor = direccion === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      const normalize = (item) => {
        if (campo === 'registro') return item.esProyectado ? item.fecha : item.creado_en || item.fecha || '';
        if (campo === 'estado') return item.estado_consolidado || getEstadoMovimiento(item);
        return item[campo] ?? '';
      };
      const av = normalize(a);
      const bv = normalize(b);
      if (campo === 'monto_ars') return (Number(av) - Number(bv)) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });

    return items;
  }, [movimientosConsolidados, filtrosGrilla, ordenGrilla, estadoOverrides]);
  const movimientosOrdenadosDashboard = useMemo(
    () =>
      [...movimientosConsolidados]
        .sort((a, b) => {
          const av = a.esProyectado ? a.fecha : a.creado_en || a.fecha || '';
          const bv = b.esProyectado ? b.fecha : b.creado_en || b.fecha || '';
          return String(bv).localeCompare(String(av));
        }),
    [movimientosConsolidados]
  );
  const movimientosDashboard = useMemo(
    () => (dashboardMovimientosExpandido ? movimientosOrdenadosDashboard : movimientosOrdenadosDashboard.slice(0, 8)),
    [dashboardMovimientosExpandido, movimientosOrdenadosDashboard]
  );

  const categoriasDisponiblesGrilla = useMemo(() => {
    const categoriasFiltradas = filtrosGrilla.tipoMovimiento
      ? categorias.filter((categoria) => categoria.tipo_movimiento === filtrosGrilla.tipoMovimiento)
      : categorias;

    return categoriasFiltradas
      .map((categoria) => categoria.nombre)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, [categorias, filtrosGrilla.tipoMovimiento]);

  useEffect(() => {
    if (!filtrosGrilla.categoria) return;
    if (categoriasDisponiblesGrilla.includes(filtrosGrilla.categoria)) return;
    setFiltrosGrilla((prev) => ({ ...prev, categoria: '' }));
  }, [categoriasDisponiblesGrilla, filtrosGrilla.categoria]);

  const resumenFinanciero = useMemo(() => derivarResumenFinanciero(movimientosConsolidados), [movimientosConsolidados]);

  const resumenCalculado = useMemo(
    () => ({
      ingresos: resumenFinanciero.ingresosConfirmados,
      egresos: resumenFinanciero.egresosConfirmados,
      balance_actual: resumenFinanciero.balanceActual,
      balance_proyectado: resumenFinanciero.balanceProyectado
    }),
    [resumenFinanciero]
  );

  const resumenOperativo = useMemo(() => derivarResumenOperativo(movimientosConsolidados), [movimientosConsolidados]);
  const nivelControlCiclo = useMemo(
    () =>
      calcularNivelControlCiclo({
        resumenFinanciero,
        resumenOperativo,
        cycleContext,
        movimientos: movimientosConsolidados
      }),
    [resumenFinanciero, resumenOperativo, cycleContext, movimientosConsolidados]
  );
  const categoriaMayorGastoConfirmado = useMemo(
    () => agruparEgresosConfirmadosPorCategoria(movimientosConsolidados)[0],
    [movimientosConsolidados]
  );

  const alertaDashboard = useMemo(() => {
    const ingresos = Number(resumenFinanciero.ingresosConfirmados || 0);
    const egresos = Number(resumenFinanciero.egresosConfirmados || 0);
    if (ingresos <= 0 || egresos <= 0) return null;

    const ratio = Math.round((egresos / ingresos) * 100);
    if (ratio > 90) {
      return {
        tono: 'danger',
        mensaje: `Alerta: los egresos confirmados representan ${ratio}% de los ingresos. Reduce o posterga gastos para proteger el balance.`
      };
    }

    if (ratio >= 70) {
      return {
        tono: 'warning',
        mensaje: `Atencion: los egresos ya consumen ${ratio}% de los ingresos. Revisa nuevos gastos antes de confirmarlos.`
      };
    }

    return null;
  }, [resumenFinanciero]);

  const resumenMensualReportes = useMemo(
    () => ({
      ingresosConfirmados: resumenCalculado.ingresos || 0,
      egresosConfirmados: resumenCalculado.egresos || 0,
      balanceReal: resumenCalculado.balance_actual || 0,
      pendienteEgresos: resumenOperativo.montoPendienteEgresos || 0,
      balanceProyectado: resumenCalculado.balance_proyectado || 0,
      porcentajeCumplimiento: resumenOperativo.porcentajeEgresosPagados || 0
    }),
    [resumenCalculado, resumenOperativo]
  );
  const balanceCalculadoCiclo = Number(resumenFinanciero.balanceActual || 0);
  const saldoFinalEfectivoCierre =
    saldoRealFinal === '' || Number.isNaN(parseDecimalInput(saldoRealFinal))
      ? balanceCalculadoCiclo
      : parseDecimalInput(saldoRealFinal);
  const diferenciaCierreCiclo =
    saldoFinalEfectivoCierre - balanceCalculadoCiclo;
  const tipoAjusteCierre = diferenciaCierreCiclo == null ? null : diferenciaCierreCiclo >= 0 ? 'ingreso' : 'egreso';
  const categoriaAjusteCierre = categorias.find(
    (categoria) => categoria.nombre === 'Ajuste de cierre' && categoria.tipo_movimiento === tipoAjusteCierre
  );
  const tipoArrastreCierre = saldoFinalEfectivoCierre >= 0 ? 'ingreso' : 'egreso';
  const categoriaArrastreCierre = categorias.find(
    (categoria) => categoria.nombre === 'Arrastre de cierre' && categoria.tipo_movimiento === tipoArrastreCierre
  );
  const cicloSiguienteCierre = getCicloSiguiente(cicloSeleccionado);

  const reporteCategorias = useMemo(
    () => agruparEgresosConfirmadosPorCategoria(movimientosConsolidados),
    [movimientosConsolidados]
  );

  const aplicarCierreCiclo = async () => {
    if (!canManageHome) {
      setError('Tu rol no permite cerrar ciclos');
      return;
    }
    if (!beginAction(true)) return;

    try {
      setError('');

      await cerrarCiclo({
        hogar_id: hogarId,
        ciclo: cicloSeleccionado,
        balance_calculado: balanceCalculadoCiclo,
        saldo_real_final: saldoFinalEfectivoCierre,
        genera_saldo_inicial: generarSaldoInicial,
        creado_por_usuario_id: usuarioId
      });

      await cargarDatos();
      setCierreCicloAbierto(false);
      setSaldoRealFinal('');
      addToast({ message: 'Ciclo cerrado.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo cerrar el ciclo.' });
    } finally {
      endAction();
    }
  };

  const handleReabrirCiclo = async () => {
    if (!canManageHome) {
      setError('Tu rol no permite reabrir ciclos');
      return;
    }
    if (!beginAction(true)) return;

    try {
      setError('');
      await reabrirCiclo(hogarId, cicloSeleccionado);
      await cargarDatos();
      addToast({ message: 'Ciclo reabierto.' });
    } catch (err) {
      setError(err.message);
      addToast({ type: 'error', message: err.message || 'No se pudo reabrir el ciclo.' });
    } finally {
      endAction();
    }
  };

  const reporteEvolucionMensual = useMemo(
    () =>
      construirSerieResumenMensualConsolidada({
        movimientos: movimientosHistoricos,
        gastosFijosPorCiclo: {
          ...gastosFijosHistoricosPorCiclo,
          [cicloSeleccionado]: gastosFijos
        },
        cotizaciones,
        ciclo: cicloSeleccionado
      }),
    [cicloSeleccionado, cotizaciones, gastosFijos, gastosFijosHistoricosPorCiclo, movimientosHistoricos]
  );
  const analysisConfidence = useMemo(
    () =>
      getAnalysisConfidence({
        series: reporteEvolucionMensual,
        cycleContext,
        currentCycle: cicloSeleccionado,
        valueKeys: ['ingresos', 'egresos']
      }),
    [reporteEvolucionMensual, cycleContext, cicloSeleccionado]
  );

  const cycleControlPanel = (
    <section className="panel cycle-control-panel">
      <div className="cycle-control-main">
        <span className="cycle-control-label">Ciclo de trabajo</span>
        <strong>{cicloActual}</strong>
        <small>{estadoCierreCiclo.cerrado ? 'Ciclo cerrado' : 'Ciclo abierto para operar'}</small>
      </div>
      <div className="cycle-control-tools">
        <span className="cycle-control-label">Cambiar ciclo</span>
        <div className="cycle-control-row">
          <MonthPicker
            value={cicloSeleccionado}
            onChange={handleCicloSeleccionado}
            emptyLabel="Seleccionar ciclo"
            className="cycle-control-picker"
          />
          {dataLoading && (
            <span className="cycle-loading-indicator" role="status" aria-live="polite">
              <span className="btn-spinner" aria-hidden="true" />
              Actualizando...
            </span>
          )}
          {canManageHome && (
            <div className="cycle-control-actions">
              {estadoCierreCiclo.cerrado ? (
                <button type="button" className="hero-action-btn secondary btn-with-spinner" onClick={handleReabrirCiclo} disabled={loading || cycleActionLoading}>
                  {cycleActionLoading && <ButtonSpinner />}
                  {cycleActionLoading ? 'Reabriendo...' : 'Reabrir ciclo'}
                </button>
              ) : (
                <button
                  type="button"
                  className="hero-action-btn"
                  onClick={() => {
                    setSaldoRealFinal('');
                    setGenerarSaldoInicial(true);
                    setCierreCicloAbierto(true);
                  }}
                >
                  Cerrar ciclo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  if (authLoading && !session) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-card-compact">
          <p className="eyebrow">FinanzApp</p>
          <h1>Validando sesion</h1>
          <p className="subtitle">Estamos recuperando tu acceso guardado.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    if (authRoute.view === 'reset-password') {
      return (
        <ResetPasswordPanel
          validating={resetPasswordValidating}
          validToken={resetPasswordValid}
          error={authError}
          loading={authLoading}
          onSubmit={handleResetPassword}
          onBackToLogin={goToLogin}
        />
      );
    }

    return (
      <LoginPanel
        onLogin={handleLogin}
        onForgotPassword={handleForgotPassword}
        loading={authLoading}
        error={authError}
        forgotPasswordMessage={forgotPasswordMessage}
      />
    );
  }

  if (session?.usuario?.force_password_change) {
    return (
      <main className="auth-shell force-password-shell">
        <section className="auth-card auth-card-wide force-password-screen">
          <div className="force-password-intro">
            <p className="eyebrow">FinanzApp</p>
            <h1>Actualiza tu password</h1>
            <p className="subtitle">Antes de entrar a la app necesitamos que definas una nueva clave.</p>
          </div>

          <PasswordSetupForm
            title="Cambio obligatorio"
            subtitle="La nueva password reemplaza la actual y te deja entrar al hogar normalmente."
            submitLabel="Guardar password"
            cancelLabel="Volver al login"
            loading={authLoading}
            error={passwordUpdateError}
            onCancel={handleLogout}
            onSubmit={handleForcePasswordChange}
          />
        </section>
      </main>
    );
  }

  return (
    <main className={`container ${menuCollapsed ? 'menu-colapsado' : ''}`}>
      <MenuLateral
        collapsed={menuCollapsed}
        onToggle={() => setMenuCollapsed((v) => !v)}
        active={seccionActiva}
        onSelect={setSeccionActiva}
        canManageHome={canManageHome}
        canAccessFixedValues={canAccessFixedValues}
        isSuperadmin={isSuperadmin}
        userName={session.usuario?.nombre || session.usuario?.email}
        userRole={rolActivo}
        theme={theme}
        accountMenuOpen={accountMenuOpen}
        accountMenuRef={accountMenuRef}
        canSwitchHogar={canSwitchHogar}
        hogaresContexto={hogaresContexto}
        hogarId={hogarId}
        hogarActivo={hogarActivo}
        cicloCerrado={estadoCierreCiclo.cerrado}
        onAccountMenuToggle={() => setAccountMenuOpen((current) => !current)}
        onAccountMenuClose={() => setAccountMenuOpen(false)}
        onThemeToggle={toggleTheme}
        onHogarChange={handleCambiarHogar}
        onLogout={handleLogout}
      />

      <div className="contenido-principal">
        <header className="hero">
          <h1>{tituloPantalla}</h1>
          <div className="header-submeta">
            <span>Actualizado: {ultimaActualizacion}</span>
          </div>
        </header>

        {(seccionActiva === 'dashboard' || seccionActiva === 'movimientos') && cycleControlPanel}

        {dataLoading && (seccionActiva === 'dashboard' || seccionActiva === 'movimientos') && (
          <div className="data-loading-banner" role="status" aria-live="polite">
            <span className="btn-spinner" aria-hidden="true" />
            Cargando datos del ciclo...
          </div>
        )}

        {seccionActiva === 'dashboard' && (
          <div className="dashboard-executive-grid">
            <ResumenCards
              resumen={resumenCalculado}
              amountsHidden={dashboardAmountsHidden}
              onToggleAmountsHidden={() => setDashboardAmountsHidden((current) => !current)}
            />
          </div>
        )}

        <div className="contenido-dashboard">
          {seccionActiva === 'dashboard' && (
            <>
              <section className="dashboard-secondary-grid">
                {nivelControlCiclo && (
                  <article className={`operational-item dashboard-control-metric card-control-${String(nivelControlCiclo.nivelControl || '').toLowerCase()}`}>
                    <span className="operational-label">Nivel de control</span>
                    <strong>{nivelControlCiclo.nivelControl}</strong>
                    <small>{nivelControlCiclo.texto}</small>
                    <small className="metric-helper">{nivelControlCiclo.detalle}</small>
                  </article>
                )}
                <div className="operational-item">
                  <span className="operational-label">Total de egresos pendientes</span>
                  <strong>{formatMoneyText(resumenOperativo.montoPendienteEgresos)}</strong>
                </div>
                <div className="operational-item">
                  <span className="operational-label">Egresos pagados del ciclo</span>
                  <strong>{Number(resumenOperativo.porcentajeEgresosPagados || 0)}%</strong>
                </div>
                <div className="operational-item operational-item-wide">
                  <span className="operational-label">Cantidad de pendientes</span>
                  <strong>{resumenOperativo.pendientes}</strong>
                </div>
                <CotizacionesPanel cotizaciones={cotizaciones} onRefrescar={cargarDatos} compact />
              </section>
              {alertaDashboard && (
                <section className={`dashboard-alert ${alertaDashboard.tono}`}>
                  <strong>{alertaDashboard.tono === 'danger' ? 'Umbral critico' : 'Umbral preventivo'}</strong>
                  <span>{alertaDashboard.mensaje}</span>
                </section>
              )}
              <MovimientosTable
                title="Ultimos movimientos del ciclo"
                movimientos={movimientosDashboard}
                categoriasDisponibles={categoriasDisponiblesGrilla}
                onEditar={handleEditar}
                onEliminar={handleEliminar}
                onNuevo={abrirModalCrear}
                onVerTodos={() => setDashboardMovimientosExpandido((prev) => !prev)}
                secondaryActionLabel={dashboardMovimientosExpandido ? 'Ver menos' : 'Ver todos'}
                headerNote={dashboardMovimientosExpandido ? 'Vista completa dentro del dashboard' : 'Resumen compacto con los movimientos mas recientes'}
                totalCount={movimientosOrdenadosDashboard.length}
                expanded={dashboardMovimientosExpandido}
                variant="dashboard"
                canCreate={canOperateHome}
                canEdit={canManageHome}
                canDelete={canManageHome}
                canManageFixedValues={canAccessFixedValues}
                canToggleEstado={canOperateHome}
                mostrarEliminados={mostrarEliminados}
                onToggleEliminados={setMostrarEliminados}
                onEditarFijo={handleEditarFijoEnGrilla}
                onEliminarFijo={handleEliminarFijoEnGrilla}
                filtros={filtrosGrilla}
                onFiltrosChange={setFiltrosGrilla}
                orden={ordenGrilla}
                onOrdenChange={setOrdenGrilla}
                getEstadoMovimiento={getEstadoMovimiento}
                onToggleEstadoPago={toggleEstadoMovimiento}
                actionLoading={loading || dataLoading}
                loading={dataLoading}
                showFilters={false}
                showDeletedToggle={false}
              />
            </>
          )}

          {seccionActiva === 'movimientos' && (
            <>
              <section className="panel operational-summary">
                <div className="operational-item">
                  <span className="operational-label">Total de egresos pendientes</span>
                  <strong>{formatMoneyText(resumenOperativo.montoPendienteEgresos)}</strong>
                </div>
                <div className="operational-item">
                  <span className="operational-label">Egresos pagados del ciclo</span>
                  <strong>{Number(resumenOperativo.porcentajeEgresosPagados || 0)}%</strong>
                </div>
                <div className="operational-item operational-item-wide">
                  <span className="operational-label">Cantidad de pendientes</span>
                  <strong>{resumenOperativo.pendientes}</strong>
                </div>
              </section>
              {alertaDashboard && (
                <section className={`dashboard-alert ${alertaDashboard.tono}`}>
                  <strong>{alertaDashboard.tono === 'danger' ? 'Umbral critico' : 'Umbral preventivo'}</strong>
                  <span>{alertaDashboard.mensaje}</span>
                </section>
              )}
              <MovimientosTable
                movimientos={movimientosFiltradosYOrdenados}
                categoriasDisponibles={categoriasDisponiblesGrilla}
                onEditar={handleEditar}
                onEliminar={handleEliminar}
                onNuevo={abrirModalCrear}
                canCreate={canOperateHome}
                canEdit={canManageHome}
                canDelete={canManageHome}
                canManageFixedValues={canAccessFixedValues}
                canToggleEstado={canOperateHome}
                mostrarEliminados={mostrarEliminados}
                onToggleEliminados={setMostrarEliminados}
                onEditarFijo={handleEditarFijoEnGrilla}
                onEliminarFijo={handleEliminarFijoEnGrilla}
                filtros={filtrosGrilla}
                onFiltrosChange={setFiltrosGrilla}
                orden={ordenGrilla}
                onOrdenChange={setOrdenGrilla}
                getEstadoMovimiento={getEstadoMovimiento}
                onToggleEstadoPago={toggleEstadoMovimiento}
                actionLoading={loading || dataLoading}
                loading={dataLoading}
              />
            </>
          )}

          {seccionActiva === 'cotizacion' && (
            <CotizacionesPanel cotizaciones={cotizaciones} onRefrescar={cargarDatos} />
          )}

          {seccionActiva === 'gastos_fijos' && (
            <GastosFijosPanel
              gastos={gastosFijos}
              categorias={categorias}
              ciclo={cicloSeleccionado}
              onCicloChange={handleCicloSeleccionado}
              readOnly={!canAccessFixedValues}
              loading={loading}
              onCrear={handleCrearGastoFijo}
              onEditar={handleEditarGastoFijo}
              onAjustar={handleAjustarGastoFijo}
              onEliminarEnCiclo={handleEliminarGastoFijoEnCiclo}
              onHistorialAjustes={getAjustesGastoFijo}
            />
          )}

          {seccionActiva === 'ahorros' && (
            <AhorrosPanel
              movimientos={movimientosConsolidados}
              movimientosHistoricos={movimientosHistoricos}
              cotizaciones={cotizaciones}
              categorias={categorias}
              ciclo={cicloSeleccionado}
              loading={loading}
              onCrearAhorro={handleCrearAhorro}
            />
          )}

          {seccionActiva === 'tarjeta_credito' && (
            <TarjetaCreditoPanel
              hogarId={hogarId}
              ciclo={cicloSeleccionado}
              categorias={categorias}
              cotizaciones={cotizaciones}
              formatMoney={formatMoneyText}
              onToast={addToast}
              onMovimientosChange={cargarDatos}
              onVerMovimientoGenerado={handleVerMovimientoGeneradoTarjeta}
            />
          )}

          {seccionActiva === 'decisiones' && (
            <DecisionesPanel
              resumen={resumenCalculado}
              operativo={resumenOperativo}
              categoriaPrincipal={categoriaMayorGastoConfirmado}
              categorias={reporteCategorias}
              serieMensual={reporteEvolucionMensual}
              movimientos={movimientosConsolidados}
              movimientosMesAnterior={movimientosConsolidadosCicloAnterior}
              movimientosHistoricos={movimientosConsolidadosHistorialDecisiones}
              ciclo={cicloSeleccionado}
              cycleContext={cycleContext}
              nivelControl={nivelControlCiclo}
              analysisConfidence={analysisConfidence}
              formatMoney={formatMoneyText}
            />
          )}

          {seccionActiva === 'reportes' && (
            <ReportesPanel
              reporteActivo={reporteActivo}
              onReporteChange={setReporteActivo}
              ciclo={cicloSeleccionado}
              resumenMensual={resumenMensualReportes}
              categoriasReportes={reporteCategorias}
              evolucionMensual={reporteEvolucionMensual}
              movimientosPorCiclo={movimientosPorCicloReportes}
              cycleContext={cycleContext}
              analysisConfidence={analysisConfidence}
            />
          )}

          {seccionActiva === 'superadmin' && isSuperadmin && (
            <SuperAdminPanel
              hogarActivoId={hogarId}
              onHogaresChange={cargarHogaresContexto}
              onHogarSelect={(id) => setHogarSeleccionadoId(String(id))}
            />
          )}

          {seccionActiva === 'mi_hogar' && canManageHome && (
            <HogarAdminPanel
              hogarId={hogarId}
              hogarNombre={hogarActivo?.nombre}
              usuarioActualId={usuarioId}
            />
          )}

          {seccionActiva === 'categorias' && canManageHome && (
            <ConfiguracionPanel
              hogarId={hogarId}
              hogarNombre={hogarActivo?.nombre}
              categorias={categorias}
              onCategoriasChange={cargarDatos}
            />
          )}
        </div>
      </div>

      {fabContext && (
        <button
          type="button"
          className={fabContext.className}
          onClick={fabContext.onClick}
          aria-label={fabContext.aria}
        >
          <span aria-hidden="true">+</span>
          <strong>{fabContext.label}</strong>
        </button>
      )}

      {gastoRapidoAbierto && (
        <GastoRapidoModal
          categorias={categorias}
          loading={loading}
          onClose={() => setGastoRapidoAbierto(false)}
          onSubmit={handleCrearGastoRapido}
        />
      )}

      {openModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{modoModal === 'editar' ? 'Editar movimiento' : 'Alta de movimiento'}</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => {
                  setOpenModal(false);
                  setModoModal('crear');
                  setMovimientoEditando(null);
                }}
              >
                ✕
              </button>
            </div>
            <NuevoMovimientoForm
              categorias={categorias}
              onCrear={handleCrearMovimiento}
              loading={loading}
              modo={modoModal}
              initialValues={movimientoEditando}
            />
          </div>
        </div>
      )}

      {deleteTargetId && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content confirm-modal">
            <h3>🗑️ Confirmar eliminación</h3>
            <p>¿Seguro querés eliminar este movimiento? Esta acción no se puede deshacer.</p>
            <div className="confirm-actions">
              <button type="button" className="btn-inline" onClick={() => setDeleteTargetId(null)} disabled={loading}>
                Cancelar
              </button>
              <button type="button" className="btn-inline danger btn-with-spinner" onClick={confirmarEliminar} disabled={loading}>
                {loading && <ButtonSpinner />}
                {loading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fijoEditModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="modal-header">
              <h3>✏️ Editar valor fijo</h3>
              <button type="button" className="close-btn" onClick={() => setFijoEditModal(null)}>
                ✕
              </button>
            </div>

            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); confirmarEditarFijoEnGrilla(); }}>
              <label>
                Descripción
                <input
                  value={fijoEditForm.descripcion}
                  onChange={(e) => setFijoEditForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  required
                />
              </label>
              <label>
                Categoría
                <select
                  value={fijoEditForm.categoria_id}
                  onChange={(e) => setFijoEditForm((prev) => ({ ...prev, categoria_id: e.target.value }))}
                  required
                >
                  <option value="">Seleccionar</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Moneda
                <select value={fijoEditForm.moneda} onChange={(e) => setFijoEditForm((prev) => ({ ...prev, moneda: e.target.value }))}>
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label>
                Valor base original
                <input
                  type="text"
                  inputMode="decimal"
                  value={fijoEditForm.monto_base}
                  disabled
                  placeholder="0,00"
                />
                <small className="field-helper">Para modificar futuros ciclos usá Ajustar en Valores fijos.</small>
              </label>
              <label>
                Día vencimiento
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={fijoEditForm.dia_vencimiento}
                  onChange={(e) => setFijoEditForm((prev) => ({ ...prev, dia_vencimiento: e.target.value }))}
                />
              </label>
              <label>
                Monto en ciclo {cicloSeleccionado} ({fijoEditForm.moneda})
                <input
                  type="text"
                  inputMode="decimal"
                  value={fijoEditForm.monto_ciclo}
                  onChange={(e) => setFijoEditForm((prev) => ({ ...prev, monto_ciclo: sanitizeDecimalInput(e.target.value) }))}
                  placeholder="0,00"
                />
              </label>
              <div className="confirm-actions full-width">
                <button type="button" className="btn-inline" onClick={() => setFijoEditModal(null)} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn-inline success btn-with-spinner" disabled={loading}>
                  {loading && <ButtonSpinner />}
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cierreCicloAbierto && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content modal-compact">
            <div className="modal-header">
              <h3>Cerrar ciclo</h3>
              <button type="button" className="close-btn" onClick={() => setCierreCicloAbierto(false)}>
                ×
              </button>
            </div>

            <div className="cycle-close-summary">
              <article className="cycle-close-card">
                <span>Balance calculado del ciclo</span>
                <strong className={balanceCalculadoCiclo >= 0 ? 'positivo' : 'negativo'}>
                  {formatMoneyText(balanceCalculadoCiclo)}
                </strong>
              </article>

              <label>
                Saldo real final
                <input
                  type="text"
                  inputMode="decimal"
                  value={saldoRealFinal}
                  onChange={(e) => setSaldoRealFinal(sanitizeDecimalInput(e.target.value, { allowNegative: true }))}
                  placeholder={`Si lo dejás vacío usa ${formatMoneyText(balanceCalculadoCiclo)}`}
                  autoFocus
                />
                <small className="field-helper">
                  Si no cargás nada, se toma como saldo real final el balance calculado.
                </small>
              </label>

              <label className="checkbox-card">
                <span className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={generarSaldoInicial}
                    onChange={(e) => setGenerarSaldoInicial(e.target.checked)}
                  />
                  <span>Generar saldo inicial en {cicloSiguienteCierre}</span>
                </span>
              </label>

              <article className="cycle-close-card cycle-close-diff">
                <span>Diferencia</span>
                <strong className={diferenciaCierreCiclo == null ? '' : diferenciaCierreCiclo >= 0 ? 'positivo' : 'negativo'}>
                  {diferenciaCierreCiclo == null ? '—' : formatMoneyText(diferenciaCierreCiclo)}
                </strong>
                {diferenciaCierreCiclo != null && diferenciaCierreCiclo !== 0 && (
                  <small>
                    Se va a crear un {diferenciaCierreCiclo > 0 ? 'ingreso' : 'egreso'} confirmado en
                    {' '}Ajuste de cierre.
                  </small>
                )}
                {generarSaldoInicial && saldoFinalEfectivoCierre !== 0 && (
                  <small>
                    También se va a crear un {saldoFinalEfectivoCierre > 0 ? 'ingreso' : 'egreso'} confirmado como saldo inicial en {cicloSiguienteCierre}.
                  </small>
                )}
              </article>
            </div>

            <div className="confirm-actions">
              <button type="button" className="btn-inline" onClick={() => setCierreCicloAbierto(false)} disabled={loading || cycleActionLoading}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-inline success btn-with-spinner"
                onClick={aplicarCierreCiclo}
                disabled={loading || cycleActionLoading || estadoCierreCiclo.cerrado}
              >
                {cycleActionLoading && <ButtonSpinner />}
                {cycleActionLoading ? 'Aplicando...' : diferenciaCierreCiclo === 0 ? 'Cerrar sin ajuste' : 'Aplicar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}
