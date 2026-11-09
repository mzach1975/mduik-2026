import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import Icon from '../../components/Icon';
import { Alert, Brand, Field, Input } from '../../components/ui';

/** Shown instead of every page until a parent or teacher replaces the first password (their IC / Passport No.). */
export default function ForcePassword() {
  const { t, lang, setLang } = useI18n();
  const { refresh, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: password });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authsimple">
      <header className="authsimple__head">
        <Brand />
        <button type="button" className="langtoggle" onClick={() => setLang(lang === 'bm' ? 'en' : 'bm')}>
          <Icon name="globe" size={15} />
          <span className={lang === 'bm' ? 'is-on' : ''}>BM</span>
          <span className="langtoggle__sep">/</span>
          <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
        </button>
      </header>
      <div className="authsimple__card">
        <span className="authcard__icon"><Icon name="lock" size={22} /></span>
        <h1>{t('auth.firstPasswordTitle')}</h1>
        <p className="muted">{t('auth.firstPasswordSubtitle')}</p>
        <form onSubmit={submit} className="authform">
          <Field label={t('auth.currentPassword')} required hint={t('auth.firstPasswordCurrentHint')}>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label={t('auth.newPassword')} required hint={t('auth.firstPasswordHint')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label={t('auth.confirmPassword')} required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy && <span className="spinner spinner--light" />} {t('auth.changePassword')}
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={logout}>{t('auth.signOut')}</button>
        </form>
      </div>
    </div>
  );
}
