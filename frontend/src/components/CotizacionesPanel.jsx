export default function CotizacionesPanel({ cotizaciones, onRefrescar }) {
  const cotizacionOficial = cotizaciones[0] || null;

  return (
    <section className="panel cotizaciones-panel">
      <div className="panel-header">
        <h2>Cotizacion dolar</h2>
        <p>Valor oficial de venta obtenido automaticamente desde API publica.</p>
      </div>
      <button type="button" onClick={onRefrescar}>
        Actualizar desde API publica
      </button>

      <div className="cotizaciones-grid">
        {cotizacionOficial && (
          <article key={`${cotizacionOficial.fuente}-${cotizacionOficial.fecha}`} className="cotizacion-item">
            <h4>Dolar oficial</h4>
            <p>Fecha: {cotizacionOficial.fecha}</p>
            <p>Venta: ${Number(cotizacionOficial.venta || 0).toLocaleString('es-AR')}</p>
          </article>
        )}
        {!cotizacionOficial && <p>No hay cotizacion oficial cargada todavia.</p>}
      </div>
    </section>
  );
}
