export default function CotizacionesPanel({ cotizaciones, onRefrescar }) {
  const cotizacionOficial = cotizaciones[0] || null;
  const valorOficial = Number(cotizacionOficial?.venta || 0);
  const valorAstropay = valorOficial > 0 ? valorOficial * 1.041 : 0;

  return (
    <section className="panel cotizaciones-panel">
      <div className="cotizaciones-header">
        <div className="panel-header">
          <h2>Cotizacion del dolar</h2>
        </div>
        <button type="button" className="cotizacion-refresh-btn" onClick={onRefrescar} aria-label="Actualizar cotizacion">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 0 0-13.66-5.66L4 8.67V4h4.67L6.9 5.77A6 6 0 0 1 18 12" />
            <path d="M4 12a8 8 0 0 0 13.66 5.66L20 15.33V20h-4.67l1.77-1.77A6 6 0 0 1 6 12" />
          </svg>
        </button>
      </div>

      <div className="cotizaciones-grid">
        {cotizacionOficial && (
          <>
            <article key={`${cotizacionOficial.fuente}-${cotizacionOficial.fecha}`} className="cotizacion-item cotizacion-item-primary">
              <span className="cotizacion-kicker">Cotizacion del dia</span>
              <h4>Dolar oficial</h4>
              <p className="cotizacion-price">${valorOficial.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </article>

            <article className="cotizacion-item cotizacion-item-accent">
              <span className="cotizacion-kicker">Oficial + 4.1%</span>
              <h4>Dolar Astropay</h4>
              <p className="cotizacion-price">${valorAstropay.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </article>
          </>
        )}
        {!cotizacionOficial && <p>No hay cotizacion oficial cargada todavia.</p>}
      </div>
    </section>
  );
}
