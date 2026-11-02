import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import Icon from '../../components/Icon';
import { Alert, Brand, Field, Input } from '../../components/ui';

export default function ResetPassword() {
  const { t, lang, setLang } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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
      await api.post('/auth/reset', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authsimple">
      <header className="authsimple__head">
        <Link to="/"><Brand /></Link>
        <button type="button" className="langtoggle" onClick={() => setLang(lang === 'bm' ? 'en' : 'bm')}>
          <Icon name="globe" size={15} />
          <span className={lang === 'bm' ? 'is-on' : ''}>BM</span>
          <span className="langtoggle__sep">/</span>
          <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
        </button>
      </header>
      <div className="authsimple__card">
        <span className="authcard__icon"><Icon name="lock" size={22} /></span>
        <h1>{t('auth.resetPassword')}</h1>
        <p className="muted">{t('auth.resetSubtitle')}</p>
        {!token && <Alert tone="danger">{t('errors.generic')} — token.</Alert>}
        {done ? (
          <>
            <Alert tone="success">{t('auth.resetDone')}</Alert>
            <Link to="/login" className="btn btn--primary btn--block">{t('auth.backToLogin')}</Link>
          </>
        ) : (
          <form onSubmit={submit} className="authform">
            <Field label={t('auth.newPassword')} required hint={t('auth.newPasswordHint')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label={t('auth.confirmPassword')} required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || !token}>
              {busy && <span className="spinner spinner--light" />} {t('auth.resetPassword')}
            </button>
            <Link to="/login" className="btn btn--ghost btn--block">{t('auth.backToLogin')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}
