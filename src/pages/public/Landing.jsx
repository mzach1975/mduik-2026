import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import { GeoPattern } from '../../components/Brand';
import LoginForm from '../../components/LoginForm';
import { useAuth } from '../../auth';
import { Badge } from '../../components/ui';

export default function Landing() {
  const { t, lang, date } = useI18n();
  const { user } = useAuth();
  const { data: announcementData } = useApi('/public/announcements');
  const announcements = announcementData?.announcements || [];

  const titleOf = (a) => (lang === 'en' ? a.title_en || a.title_bm : a.title_bm);
  const bodyOf = (a) => (lang === 'en' ? a.body_en || a.body_bm : a.body_bm);
  const linkLabelOf = (a) =>
    lang === 'en'
      ? a.link_label_en || a.link_label_bm || t('landing.readMore')
      : a.link_label_bm || a.link_label_en || t('landing.readMore');
  const categoryTone = { general: 'slate', admission: 'teal', event: 'amber', reminder: 'purple' };

  return (
    <>
      <section className="hero hero--lead">
        <div className="hero__bg" aria-hidden="true">
          <GeoPattern className="hero__pattern" />
          <span className="hero__orb hero__orb--1" />
          <span className="hero__orb hero__orb--2" />
        </div>
        <div className="hero__inner">
          <div className="hero__copy">
            <h1>
              {t('landing.heroTitle')} <em>{t('landing.heroHighlight')}</em>
            </h1>
            <p className="hero__sub">{t('landing.heroSubtitle')}</p>
            <div className="hero__actions">
              <Link to="/apply" className="btn btn--primary btn--lg">
                {t('landing.applyNow')} <Icon name="arrowRight" size={18} />
              </Link>
              <Link to="/status" className="btn btn--outline btn--lg">
                {t('landing.checkStatus')}
              </Link>
            </div>
            <div className="hero__trust">
              <span><Icon name="checkCircle" size={16} /> {t('landing.bilingual')}</span>
              <span><Icon name="lock" size={16} /> {t('landing.footerNote')}</span>
            </div>
          </div>

          <div className="hero__login" id="login">
            {user ? (
              <div className="authcard leadcard">
                <span className="authcard__icon"><Icon name="user" size={22} /></span>
                <h2>{t('landing.signedInTitle')}</h2>
                <p className="muted">{user.name || user.email}</p>
                <Link to={user.role === 'parent' ? '/app/portal' : '/app'} className="btn btn--primary btn--block btn--lg">
                  {t('landing.goToApp')} <Icon name="arrowRight" size={17} />
                </Link>
              </div>
            ) : (
              <div className="authcard leadcard">
                <span className="authcard__icon"><Icon name="lock" size={22} /></span>
                <h2>{t('auth.welcomeBack')}</h2>
                <p className="muted">{t('auth.signInSubtitle')}</p>
                <LoginForm />
              </div>
            )}
          </div>
        </div>

      </section>

      <section className="section section--announcements" aria-labelledby="announcements-heading">
        <div className="section__head">
          <span className="eyebrow eyebrow--muted">{t('landing.announcementsEyebrow')}</span>
          <h2 id="announcements-heading">{t('landing.announcementsTitle')}</h2>
          <p>{t('landing.announcementsSubtitle')}</p>
        </div>

        {announcements.length > 0 ? (
          <div className="announcementgrid">
            {announcements.slice(0, 3).map((a) => {
              const body = bodyOf(a) || '';
              const excerpt = body.length > 180 ? `${body.slice(0, 177).trimEnd()}…` : body;
              return (
                <article className={`announcement ${a.is_pinned ? 'announcement--pinned' : ''}`.trim()} key={a.id}>
                  <div className="announcement__top">
                    <Badge tone={categoryTone[a.category] || 'slate'}>
                      {t(`announcements.categories.${a.category}`)}
                    </Badge>
                    {a.is_pinned ? (
                      <span className="announcement__pin">
                        <Icon name="pin" size={13} /> {t('announcements.pinnedStat')}
                      </span>
                    ) : null}
                  </div>
                  <h3>{titleOf(a)}</h3>
                  <p>{excerpt}</p>
                  <div className="announcement__foot">
                    <span className="announcement__date">
                      <Icon name="calendar" size={15} /> {date(a.starts_at || a.created_at)}
                    </span>
                    {a.link_url && (
                      /^https?:\/\//i.test(a.link_url) ? (
                        <a className="announcement__link" href={a.link_url} target="_blank" rel="noreferrer">
                          {linkLabelOf(a)} <Icon name="arrowRight" size={15} />
                        </a>
                      ) : (
                        <Link className="announcement__link" to={a.link_url}>
                          {linkLabelOf(a)} <Icon name="arrowRight" size={15} />
                        </Link>
                      )
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="announcement announcement--empty">
            <span className="announcement__emptyicon"><Icon name="bell" size={24} /></span>
            <div>
              <h3>{t('landing.noAnnouncements')}</h3>
              <p>{t('landing.noAnnouncementsText')}</p>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="ctaband">
          <div>
            <h2>{t('landing.ctaTitle')}</h2>
            <p>{t('landing.ctaText')}</p>
          </div>
          <div className="ctaband__actions">
            <Link to="/apply" className="btn btn--primary btn--lg">
              {t('landing.applyNow')} <Icon name="arrowRight" size={18} />
            </Link>
            <Link to="/status" className="btn btn--ghost btn--lg">
              {t('landing.checkStatus')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
