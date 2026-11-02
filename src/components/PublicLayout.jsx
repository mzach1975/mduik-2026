import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useAuth } from '../auth';
import Icon from './Icon';
import { Brand } from './ui';

export default function PublicLayout() {
  const { t, lang, setLang } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const links = [
    { to: '/', label: t('landing.badge'), end: true },
    { to: '/apply', label: t('landing.applyNow') },
    { to: '/status', label: t('landing.checkStatus') },
    { to: '/privacy', label: t('landing.privacy') },
  ];

  return (
    <div className="public">
      <header className={`pubhead ${location.pathname !== '/' ? 'pubhead--solid' : ''}`.trim()}>
        <div className="pubhead__inner">
          <Link to="/" className="pubhead__brand" onClick={() => setOpen(false)}>
            <Brand />
          </Link>
          <nav className={`pubnav ${open ? 'pubnav--open' : ''}`.trim()}>
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className={location.pathname === l.to ? 'is-active' : ''}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="pubhead__actions">
            <button type="button" className="langtoggle langtoggle--dark" onClick={() => setLang(lang === 'bm' ? 'en' : 'bm')} title={t('common.language')}>
              <Icon name="globe" size={15} />
              <span className={lang === 'bm' ? 'is-on' : ''}>BM</span>
              <span className="langtoggle__sep">/</span>
              <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
            </button>
            <Link to={user ? '/app' : '/login'} className="btn btn--primary btn--sm">
              {user ? t('nav.dashboard') : t('landing.signIn')}
              <Icon name="arrowRight" size={15} />
            </Link>
            <button type="button" className="pubhead__burger" onClick={() => setOpen((v) => !v)} aria-label={t('nav.mainMenu')}>
              <Icon name={open ? 'close' : 'menu'} size={22} />
            </button>
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="pubfoot">
        <div className="pubfoot__inner">
          <div className="pubfoot__brand">
            <Brand light />
            <p>{t('landing.footerNote')}</p>
          </div>
          <div className="pubfoot__col">
            <h4>{t('nav.admissions')}</h4>
            <Link to="/apply">{t('landing.applyNow')}</Link>
            <Link to="/status">{t('landing.checkStatus')}</Link>
            <Link to="/login">{t('landing.parentPortal')}</Link>
          </div>
          <div className="pubfoot__col">
            <h4>{t('common.schools')}</h4>
            <Link to="/privacy">{t('landing.privacy')}</Link>
            <a href="mailto:admin@mduik.my">admin@mduik.my</a>
            <span>+60 3-0000 0000</span>
          </div>
          <div className="pubfoot__col pubfoot__col--note">
            <h4>{t('common.language')}</h4>
            <button type="button" className="pubfoot__lang" onClick={() => setLang(lang === 'bm' ? 'en' : 'bm')}>
              <Icon name="globe" size={15} /> {lang === 'bm' ? 'Bahasa Melayu' : 'English'}
            </button>
          </div>
        </div>
        <div className="pubfoot__bottom">
          <span>© {new Date().getFullYear()} MDUIK. {t('footer.rights')}</span>
          <span>{t('landing.builtFor')}</span>
        </div>
      </footer>
    </div>
  );
}
