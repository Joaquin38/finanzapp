import logoFinanzApp from '../assets/finanzapp-logo.png';

const icons = {
  dashboard: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10.5V19h11v-8.5" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  movimientos: (
    <>
      <path d="M7 7h10" />
      <path d="M7 12h10" />
      <path d="M7 17h6" />
      <path d="M16 15l2 2 3-4" />
    </>
  ),
  gastos_fijos: (
    <>
      <path d="M7 5h10a2 2 0 0 1 2 2v12H5V7a2 2 0 0 1 2-2Z" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h4" />
    </>
  ),
  cotizacion: (
    <>
      <path d="M12 4v16" />
      <path d="M17 7.5c-.8-1-2.3-1.6-4.2-1.6-2.3 0-4 .9-4 2.7 0 4.1 8.4 1.7 8.4 5.9 0 1.8-1.7 3-4.2 3-2 0-3.6-.7-4.6-1.9" />
    </>
  ),
  ahorros: (
    <>
      <path d="M5 10h14v8H5z" />
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
    </>
  ),
  reportes: (
    <>
      <path d="M5 19V5" />
      <path d="M5 19h14" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </>
  ),
  configuracion: (
    <>
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a8 8 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 6.5h-4L10.6 9a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2.2-1.5Z" />
    </>
  ),
  superadmin: (
    <>
      <path d="M12 4 5 7v5c0 4.5 3 7 7 8 4-1 7-3.5 7-8V7l-7-3Z" />
      <path d="M9 12l2 2 4-5" />
    </>
  )
};

const items = [
  { key: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
  { key: 'movimientos', label: 'Movimientos', icon: icons.movimientos },
  { key: 'gastos_fijos', label: 'Valores fijos', icon: icons.gastos_fijos },
  { key: 'categorias', label: 'Categorias', icon: icons.configuracion },
  { key: 'cotizacion', label: 'Cotizacion dolar', icon: icons.cotizacion },
  { key: 'ahorros', label: 'Ahorros', icon: icons.ahorros },
  { key: 'reportes', label: 'Reportes', icon: icons.reportes },
  { key: 'mi_hogar', label: 'Mi hogar', icon: icons.configuracion },
  { key: 'superadmin', label: 'Superadmin', icon: icons.superadmin }
];

const menuGroups = [
  { title: 'GENERAL', keys: ['dashboard', 'movimientos'] },
  { title: 'GESTION', keys: ['gastos_fijos', 'categorias'] },
  { title: 'FINANZAS', keys: ['cotizacion', 'ahorros', 'reportes'] },
  { title: 'ADMIN', keys: ['mi_hogar', 'superadmin'] }
];

export default function MenuLateral({
  collapsed,
  onToggle,
  active,
  onSelect,
  canManageHome = true,
  canAccessFixedValues = true,
  isSuperadmin = false,
  userName = 'Usuario',
  userRole = '',
  theme = 'light',
  accountMenuOpen = false,
  accountMenuRef = null,
  canSwitchHogar = false,
  hogaresContexto = [],
  hogarId = '',
  hogarActivo = null,
  cicloCerrado = false,
  onAccountMenuToggle,
  onAccountMenuClose,
  onThemeToggle,
  onHogarChange,
  onLogout
}) {
  const visibleItems = items.filter((item) => {
    if (!canAccessFixedValues && item.key === 'gastos_fijos') return false;
    if (!isSuperadmin && item.key === 'superadmin') return false;
    if (!canManageHome && ['categorias', 'mi_hogar'].includes(item.key)) return false;
    return true;
  });
  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.keys.map((key) => visibleItems.find((item) => item.key === key)).filter(Boolean)
    }))
    .filter((group) => group.items.length > 0);
  const accountInitial = (userName || 'U').trim().charAt(0).toUpperCase();
  const goToConfig = () => {
    onSelect('mi_hogar');
    onAccountMenuClose?.();
  };

  return (
    <aside className={`menu-shell ${collapsed ? 'collapsed' : ''}`}>
      <div className="menu-brand">
        <img src={logoFinanzApp} alt="FinanzApp" className="menu-brand-logo" />
        {!collapsed && (
          <div className="menu-brand-text">
            <strong>FinanzApp</strong>
            <span>Panel financiero</span>
          </div>
        )}
      </div>

      <div className="menu-top">
        <h3>Menu</h3>
        <button type="button" className="toggle-menu" onClick={onToggle}>
          {collapsed ? '>>' : '<<'}
        </button>
      </div>

      <nav>
        {visibleGroups.map((group) => (
          <div className="menu-section" key={group.title}>
            {!collapsed && <span className="menu-section-title">{group.title}</span>}
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`menu-item ${active === item.key ? 'activo' : ''}`}
                type="button"
                title={item.label}
                onClick={() => onSelect(item.key)}
              >
                <span className="menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img">
                    {item.icon}
                  </svg>
                </span>
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-account account-menu" ref={accountMenuRef}>
        <button
          type="button"
          className="account-menu-trigger sidebar-account-trigger"
          onClick={onAccountMenuToggle}
          aria-expanded={accountMenuOpen}
          aria-haspopup="menu"
          title="Cuenta"
        >
          <span className="account-avatar" aria-hidden="true">{accountInitial}</span>
          {!collapsed && (
            <span className="account-trigger-copy">
              <strong>{userName}</strong>
              <small>{userRole || 'sin rol'}</small>
            </span>
          )}
          {!collapsed && <span className="account-chevron" aria-hidden="true" />}
        </button>

        {accountMenuOpen && (
          <div className="account-dropdown sidebar-account-dropdown" role="menu">
            <div className="account-dropdown-section">
              <span>Usuario</span>
              <strong>{userName}</strong>
              <small>{userRole || 'sin rol'}</small>
            </div>

            <div className="account-dropdown-section">
              {canSwitchHogar ? (
                <label className="selector-ciclo selector-hogar">
                  Hogar actual
                  <select value={String(hogarId)} onChange={onHogarChange}>
                    {hogaresContexto.map((hogar) => (
                      <option key={hogar.id} value={hogar.id}>
                        {hogar.nombre} #{hogar.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <span>Hogar actual</span>
                  <strong>{hogarActivo?.nombre || 'Hogar'} #{hogarId}</strong>
                </>
              )}
            </div>

            {cicloCerrado && <span className="pill success account-status-pill">Ciclo cerrado</span>}

            <div className="account-dropdown-divider" />

            <label className="account-theme-switch">
              <span>
                <strong>Modo oscuro</strong>
                <small>{theme === 'dark' ? 'Activado' : 'Desactivado'}</small>
              </span>
              <input type="checkbox" checked={theme === 'dark'} onChange={onThemeToggle} />
              <span className="account-switch-track" aria-hidden="true">
                <span className="account-switch-thumb" />
              </span>
            </label>

            {canManageHome && (
              <button type="button" className="account-action-btn" onClick={goToConfig}>
                Configuracion
              </button>
            )}

            <div className="account-dropdown-divider" />

            <button type="button" className="session-logout account-logout" onClick={onLogout}>
              Cerrar sesion
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
