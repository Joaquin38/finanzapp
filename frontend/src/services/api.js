const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const AUTH_STORAGE_KEY = 'finanzas_session';

export function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getAuthHeaders(extra = {}) {
  const token = getStoredSession()?.token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function getRangoCiclo(ciclo) {
  if (!/^\d{4}-\d{2}$/.test(ciclo || '')) return null;

  const [anioTexto, mesTexto] = ciclo.split('-');
  const anio = Number(anioTexto);
  const mes = Number(mesTexto);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) return null;

  const ultimoDia = new Date(anio, mes, 0).getDate();
  const desde = `${ciclo}-01`;
  const hasta = `${ciclo}-${String(ultimoDia).padStart(2, '0')}`;
  return { desde, hasta };
}

function normalizeFetchError(error) {
  if (error?.name === 'TypeError') {
    return `No se pudo conectar con la API configurada (${API_URL}). Verificá que el backend esté disponible.`;
  }
  return error?.message || 'Ocurrió un error inesperado';
}

export async function login(email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo iniciar sesion');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getCurrentUser() {
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Sesion invalida');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getHogares() {
  try {
    const response = await fetch(`${API_URL}/hogares`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('No se pudieron obtener hogares');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getAdminHogares() {
  try {
    const response = await fetch(`${API_URL}/admin/hogares`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('No se pudieron obtener hogares');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getAdminUsuarios() {
  try {
    const response = await fetch(`${API_URL}/admin/usuarios`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('No se pudieron obtener usuarios');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function updateAdminUsuarioPassword(usuarioId, payload) {
  try {
    const response = await fetch(`${API_URL}/admin/usuarios/${usuarioId}/password`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar la password');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function changeOwnPassword(payload) {
  try {
    const response = await fetch(`${API_URL}/auth/cambiar-password`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar la password');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function createAdminHogar(payload) {
  try {
    const response = await fetch(`${API_URL}/admin/hogares`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo crear el hogar');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function updateAdminHogar(hogarId, payload) {
  try {
    const response = await fetch(`${API_URL}/admin/hogares/${hogarId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar el hogar');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function deleteAdminHogar(hogarId) {
  try {
    const response = await fetch(`${API_URL}/admin/hogares/${hogarId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo eliminar el hogar');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function createAdminUsuario(payload) {
  try {
    const response = await fetch(`${API_URL}/admin/usuarios`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo crear el usuario');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function vincularAdminUsuarioHogar(hogarId, payload) {
  try {
    const response = await fetch(`${API_URL}/admin/hogares/${hogarId}/usuarios`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo vincular el usuario');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getMiembrosHogar(hogarId) {
  try {
    const response = await fetch(`${API_URL}/hogares/${hogarId}/miembros`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('No se pudieron obtener los miembros del hogar');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function agregarMiembroHogar(hogarId, payload) {
  try {
    const response = await fetch(`${API_URL}/hogares/${hogarId}/miembros`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo agregar el miembro');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function actualizarRolMiembroHogar(hogarId, usuarioId, payload) {
  try {
    const response = await fetch(`${API_URL}/hogares/${hogarId}/miembros/${usuarioId}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar el rol');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function quitarMiembroHogar(hogarId, usuarioId) {
  try {
    const response = await fetch(`${API_URL}/hogares/${hogarId}/miembros/${usuarioId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo quitar el miembro');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getMovimientos(hogarId = 1, incluirEliminados = false, ciclo) {
  try {
    const searchParams = new URLSearchParams({
      hogar_id: String(hogarId),
      incluir_eliminados: String(incluirEliminados)
    });

    const rango = getRangoCiclo(ciclo);
    if (rango) {
      searchParams.set('desde', rango.desde);
      searchParams.set('hasta', rango.hasta);
    }

    const response = await fetch(`${API_URL}/movimientos?${searchParams.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudieron obtener movimientos');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getResumen(hogarId = 1, ciclo) {
  try {
    const searchParams = new URLSearchParams({ hogar_id: String(hogarId) });
    if (ciclo) searchParams.set('ciclo', ciclo);
    const response = await fetch(`${API_URL}/dashboard/resumen?${searchParams.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudo obtener resumen');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function createMovimiento(payload) {
  try {
    const response = await fetch(`${API_URL}/movimientos`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo crear el movimiento');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function updateMovimiento(id, payload) {
  try {
    const response = await fetch(`${API_URL}/movimientos/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar el movimiento');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function deleteMovimiento(id) {
  try {
    const response = await fetch(`${API_URL}/movimientos/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo eliminar el movimiento');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getCategorias(hogarId = 1) {
  try {
    const response = await fetch(`${API_URL}/categorias?hogar_id=${hogarId}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudieron obtener categorías');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getCotizaciones(fecha) {
  const url = fecha ? `${API_URL}/cotizaciones?fecha=${fecha}` : `${API_URL}/cotizaciones`;

  try {
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudieron obtener cotizaciones');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getGastosFijos(hogarId = 1, ciclo) {
  try {
    const searchParams = new URLSearchParams({ hogar_id: String(hogarId) });
    if (ciclo) searchParams.set('ciclo', ciclo);
    const response = await fetch(`${API_URL}/gastos-fijos?${searchParams.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudieron obtener valores fijos');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function updateGastoFijo(id, payload) {
  try {
    const response = await fetch(`${API_URL}/gastos-fijos/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar el valor fijo');
    }
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function createAjusteGastoFijo(id, payload) {
  try {
    const response = await fetch(`${API_URL}/gastos-fijos/${id}/ajustes`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo crear el ajuste');
    }
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function deleteGastoFijoEnCiclo(id, ciclo) {
  try {
    const query = ciclo ? `?ciclo=${encodeURIComponent(ciclo)}` : '';
    const response = await fetch(`${API_URL}/gastos-fijos/${id}${query}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo eliminar el valor fijo para el ciclo');
    }
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function createGastoFijo(payload) {
  try {
    const response = await fetch(`${API_URL}/gastos-fijos`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo crear el valor fijo');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getMovimientosRango(hogarId = 1, desde, hasta, incluirEliminados = false) {
  try {
    const searchParams = new URLSearchParams({
      hogar_id: String(hogarId),
      incluir_eliminados: String(incluirEliminados)
    });

    if (desde) searchParams.set('desde', desde);
    if (hasta) searchParams.set('hasta', hasta);

    const response = await fetch(`${API_URL}/movimientos?${searchParams.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudieron obtener movimientos del rango');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function updateEstadoGastoFijoEnCiclo(id, payload) {
  try {
    const response = await fetch(`${API_URL}/gastos-fijos/${id}/estado-ciclo`, {
      method: 'PATCH',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo actualizar el estado del valor fijo en el ciclo');
    }

    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function getEstadoCierreCiclo(hogarId = 1, ciclo) {
  try {
    const response = await fetch(`${API_URL}/cierres-ciclo/estado?hogar_id=${hogarId}&ciclo=${encodeURIComponent(ciclo)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('No se pudo consultar el estado del cierre');
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function cerrarCiclo(payload) {
  try {
    const response = await fetch(`${API_URL}/cierres-ciclo`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo cerrar el ciclo');
    }
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}

export async function reabrirCiclo(hogarId = 1, ciclo) {
  try {
    const response = await fetch(`${API_URL}/cierres-ciclo?hogar_id=${hogarId}&ciclo=${encodeURIComponent(ciclo)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || 'No se pudo reabrir el ciclo');
    }
    return response.json();
  } catch (error) {
    throw new Error(normalizeFetchError(error));
  }
}
