import visibleIcon from '../assets/amounts-visible.png';
import hiddenIcon from '../assets/amounts-hidden.png';

function FormattedAmount({ value, hidden }) {
  if (hidden) {
    return <strong className="amount-hidden">$ ••••••</strong>;
  }

  return <strong>${Number(value || 0).toLocaleString('es-AR')}</strong>;
}

export default function ResumenCards({ resumen, amountsHidden = false, onToggleAmountsHidden }) {
  const { ingresos = 0, egresos = 0, balance_actual = 0, balance_proyectado = 0 } = resumen || {};
  const toggleLabel = amountsHidden ? 'Mostrar' : 'Ocultar';

  return (
    <section className="dashboard-cards-block">
      <div className="dashboard-cards-toolbar">
        <button
          type="button"
          className="amount-privacy-toggle"
          onClick={onToggleAmountsHidden}
          aria-pressed={amountsHidden}
          aria-label={`${toggleLabel} importes del dashboard`}
          title={`${toggleLabel} importes`}
        >
          <img src={amountsHidden ? hiddenIcon : visibleIcon} alt="" aria-hidden="true" />
        </button>
      </div>

      <div className="cards-grid">
        <article className="card card-income">
          <h3>Ingresos</h3>
          <p>
            <FormattedAmount value={ingresos} hidden={amountsHidden} />
          </p>
        </article>

        <article className="card card-expense">
          <h3>Egresos</h3>
          <p>
            <FormattedAmount value={egresos} hidden={amountsHidden} />
          </p>
        </article>

        <article className="card card-balance card-balance-featured">
          <h3>Balance actual</h3>
          <small>Ingresos registrados - egresos pagados</small>
          <p className={balance_actual >= 0 ? 'positivo' : 'negativo'}>
            <FormattedAmount value={balance_actual} hidden={amountsHidden} />
          </p>
        </article>

        <article className="card card-balance">
          <h3>Balance proyectado</h3>
          <small>Todos los ingresos - todos los egresos</small>
          <p className={balance_proyectado >= 0 ? 'positivo' : 'negativo'}>
            <FormattedAmount value={balance_proyectado} hidden={amountsHidden} />
          </p>
        </article>
      </div>
    </section>
  );
}
