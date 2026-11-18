import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import Icon from './Icon';
import { Alert, Field, Input } from './ui';

/** Sign-in form shared by the login page and the landing page. */
export default function LoginForm({ identifier: idProp, password: pwProp, onChange }) {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [own, setOwn] = useState({ identifier: '', password: '' });
  const controlled = idProp !== undefined;
  const identifier = controlled ? idProp : own.identifier;
  const password = controlled ? pwProp : own.password;
  const set = (patch) => (controlled ? onChange(patch) : setOwn((v) => ({ ...v, ...patch })));
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(identifier.trim(), password);
      const target = location.state?.from || (u.role === 'parent' ? '/app/portal' : '/app');
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.status === 429 ? t('auth.accountLocked') : err.message || t('auth.loginFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="authform">
      <Field label={t('auth.identifier')} required>
        <Input value={identifier} onChange={(e) => set({ identifier: e.target.value })} placeholder={t('auth.identifierPlaceholder')} autoComplete="username" />
      </Field>
      <Field label={t('auth.password')} required>
        <span className="passwordfield">
          <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => set({ password: e.target.value })} placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" />
          <button type="button" className="passwordfield__toggle" onClick={() => setShow((v) => !v)} aria-label={show ? t('common.hide') : t('common.show')}>
            <Icon name="eye" size={17} />
          </button>
        </span>
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy || !identifier || !password}>
        {busy && <span className="spinner spinner--light" />} {t('auth.signIn')}
        {!busy && <Icon name="arrowRight" size={17} />}
      </button>
      <div className="authform__links">
        <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
        <Link to="/apply">{t('landing.applyNow')}</Link>
      </div>
    </form>
  );
}
