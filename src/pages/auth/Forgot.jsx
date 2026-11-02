import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import Icon from '../../components/Icon';
import { Alert, Brand, Field, Input } from '../../components/ui';

export default function Forgot() {
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/forgot', { email: email.trim() });
      setSent(true);
      if (res.devLink) setDevLink(res.devLink);
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
        <span className="authcard__icon"><Icon name="mail" size={22} /></span>
        <h1>{t('auth.resetPassword')}</h1>
        <p className="muted">{t('auth.forgotSubtitle')}</p>
        {sent ? (
          <>
            <Alert tone="success">{t('auth.resetSent')}</Alert>
            {devLink && (
              <Alert tone="info" title="Demo">
                <a href={devLink}>{devLink}</a>
              </Alert>
            )}
            <Link to="/login" className="btn btn--primary btn--block">{t('auth.backToLogin')}</Link>
          </>
        ) : (
          <form onSubmit={submit} className="authform">
            <Field label={t('common.email')} required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email}>
              {busy && <span className="spinner spinner--light" />} {t('auth.sendReset')}
            </button>
            <Link to="/login" className="btn btn--ghost btn--block">{t('auth.backToLogin')}</Link>
          </form>
        )}
      </div>
    </div>
  );
}
