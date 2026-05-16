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

function formatFechaHora(fecha) {
  if (!fecha) return '-';
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function MovimientosTable({
  movimientos,
  categoriasDisponibles = [],
  title = 'Movimientos del ciclo',
  onEditar,
  onEliminar,
  onNuevo,
  onVerTodos,
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
  actionLoading = false,
  loading = false,
  showFilters = true,
  showDeletedToggle = true,
  variant = 'default',
  secondaryActionLabel = 'Ver todos',
  headerNote = '',
  totalCount = null,
  expanded = false
}) {
  const resolverEstado = getEstadoMovimiento || ((mov) => (mov.esProyectado ? 'proyectado' : mov.activo ? 'pagado' : 'pendiente'));
  const etiquetaEstado = (mov) => {
    const estado = resolverEstado(mov);
    if (mov.tipo_movimiento === 'ingreso' && estado === 'registrado') return 'cobrado';
    return estado;
  };
  const etiquetaOrigen = (mov) => (mov.esEstimadoTarjetas ? 'estimado' : mov.esProyectado ? 'fijo' : 'manual');
  const claseOrigen = (mov) => (mov.esEstimadoTarjetas ? 'badge-origen' : mov.esProyectado ? 'badge-fijo' : 'badge-origen');
  const esAccionable = (mov) => !mov.esEstimadoTarjetas;
  const etiquetaEspecial = (mov) =>
    mov.clasificacion_movimiento === 'saldo_inicial'
      ? 'saldo inicial'
      : mov.clasificacion_movimiento === 'ajuste_cierre'
      ? 'ajuste cierre'
      : '';
  const claseBadgeEspecial = (mov) =>
    mov.clasificacion_movimiento === 'saldo_inicial' ? 'badge-special-saldo' : 'badge-special-ajuste';
  const auditoriaMovimiento = (mov) => {
    if (mov.esProyectado) return null;
    const usuario = mov.creado_por_usuario_nombre || (mov.creado_por_usuario_id ? `Usuario #${mov.creado_por_usuario_id}` : 'Sin usuario');
    return { usuario, fecha: formatFechaHora(mov.creado_en) };
  };
  const renderAuditoria = (mov) => {
    const auditoria = auditoriaMovimiento(mov);
    if (!auditoria) return null;
    return (
      <span className="movement-audit" tabIndex={0} aria-label={`Registrado por ${auditoria.usuario} el ${auditoria.fecha}`}>
        i
        <span className="movement-audit-tooltip">
          <span>Registrado por {auditoria.usuario}</span>
          <span>{auditoria.fecha}</span>
        </span>
      </span>
    );
  };
  const sortIndicator = (campo) => (orden.campo === campo ? (orden.direccion === 'asc' ? ' ▲' : ' ▼') : '');
  const toggleSort = (campo) => {
    onOrdenChange((prev) => {
      if (prev.campo === campo) {
        return { campo, direccion: prev.direccion === 'asc' ? 'desc' : 'asc', manual: true };
      }
      return { campo, direccion: 'asc', manual: true };
    });
  };
  const accionEstadoLabel = (mov) =>
    mov.tipo_movimiento === 'egreso'
      ? resolverEstado(mov) === 'pagado'
        ? 'Marcar pendiente'
        : 'Marcar pagado'
      : resolverEstado(mov) === 'registrado'
      ? 'Volver a proyectado'
      : mov.tipo_movimiento === 'ingreso'
      ? 'Marcar cobrado'
      : 'Marcar registrado';
  const renderAccionesMobile = (mov) => (
    <div className="movement-mobile-actions-list">
      {esAccionable(mov) && canToggleEstado && ['egreso', 'ingreso', 'ahorro'].includes(mov.tipo_movimiento) && (
        <button
          type="button"
          className={`btn-inline ${['pagado', 'registrado'].includes(resolverEstado(mov)) ? 'success' : ''}`}
          title={accionEstadoLabel(mov)}
          onClick={() => onToggleEstadoPago?.(mov)}
          disabled={actionLoading}
        >
          {accionEstadoLabel(mov)}
        </button>
      )}
      {esAccionable(mov) && (mov.esProyectado ? canManageFixedValues : canEdit) && (
        <button
          type="button"
          className="btn-inline secondary"
          title="Editar"
          disabled={!mov.activo || actionLoading}
          onClick={() => (mov.esProyectado ? onEditarFijo?.(mov) : onEditar(mov))}
        >
          Editar
        </button>
      )}
      {esAccionable(mov) && (mov.esProyectado ? canManageFixedValues : canDelete) && (
        <button
          type="button"
          className="btn-inline danger"
          title="Eliminar"
          disabled={!mov.activo || actionLoading}
          onClick={() => (mov.esProyectado ? onEliminarFijo?.(mov) : onEliminar(mov.id))}
        >
          Eliminar
        </button>
      )}
    </div>
  );
  const cantidadLabel = loading
    ? 'Cargando...'
    : totalCount && totalCount > movimientos.length
      ? `${movimientos.length} de ${totalCount} registros`
      : `${movimientos.length} registros`;

  return (
    <section className={`panel panel-table panel-table-${variant} ${expanded ? 'panel-table-expanded' : ''} ${loading ? 'is-loading' : ''}`}>
      {loading && (
        <div className="grid-loading-overlay" role="status" aria-live="polite">
          <span className="btn-spinner" aria-hidden="true" />
          <strong>Actualizando movimientos...</strong>
        </div>
      )}
      <div className="panel-header table-header">
        <div>
          <h2>{title}</h2>
          {headerNote && <small className="table-header-note">{headerNote}</small>}
          <span className="pill muted">{cantidadLabel}</span>
        </div>
        <div className="table-actions">
          {canCreate && (
            <button type="button" onClick={onNuevo} disabled={actionLoading}>
              + Nuevo movimiento
            </button>
          )}
          {onVerTodos && (
            <button type="button" className="btn-inline secondary" onClick={onVerTodos}>
              {secondaryActionLabel}
            </button>
          )}
          {showDeletedToggle && (
            <label className="toggle-eliminados">
              <input type="checkbox" checked={mostrarEliminados} onChange={(e) => onToggleEliminados(e.target.checked)} />
              Ver eliminados
            </label>
          )}
        </div>
      </div>
      {showFilters && (
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
        <label className="table-select-filter">
          Estado
          <select value={filtros.estado || ''} onChange={(e) => onFiltrosChange((prev) => ({ ...prev, estado: e.target.value }))}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="proyectado">Proyectado</option>
            <option value="pagado">Pagado</option>
            <option value="registrado">Registrado</option>
            <option value="cobrado">Cobrado</option>
          </select>
        </label>
        </div>
      )}
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
                <td>
                  <div className="movement-date-cell">
                    {renderAuditoria(mov)}
                    <span>{formatFecha(mov.fecha)}</span>
                  </div>
                </td>
                <td>
                  <span className={`badge badge-${mov.tipo_movimiento}`}>{mov.tipo_movimiento}</span>
                  <span className={`badge ${claseOrigen(mov)}`}>{etiquetaOrigen(mov)}</span>
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
                    {esAccionable(mov) && canToggleEstado && ['egreso', 'ingreso', 'ahorro'].includes(mov.tipo_movimiento) && (
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
                    {esAccionable(mov) && (mov.esProyectado ? canManageFixedValues : canEdit) && (
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
                    {esAccionable(mov) && (mov.esProyectado ? canManageFixedValues : canDelete) && (
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
      <div className="movements-mobile-list">
        {movimientos.map((mov) => {
          const auditoria = auditoriaMovimiento(mov);
          const mostrarMenu = auditoria || esAccionable(mov);
          return (
            <article key={mov.id} className={`movement-mobile-card ${mov.esProyectado ? 'row-proyectado' : ''}`}>
              <div className="movement-mobile-top">
                <span className="movement-mobile-date">{formatFecha(mov.fecha)}</span>
                <strong className="movement-mobile-amount">{formatMoney(mov.monto_ars)}</strong>
              </div>
              <div className="movement-mobile-main">
                <strong>{mov.categoria || '-'}</strong>
                <span>{mov.descripcion || '-'}</span>
              </div>
              <div className="movement-mobile-badges">
                <span className={`badge badge-${mov.tipo_movimiento}`}>{mov.tipo_movimiento}</span>
                <span className={`badge ${claseOrigen(mov)}`}>{etiquetaOrigen(mov)}</span>
                {mov.clasificacion_movimiento && mov.clasificacion_movimiento !== 'normal' && (
                  <span className={`badge ${claseBadgeEspecial(mov)}`}>{etiquetaEspecial(mov)}</span>
                )}
                <span className={`badge badge-estado-${resolverEstado(mov)}`}>{etiquetaEstado(mov)}</span>
                {mov.usa_ahorro && <span className="badge badge-ahorro-meta">usa ahorro</span>}
                {mov.esProyectado && mov.ajuste_en_ciclo && <span className="badge badge-ajuste">ajustado</span>}
              </div>
              {mostrarMenu && (
                <details className="movement-card-menu">
                  <summary aria-label="Acciones">...</summary>
                  <div className="movement-card-menu-panel">
                    {auditoria && (
                      <span className="movement-card-detail">
                        Registrado por {auditoria.usuario} - {auditoria.fecha}
                      </span>
                    )}
                    {renderAccionesMobile(mov)}
                  </div>
                </details>
              )}
            </article>
          );
        })}
        {movimientos.length === 0 && <div className="movement-mobile-empty">Todavia no hay movimientos cargados.</div>}
      </div>
    </section>
  );
}
