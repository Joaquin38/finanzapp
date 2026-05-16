const ESTADOS_INGRESO_CONFIRMADOS = new Set(['registrado', 'cobrado']);
const ESTADOS_PENDIENTES = new Set(['pendiente', 'proyectado']);
const CLASIFICACION_NORMAL = 'normal';

function getClasificacionMovimiento(movimiento) {
  return movimiento.clasificacion_movimiento || CLASIFICACION_NORMAL;
}

function esMovimientoOperativo(movimiento) {
  return getClasificacionMovimiento(movimiento) === CLASIFICACION_NORMAL;
}

function esMovimientoConfirmado(movimiento) {
  if (movimiento.tipo_movimiento === 'egreso') {
    return movimiento.estado_consolidado === 'pagado';
  }

  if (['ingreso', 'ahorro'].includes(movimiento.tipo_movimiento)) {
    return ESTADOS_INGRESO_CONFIRMADOS.has(movimiento.estado_consolidado);
  }

  return false;
}

function esEgresoDeBalance(movimiento) {
  return ['egreso', 'ahorro'].includes(movimiento.tipo_movimiento);
}

export function getEstadoMovimientoConsolidado(movimiento, estadoOverrides = {}) {
  const override = estadoOverrides[movimiento.id];
  if (override) return override;

  if (movimiento.tipo_movimiento === 'egreso') {
    return movimiento.estado_egreso || 'pendiente';
  }

  if (['ingreso', 'ahorro'].includes(movimiento.tipo_movimiento)) {
    return movimiento.estado_ingreso || (movimiento.esProyectado ? 'proyectado' : 'registrado');
  }

  return 'registrado';
}

function getVentaOficial(cotizaciones = []) {
  return Number(cotizaciones.find((item) => item.fuente === 'oficial' && Number(item.venta) > 0)?.venta || 0);
}

function getFechaProyectada(ciclo, diaVencimiento) {
  const [anio, mesTexto] = String(ciclo || '').split('-');
  const hoy = new Date();
  const anioNumero = Number.isFinite(Number(anio)) ? Number(anio) : hoy.getFullYear();
  const mesNumero = Number.isFinite(Number(mesTexto)) ? Math.max(Number(mesTexto) - 1, 0) : hoy.getMonth();
  const dia = diaVencimiento ? Math.min(Math.max(Number(diaVencimiento), 1), 28) : 1;
  return new Date(anioNumero, mesNumero, dia).toISOString().slice(0, 10);
}

function esEstadoRealizado(item) {
  if (item.tipo_movimiento === 'egreso') return item.estado_egreso === 'pagado';
  if (item.tipo_movimiento === 'ingreso') return item.estado_ingreso === 'registrado';
  return false;
}

