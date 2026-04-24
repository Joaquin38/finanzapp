import logoFinanzApp from '../assets/finanzapp-logo.png';
import PasswordSetupForm from './PasswordSetupForm.jsx';

export default function ResetPasswordPanel({
  validating,
  validToken,
  error,
  loading,
  onSubmit,
  onBackToLogin
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img src={logoFinanzApp} alt="FinanzApp" className="auth-logo" />
        <p className="eyebrow">FinanzApp</p>
        <h1>Restablecer password</h1>
        <p className="subtitle">
          {validating
            ? 'Estamos validando tu link.'
            : validToken
              ? 'Define una nueva password para recuperar el acceso.'
              : 'El link no es valido o ya no esta disponible.'}
        </p>

        {validating ? (
          <section className="auth-loading-block">
            <p className="subtitle">Validando token...</p>
          </section>
        ) : validToken ? (
          <>
            <PasswordSetupForm
              title="Nueva password"
              subtitle="Minimo 8 caracteres, con mayuscula, minuscula y numero."
              submitLabel="Guardar nueva password"
              loading={loading}
              error={error}
              onSubmit={onSubmit}
            />
          </>
        ) : (
          <>
            {error && <p className="auth-error">{error}</p>}
            <button type="button" className="auth-submit" onClick={onBackToLogin}>
              Volver al login
            </button>
          </>
        )}

        {!validating && validToken && (
          <button type="button" className="auth-link-btn" onClick={onBackToLogin}>
            Volver al login
          </button>
        )}
      </section>
    </main>
  );
}
