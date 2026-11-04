import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import Icon from '../../components/Icon';
import { BrandMark, GeoPattern } from '../../components/Brand';
import { Alert, Brand, Field, Input } from '../../components/ui';

const DEMO = [
  { email: 'super@mduik.my', password: 'Admin@12345', role: 'users.superAdmin', scope: 'Semua sekolah' },
  { email: 'admin.tahfiz@mduik.my', password: 'Mduik@2026', role: 'users.schoolAdmin', scope: 'MDUIK Tahfiz' },
  { email: 'admin.islam@mduik.my', password: 'Mduik@2026', role: 'users.schoolAdmin', scope: 'MDUIK Pengajian Islam' },
  { email: 'bendahari@mduik.my', password: 'Mduik@2026', role: 'users.bursar', scope: 'MDUIK Tahfiz' },
  { email: 'guru1@mduik.my', password: 'Mduik@2026', role: 'users.teacher', scope: 'MDUIK Tahfiz' },
  { email: 'guru2@mduik.my', password: 'Mduik@2026', role: 'users.teacher', scope: 'MDUIK Pengajian Islam' },
  { email: 'ibubapa@mduik.my', password: 'Mduik@2026', role: 'users.parent', scope: 'Portal ibu bapa' },
];

export default function Login() {
  const { user, login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    document.title = `${t('auth.signIn')} · MDUIK`;
  }, [t]);

  if (user) {
    const target = location.state?.from || '/app';
    return <Navigate to={target} replace />;
  }

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

  function useDemo(account) {
    setIdentifier(account.email);
    setPassword(account.password);
    setError('');
  }

  return (
    <div className="authpage">
      <aside className="authpage__art">
        <div className="authpage__artbg" aria-hidden="true">
          <GeoPattern className="authpage__geo" />
          <span className="authpage__orb" />
        </div>
        <div className="authpage__arthead">
          <Link to="/"><Brand light /></Link>
          <Link to="/" className="authpage__back"><Icon name="arrowLeft" size={15} /> {t('apply.backToHome')}</Link>
        </div>
        <div className="authpage__artbody">
          <BrandMark size={88} className="authpage__seal" />
          <span className="eyebrow eyebrow--light">{t('landing.badge')}</span>
          <h1>{t('landing.heroTitle')} <em>{t('landing.heroHighlight')}</em></h1>
          <p>{t('landing.heroSubtitle')}</p>
          <div className="authpage__quotes">
            <div>
              <span className="authpage__quoteicon"><Icon name="checkCircle" size={18} /></span>
              <div>
                <strong>{t('landing.featureFinance')}</strong>
                <span>{t('landing.featureFinanceText')}</span>
              </div>
            </div>
            <div>
              <span className="authpage__quoteicon"><Icon name="parent" size={18} /></span>
              <div>
                <strong>{t('landing.featurePortal')}</strong>
                <span>{t('landing.featurePortalText')}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="authpage__artfoot">
          <span>© {new Date().getFullYear()} MDUIK</span>
          <span>{t('landing.footerNote')}</span>
        </div>
      </aside>

      <main className="authpage__main">
        <div className="authpage__top">
          <button type="button" className="langtoggle" onClick={() => setLang(lang === 'bm' ? 'en' : 'bm')}>
            <Icon name="globe" size={15} />
            <span className={lang === 'bm' ? 'is-on' : ''}>BM</span>
            <span className="langtoggle__sep">/</span>
            <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
          </button>
        </div>

        <div className="authcard">
          <div className="authcard__brand"><Brand /></div>
          <span className="authcard__icon"><Icon name="lock" size={22} /></span>
          <h2>{t('auth.welcomeBack')}</h2>
          <p className="muted">{t('auth.signInSubtitle')}</p>

          <form onSubmit={submit} className="authform">
            <Field label={t('auth.identifier')} required>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t('auth.identifierPlaceholder')} autoComplete="username" />
            </Field>
            <Field label={t('auth.password')} required>
              <span className="passwordfield">
                <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" />
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

          <div className="demobox">
            <button type="button" className="demobox__toggle" onClick={() => setShowDemo((v) => !v)} aria-expanded={showDemo}>
              <Icon name="users" size={16} />
              {t('auth.demoAccounts')}
              <Icon name="chevronDown" size={15} className={showDemo ? 'is-rotated' : ''} />
            </button>
            {showDemo && (
              <div className="demobox__body">
                <p>{t('auth.demoHint')}</p>
                <div className="demolist">
                  {DEMO.map((account) => (
                    <button type="button" className="demolist__item" key={account.email} onClick={() => useDemo(account)}>
                      <span className="demolist__avatar">{account.email[0].toUpperCase()}</span>
                      <span className="demolist__text">
                        <strong>{t(account.role)}</strong>
                        <small>{account.email} · {account.scope}</small>
                      </span>
                      <span className="demolist__use">{t('auth.useDemo')}</span>
                    </button>
                  ))}
                </div>
                <p className="demobox__ic">Portal ibu bapa juga boleh log masuk dengan IC <strong>850101145566</strong>.</p>
              </div>
            )}
          </div>
        </div>

        <p className="authpage__foot">
          <Icon name="lock" size={13} /> {t('privacy.title')} · <Link to="/privacy">{t('landing.privacy')}</Link>
        </p>
      </main>
    </div>
  );
}