export function construirMovimientosConsolidadosDelCiclo({
  movimientos = [],
  gastosFijos = [],
  movimientosVirtuales = [],
  cotizaciones = [],
  ciclo = '',
  estadoOverrides = {}
}) {
  const ventaOficial = getVentaOficial(cotizaciones);

  const proyectados = gastosFijos
    .filter((item) => ['ingreso', 'egreso'].includes(item.tipo_movimiento))
    .map((item) => {
      const montoVigente = Number(item.monto_vigente ?? item.monto_base ?? 0);
      const montoConvertido = item.moneda === 'USD' && ventaOficial > 0 ? montoVigente * ventaOficial : montoVigente;
      const fechaProgramada = getFechaProyectada(ciclo, item.dia_vencimiento);
      const fechaRealizacion = String(item.fecha_realizacion || '').slice(0, 10);
      const usarFechaReal = fechaRealizacion && esEstadoRealizado(item);

      return {
        id: `valor-fijo-${item.id}`,
        gasto_fijo_id: item.id,
        fecha: usarFechaReal ? fechaRealizacion : fechaProgramada,
        fecha_programada: fechaProgramada,
        fecha_realizacion: usarFechaReal ? fechaRealizacion : '',
        fecha_estado: String(item.fecha_estado || '').slice(0, 10),
        tipo_movimiento_id:
          item.tipo_movimiento === 'ingreso' ? 1 : item.tipo_movimiento === 'ahorro' ? 3 : 2,
        categoria_id: item.categoria_id ?? null,
        tipo_movimiento: item.tipo_movimiento,
        categoria: item.categoria,
        descripcion: item.descripcion,
        monto_ars: montoConvertido,
        estado_egreso: item.estado_egreso,
        estado_ingreso: item.estado_ingreso,
        activo: true,
        esProyectado: true,
        ciclo: item.ciclo,
        ajuste_en_ciclo: Boolean(item.ajuste_en_ciclo)
      };
    });

  const manuales = [...movimientos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const consolidados = [...proyectados, ...movimientosVirtuales, ...manuales];

  return consolidados.map((movimiento) => ({
    ...movimiento,
    estado_consolidado: getEstadoMovimientoConsolidado(movimiento, estadoOverrides)
  }));
}

export function derivarResumenFinanciero(movimientos = []) {
  const ingresosConfirmados = movimientos
    .filter(
      (mov) =>
        mov.tipo_movimiento === 'ingreso' &&
        esMovimientoOperativo(mov) &&
        ESTADOS_INGRESO_CONFIRMADOS.has(mov.estado_consolidado)
    )
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  const egresosConfirmados = movimientos
    .filter(
      (mov) =>
        esEgresoDeBalance(mov) &&
        esMovimientoOperativo(mov) &&
        (mov.tipo_movimiento === 'ahorro' ? ESTADOS_INGRESO_CONFIRMADOS.has(mov.estado_consolidado) : mov.estado_consolidado === 'pagado')
    )
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  const ingresosTotales = movimientos
    .filter((mov) => mov.tipo_movimiento === 'ingreso')
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  const egresosTotales = movimientos
    .filter((mov) => esEgresoDeBalance(mov))
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  const ingresosConfirmadosBalance = movimientos
    .filter((mov) => mov.tipo_movimiento === 'ingreso' && esMovimientoConfirmado(mov))
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  const egresosConfirmadosBalance = movimientos
    .filter((mov) => esEgresoDeBalance(mov) && esMovimientoConfirmado(mov))
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  return {
    ingresosConfirmados,
    egresosConfirmados,
    balanceActual: ingresosConfirmadosBalance - egresosConfirmadosBalance,
    balanceProyectado: ingresosTotales - egresosTotales
  };
}

export function derivarResumenOperativo(movimientos = []) {
  const egresos = movimientos.filter((mov) => esEgresoDeBalance(mov) && esMovimientoOperativo(mov));
  const egresosPagados = egresos.filter((mov) =>
    mov.tipo_movimiento === 'ahorro' ? ESTADOS_INGRESO_CONFIRMADOS.has(mov.estado_consolidado) : mov.estado_consolidado === 'pagado'
  ).length;
  const pendientes = movimientos.filter((mov) => esMovimientoOperativo(mov) && ESTADOS_PENDIENTES.has(mov.estado_consolidado)).length;
  const montoPendienteEgresos = egresos
    .filter((mov) => mov.tipo_movimiento === 'egreso' && mov.estado_consolidado === 'pendiente')
    .reduce((acc, mov) => acc + Number(mov.monto_ars || 0), 0);

  return {
    pendientes,
    montoPendienteEgresos,
    porcentajeEgresosPagados: egresos.length > 0 ? Math.round((egresosPagados / egresos.length) * 100) : 0
  };
}

export function agruparEgresosConfirmadosPorCategoria(movimientos = []) {
  const agrupado = movimientos
    .filter((mov) => mov.tipo_movimiento === 'egreso' && esMovimientoOperativo(mov) && mov.estado_consolidado === 'pagado')
    .reduce((acc, mov) => {
      const categoria = mov.categoria || 'Sin categoria';
      acc[categoria] = (acc[categoria] || 0) + Number(mov.monto_ars || 0);
      return acc;
    }, {});

  return Object.entries(agrupado)
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}

export function construirSerieResumenMensual(movimientos = [], ciclo = '') {
  const [anioTexto, mesTexto] = String(ciclo || '').split('-');
  const anioBase = Number(anioTexto);
  const mesBase = Number(mesTexto) - 1;

  return Array.from({ length: 6 }, (_, index) => {
    const fecha = new Date(anioBase, mesBase - 5 + index, 1);
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const movimientosMes = movimientos
      .filter((mov) => String(mov.fecha || '').startsWith(key))
      .map((mov) => ({
        ...mov,
        estado_consolidado: getEstadoMovimientoConsolidado(mov)
      }));
    const resumenMes = derivarResumenFinanciero(movimientosMes);

    return {
      key,
      label: fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', ''),
      ingresos: resumenMes.ingresosConfirmados,
      egresos: resumenMes.egresosConfirmados,
      balance: resumenMes.balanceActual
    };
  });
}

export function construirSerieResumenMensualConsolidada({
  movimientos = [],
  gastosFijosPorCiclo = {},
  cotizaciones = [],
  ciclo = ''
}) {
  const [anioTexto, mesTexto] = String(ciclo || '').split('-');
  const anioBase = Number(anioTexto);
  const mesBase = Number(mesTexto) - 1;

  return Array.from({ length: 6 }, (_, index) => {
    const fecha = new Date(anioBase, mesBase - 5 + index, 1);
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const movimientosMes = movimientos.filter((mov) => String(mov.fecha || '').startsWith(key));
    const movimientosConsolidados = construirMovimientosConsolidadosDelCiclo({
      movimientos: movimientosMes,
      gastosFijos: gastosFijosPorCiclo[key] || [],
      cotizaciones,
      ciclo: key
    });
    const resumenMes = derivarResumenFinanciero(movimientosConsolidados);

    return {
      key,
      label: fecha.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }).replace('.', ''),
      ingresos: resumenMes.ingresosConfirmados,
      egresos: resumenMes.egresosConfirmados,
      balance: resumenMes.balanceActual
    };
  });
}
