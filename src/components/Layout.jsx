import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { api } from '../api';
import { useApi } from '../hooks';
import Icon from './Icon';
import { GeoPattern } from './Brand';
import { Avatar, Brand, RoleBadge } from './ui';

const ROLE_LABEL = {
  super_admin: 'users.superAdmin',
  school_admin: 'users.schoolAdmin',
  bursar: 'users.bursar',
  teacher: 'users.teacher',
  parent: 'users.parent',
};

function navSections(role, isSuper, hasSchool) {
  const superOnly = role === 'super';
  const admin = role === 'school_admin' || (isSuper && hasSchool);
  const finance = admin || role === 'bursar';
  const teacher = role === 'teacher';
  const parent = role === 'parent';
  const sections = [];

  if (!parent) {
    sections.push({
      id: 'main',
      label: 'nav.mainMenu',
      items: [{ to: '/app', label: 'nav.dashboard', icon: 'dashboard', end: true }],
    });
  }

  if (admin || teacher) {
    sections.push({
      id: 'admissions',
      label: 'nav.admissions',
      items: [
        { to: '/app/applications', label: 'nav.applications', icon: 'file' },
        { to: '/app/interviews', label: 'nav.interviews', icon: 'teacher' },
      ],
    });
  }

  if (admin || role === 'bursar') {
    sections.push({
      id: 'records',
      label: 'nav.records',
      items: [
        { to: '/app/students', label: 'nav.students', icon: 'student' },
        { to: '/app/teachers', label: 'nav.teachers', icon: 'teacher' },
        { to: '/app/parents', label: 'nav.parents', icon: 'parent' },
      ],
    });
  }

  if (finance) {
    sections.push({
      id: 'finance',
      label: 'nav.finance',
      items: [
        { to: '/app/invoices', label: 'nav.invoices', icon: 'invoice' },
        { to: '/app/payments', label: 'nav.payments', icon: 'payment' },
        { to: '/app/receipts', label: 'nav.receipts', icon: 'receipt' },
        { to: '/app/arrears', label: 'nav.arrears', icon: 'clock' },
        { to: '/app/refunds', label: 'nav.refunds', icon: 'refund' },
        { to: '/app/write-offs', label: 'nav.writeOffs', icon: 'writeoff' },
        { to: '/app/adjustments', label: 'nav.adjustments', icon: 'adjust' },
        { to: '/app/ledger', label: 'nav.ledger', icon: 'book' },
      ],
    });
  }

  if (admin || role === 'bursar' || superOnly) {
    sections.push({
      id: 'operations',
      label: 'nav.operations',
      items: [{ to: '/app/reports', label: 'nav.reports', icon: 'report' }],
    });
  }

  if (parent) {
    sections.push({
      id: 'portal',
      label: 'nav.portal',
      items: [{ to: '/app/portal', label: 'nav.myChildren', icon: 'parent' }],
    });
  }

  if (admin || superOnly) {
    const items = [];
    if (isSuper) {
      items.push(
        { to: '/app/schools', label: 'nav.schools', icon: 'school' },
        { to: '/app/announcements', label: 'nav.announcements', icon: 'megaphone' },
      );
    }
    items.push(
      { to: '/app/users', label: 'nav.users', icon: 'users' },
      { to: '/app/audit', label: 'nav.audit', icon: 'audit' },
      { to: '/app/imports', label: 'nav.imports', icon: 'import' },
      { to: '/app/retention', label: 'nav.retention', icon: 'retention' },
    );
    sections.push({ id: 'administration', label: 'nav.administration', items });
  }

  sections.push({
    id: 'account',
    label: 'nav.settings',
    items: [
      { to: '/app/notifications', label: 'nav.notifications', icon: 'bell' },
      { to: '/app/settings', label: 'nav.settings', icon: 'settings' },
    ],
  });

  return sections;
}

