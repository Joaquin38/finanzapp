import { useState } from 'react';
import logoFinanzApp from '../assets/finanzapp-logo.png';

export default function LoginPanel({ onLogin, loading, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin({ email, password });
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img src={logoFinanzApp} alt="FinanzApp" className="auth-logo" />
        <p className="eyebrow">FinanzApp</p>
        <h1>Iniciar sesion</h1>
        <p className="subtitle">Entra con tu email y password para acceder al panel del hogar.</p>

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

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}
