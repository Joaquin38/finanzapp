function formatFecha(fecha) {
  if (!fecha) return '-';
  const raw = String(fecha);
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) {
    const [, anio, mes, dia] = matchIso;
    return `${dia}/${mes}/${anio}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fecha;
  const dia = String(date.getUTCDate()).padStart(2, '0');
  const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
  const anio = date.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MovimientosTable({
  movimientos,
  categoriasDisponibles = [],
  onEditar,
  onEliminar,
  onNuevo,
  mostrarEliminados,
  onToggleEliminados,
  onEditarFijo,
  onEliminarFijo,
  filtros,
  onFiltrosChange,
  orden,
  onOrdenChange,
  getEstadoMovimiento,
  onToggleEstadoPago,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  canManageFixedValues = true,
  canToggleEstado = true,
  actionLoading = false
}) {
  const resolverEstado = getEstadoMovimiento || ((mov) => (mov.esProyectado ? 'proyectado' : mov.activo ? 'pagado' : 'pendiente'));
  const etiquetaEstado = (mov) => {
    const estado = resolverEstado(mov);
    if (mov.tipo_movimiento === 'ingreso' && estado === 'registrado') return 'cobrado';
    return estado;
  };
  const etiquetaOrigen = (mov) => (mov.esProyectado ? 'fijo' : 'manual');
  const etiquetaEspecial = (mov) =>
    mov.clasificacion_movimiento === 'saldo_inicial'
      ? 'saldo inicial'
      : mov.clasificacion_movimiento === 'ajuste_cierre'
      ? 'ajuste cierre'
      : '';
  const claseBadgeEspecial = (mov) =>
    mov.clasificacion_movimiento === 'saldo_inicial' ? 'badge-special-saldo' : 'badge-special-ajuste';
  const sortIndicator = (campo) => (orden.campo === campo ? (orden.direccion === 'asc' ? ' ▲' : ' ▼') : '');
  const toggleSort = (campo) => {
    onOrdenChange((prev) => {
      if (prev.campo === campo) {
        return { campo, direccion: prev.direccion === 'asc' ? 'desc' : 'asc', manual: true };
      }
      return { campo, direccion: 'asc', manual: true };
    });
  };

  return (
    <section className="panel panel-table">
      <div className="panel-header table-header">
        <div>
          <h2>Movimientos del ciclo</h2>
          <span className="pill muted">{movimientos.length} registros</span>
        </div>
        <div className="table-actions">
          {canCreate && (
            <button type="button" onClick={onNuevo} disabled={actionLoading}>
              + Nuevo movimiento
            </button>
          )}
          <label className="toggle-eliminados">
            <input type="checkbox" checked={mostrarEliminados} onChange={(e) => onToggleEliminados(e.target.checked)} />
            Ver eliminados
          </label>
        </div>
      </div>
      <div className="table-filters">
        <label className="table-search-filter">
          Buscar descripcion
          <input
            type="search"
            value={filtros.busqueda || ''}
            onChange={(e) => onFiltrosChange((prev) => ({ ...prev, busqueda: e.target.value }))}
            placeholder="Ej: supermercado, nafta, farmacia"
          />
        </label>
        <label className="table-date-filter">
          Desde
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => onFiltrosChange((prev) => ({ ...prev, fechaDesde: e.target.value }))}
          />
        </label>
        <label className="table-date-filter">
          Hasta
          <input
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => onFiltrosChange((prev) => ({ ...prev, fechaHasta: e.target.value }))}
          />
        </label>
        <label className="table-select-filter">
          Tipo
          <select
            value={filtros.tipoMovimiento}
            onChange={(e) => onFiltrosChange((prev) => ({ ...prev, tipoMovimiento: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
            <option value="ahorro">Ahorro</option>
          </select>
        </label>
        <label className="table-select-filter">
          Categoria
          <select value={filtros.categoria} onChange={(e) => onFiltrosChange((prev) => ({ ...prev, categoria: e.target.value }))}>
            <option value="">Todas</option>
            {categoriasDisponibles.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('fecha')}>Fecha{sortIndicator('fecha')}</th>
              <th className="sortable" onClick={() => toggleSort('tipo_movimiento')}>Tipo{sortIndicator('tipo_movimiento')}</th>
              <th className="sortable" onClick={() => toggleSort('categoria')}>Categoria{sortIndicator('categoria')}</th>
              <th>Descripcion</th>
              <th className="sortable" onClick={() => toggleSort('monto_ars')}>Monto ARS{sortIndicator('monto_ars')}</th>
              <th className="sortable" onClick={() => toggleSort('estado')}>Estado{sortIndicator('estado')}</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((mov) => (
              <tr key={mov.id} className={mov.esProyectado ? 'row-proyectado' : ''}>
                <td>{formatFecha(mov.fecha)}</td>
                <td>
                  <span className={`badge badge-${mov.tipo_movimiento}`}>{mov.tipo_movimiento}</span>
                  <span className={`badge ${mov.esProyectado ? 'badge-fijo' : 'badge-origen'}`}>{etiquetaOrigen(mov)}</span>
                  {mov.clasificacion_movimiento && mov.clasificacion_movimiento !== 'normal' && (
                    <span className={`badge ${claseBadgeEspecial(mov)}`}>{etiquetaEspecial(mov)}</span>
                  )}
                </td>
                <td>{mov.categoria || '-'}</td>
                <td>
                  <div className="movement-main">{mov.descripcion || '-'}</div>
                  {(mov.usa_ahorro || (mov.esProyectado && mov.ajuste_en_ciclo)) && (
                    <div className="movement-meta">
                      {mov.usa_ahorro && <span className="badge badge-ahorro-meta">usa ahorro</span>}
                      {mov.esProyectado && mov.ajuste_en_ciclo && <span className="badge badge-ajuste">ajustado</span>}
                    </div>
                  )}
                </td>
                <td>{formatMoney(mov.monto_ars)}</td>
                <td>
                  <span className={`badge badge-estado-${resolverEstado(mov)}`}>
                    {etiquetaEstado(mov)}
                  </span>
                </td>
                <td>
                  <div className="acciones-inline">
                    {canToggleEstado && ['egreso', 'ingreso', 'ahorro'].includes(mov.tipo_movimiento) && (
                      <button
                        type="button"
                        className={`btn-inline ${['pagado', 'registrado'].includes(resolverEstado(mov)) ? 'success' : ''}`}
                        title={
                          mov.tipo_movimiento === 'egreso'
                            ? resolverEstado(mov) === 'pagado'
                              ? 'Marcar pendiente'
                              : 'Marcar pagado'
                            : resolverEstado(mov) === 'registrado'
                            ? 'Volver a proyectado'
                            : mov.tipo_movimiento === 'ingreso'
                            ? 'Marcar cobrado'
                            : 'Marcar registrado'
                        }
                        onClick={() => onToggleEstadoPago?.(mov)}
                        disabled={actionLoading}
                      >
                        {mov.tipo_movimiento === 'egreso'
                          ? resolverEstado(mov) === 'pagado'
                            ? '↩'
                            : '✅'
                          : resolverEstado(mov) === 'registrado'
                          ? '↩'
                          : mov.tipo_movimiento === 'ingreso'
                          ? '🧾'
                          : '🏦'}
                      </button>
                    )}
                    {(mov.esProyectado ? canManageFixedValues : canEdit) && (
                    <button
                      type="button"
                      className="btn-inline secondary"
                      title="Editar"
                      disabled={!mov.activo || actionLoading}
                      onClick={() => (mov.esProyectado ? onEditarFijo?.(mov) : onEditar(mov))}
                    >
                      ✏️
                    </button>
                    )}
                    {(mov.esProyectado ? canManageFixedValues : canDelete) && (
                    <button
                      type="button"
                      className="btn-inline danger"
                      title="Eliminar"
                      disabled={!mov.activo || actionLoading}
                      onClick={() => (mov.esProyectado ? onEliminarFijo?.(mov) : onEliminar(mov.id))}
                    >
                      🗑️
                    </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={7}>Todavia no hay movimientos cargados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