export default function Layout() {
  const { user, logout, switchSchool } = useAuth();
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [switching, setSwitching] = useState(false);
  const menuRef = useRef(null);

  const role = user?.isSuper && !user.activeSchool ? 'super' : user?.role;
  const sections = useMemo(() => navSections(role, !!user?.isSuper, !!user?.activeSchool), [role, user?.isSuper, user?.activeSchool]);

  const { data: schoolData } = useApi('/schools', { enabled: !!user?.isSuper });
  const { data: notifData, reload: reloadNotif } = useApi('/notifications');
  const unread = (notifData?.notifications || []).filter((n) => !n.read_at).length;

  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menu) return undefined;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu]);

  useEffect(() => {
    const refresh = () => reloadNotif(true);
    window.addEventListener('mduik:notifications', refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('mduik:notifications', refresh);
      clearInterval(timer);
    };
  }, [reloadNotif]);

  const schools = user?.isSuper ? schoolData?.schools || [] : user?.schools || [];
  const showSwitcher = user?.isSuper || schools.length > 1;

  async function handleSchool(e) {
    const value = e.target.value || null;
    setSwitching(true);
    try {
      await switchSchool(value);
      window.location.assign('/app');
    } finally {
      setSwitching(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function toggleLanguage() {
    const next = lang === 'bm' ? 'en' : 'bm';
    setLang(next);
    if (user) api.patch('/auth/profile', { language: next }).catch(() => {});
  }

  if (!user) return null;

  return (
    <div className="shell">
      {drawer && <button type="button" className="drawer-scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar ${drawer ? 'sidebar--open' : ''}`.trim()}>
        <GeoPattern className="sidebar__pattern" />
        <div className="sidebar__brand">
          <Link to="/app" aria-label="MDUIK">
            <Brand light />
          </Link>
          <button type="button" className="sidebar__close" onClick={() => setDrawer(false)} aria-label={t('common.close')}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label={t('nav.mainMenu')}>
          {sections.map((section) => (
            <div className="navgroup" key={section.id}>
              <span className="navgroup__label">{t(section.label)}</span>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `navlink ${isActive ? 'navlink--active' : ''}`.trim()}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{t(item.label)}</span>
                  {item.to === '/app/notifications' && unread > 0 && <span className="navlink__count">{unread}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <div className="sidebar__school">
            <Icon name="school" size={16} />
            <div>
              <strong>{user.school?.name || (user.isSuper ? t('schools.stateLevel') : '—')}</strong>
              <span>{user.school?.category ? t(`common.${user.school.category === 'tahfiz' ? 'tahfiz' : 'islamicStudies'}`) : t('common.all')}</span>
            </div>
          </div>
          <button type="button" className="sidebar__logout" onClick={handleLogout}>
            <Icon name="logout" size={17} />
            {t('common.logout')}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button type="button" className="btn btn--ghost btn--icon topbar__menu" onClick={() => setDrawer(true)} aria-label={t('nav.mainMenu')}>
              <Icon name="menu" size={20} />
            </button>
            {showSwitcher ? (
              <label className="schoolswitch">
                <Icon name="school" size={16} />
                <select value={user.activeSchool || ''} onChange={handleSchool} disabled={switching} aria-label={t('common.schools')}>
                  {user.isSuper && <option value="">{t('common.all')} · {t('common.schools')}</option>}
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={15} />
              </label>
            ) : (
              <span className="topbar__school">{user.school?.name}</span>
            )}
          </div>

          <div className="topbar__right">
            <button type="button" className="langtoggle" onClick={toggleLanguage} title={t('common.language')}>
              <Icon name="globe" size={16} />
              <span className={lang === 'bm' ? 'is-on' : ''}>BM</span>
              <span className="langtoggle__sep">/</span>
              <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
            </button>

            <Link to="/app/notifications" className="btn btn--ghost btn--icon notifbtn" aria-label={t('common.notifications')}>
              <Icon name="bell" size={19} />
              {unread > 0 && <span className="notifbtn__dot">{unread > 9 ? '9+' : unread}</span>}
            </Link>

            <div className="usermenu" ref={menuRef}>
              <button type="button" className="usermenu__trigger" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
                <Avatar name={user.name} size={34} />
                <span className="usermenu__text">
                  <strong>{user.name}</strong>
                  <small>{t(ROLE_LABEL[user.role] || 'users.teacher')}</small>
                </span>
                <Icon name="chevronDown" size={15} />
              </button>
              {menu && (
                <div className="usermenu__panel">
                  <div className="usermenu__head">
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <RoleBadge role={user.role} />
                  </div>
                  <Link to="/app/settings">{t('common.profile')}</Link>
                  <Link to="/app/notifications">{t('common.notifications')}</Link>
                  <Link to="/">{t('nav.backToSite')}</Link>
                  <button type="button" onClick={handleLogout}>
                    {t('common.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
