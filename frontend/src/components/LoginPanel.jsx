import { useState } from 'react';
import logoFinanzApp from '../assets/finanzapp-logo.png';

export default function LoginPanel({ onLogin, onForgotPassword, loading, error, forgotPasswordMessage }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mode === 'forgot') {
      await onForgotPassword({ email });
      return;
    }
    await onLogin({ email, password });
  };

  return (
    <main className="auth-shell">
      <section className={`auth-card ${mode === 'login' ? 'auth-card-login' : ''}`}>
        <img src={logoFinanzApp} alt="FinanzApp" className="auth-logo" />
        <p className="eyebrow auth-eyebrow">FinanzApp</p>
        <h1 className="auth-title">{mode === 'forgot' ? 'Olvide mi password' : 'Iniciar sesion'}</h1>
        {mode === 'forgot' && (
          <p className="subtitle">
            Ingresa tu email y te enviaremos un link para restablecer tu password.
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
              required
            />
          </label>

          {mode === 'login' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ingresa tu password"
                required
              />
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}
          {forgotPasswordMessage && <p className="success-message auth-success">{forgotPasswordMessage}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (mode === 'forgot' ? 'Enviando...' : 'Ingresando...') : (mode === 'forgot' ? 'Enviar link' : 'Ingresar')}
          </button>

          <button
            type="button"
            className="auth-link-btn"
            onClick={() => {
              setPassword('');
              setMode((current) => (current === 'login' ? 'forgot' : 'login'));
            }}
          >
            {mode === 'forgot' ? 'Volver al login' : 'Olvide mi password'}
          </button>
        </form>
      </section>
    </main>
  );
}
