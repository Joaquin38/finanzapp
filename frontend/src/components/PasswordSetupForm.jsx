import { useMemo, useState } from 'react';

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 8) return 'La password debe tener al menos 8 caracteres.';
  if (!/[a-z]/.test(password)) return 'La password debe incluir una minuscula.';
  if (!/[A-Z]/.test(password)) return 'La password debe incluir una mayuscula.';
  if (!/\d/.test(password)) return 'La password debe incluir un numero.';
  return '';
}

export default function PasswordSetupForm({
  title,
  subtitle,
  submitLabel = 'Guardar',
  cancelLabel = '',
  loading = false,
  error = '',
  requireCurrentPassword = false,
  currentPasswordLabel = 'Password actual',
  currentPasswordPlaceholder = 'Ingresa tu password actual',
  onCancel,
  onSubmit
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [localError, setLocalError] = useState('');

  const formatHint = useMemo(
    () => 'Minimo 8 caracteres, con mayuscula, minuscula y numero.',
    []
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    const formatError = validatePassword(password);
    if (formatError) {
      setLocalError(formatError);
      return;
    }
    if (password !== passwordConfirm) {
      setLocalError('Las passwords no coinciden.');
      return;
    }
    setLocalError('');
    await onSubmit({
      currentPassword,
      password,
      confirmPassword: passwordConfirm
    });
  };

  return (
    <form className="password-setup-form" onSubmit={handleSubmit}>
      <div className="password-setup-copy">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>

      {requireCurrentPassword && (
        <label className="full-width">
          {currentPasswordLabel}
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder={currentPasswordPlaceholder}
            required
          />
        </label>
      )}

      <div className="password-setup-grid">
        <label>
          Nueva password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Nueva password"
            required
          />
          <small>{formatHint}</small>
        </label>

        <label>
          Repetir password
          <input
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            placeholder="Repeti la password"
            required
          />
        </label>
      </div>

      {(localError || error) && <p className="error full-width">{localError || error}</p>}

      <div className="confirm-actions full-width password-setup-actions">
        {onCancel && (
          <button type="button" className="btn-inline secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel || 'Cancelar'}
          </button>
        )}
        <button type="submit" className="btn-inline success" disabled={loading}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
