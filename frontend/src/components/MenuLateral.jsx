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
  mi_hogar: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10.5V19h11v-8.5" />
      <path d="M9 19v-4h6v4" />
      <path d="M9 10h6" />
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
  { key: 'cotizacion', label: 'Cotizacion dolar', icon: icons.cotizacion },
  { key: 'ahorros', label: 'Ahorros', icon: icons.ahorros },
  { key: 'reportes', label: 'Reportes', icon: icons.reportes },
  { key: 'mi_hogar', label: 'Mi hogar', icon: icons.mi_hogar },
  { key: 'superadmin', label: 'Superadmin', icon: icons.superadmin }
];

export default function MenuLateral({
  collapsed,
  onToggle,
  active,
  onSelect,
  canManageHome = true,
  canAccessFixedValues = true,
  isSuperadmin = false
}) {
  const visibleItems = items.filter((item) => {
    if (!canAccessFixedValues && item.key === 'gastos_fijos') return false;
    if (!canManageHome && item.key === 'mi_hogar') return false;
    if (!isSuperadmin && item.key === 'superadmin') return false;
    return true;
  });

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
        {visibleItems.map((item) => (
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
      </nav>
    </aside>
  );
}
