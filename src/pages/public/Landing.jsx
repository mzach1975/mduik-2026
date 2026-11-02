import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import { Badge } from '../../components/ui';

export default function Landing() {
  const { t } = useI18n();
  const { data } = useApi('/public/schools');
  const schools = data?.schools || [];

  const features = [
    { icon: 'file', title: 'landing.featureAdmissions', text: 'landing.featureAdmissionsText' },
    { icon: 'invoice', title: 'landing.featureFinance', text: 'landing.featureFinanceText' },
    { icon: 'student', title: 'landing.featureRecords', text: 'landing.featureRecordsText' },
    { icon: 'parent', title: 'landing.featurePortal', text: 'landing.featurePortalText' },
  ];

  const steps = [
    { n: '01', title: 'landing.how1', text: 'landing.how1Text', icon: 'edit' },
    { n: '02', title: 'landing.how2', text: 'landing.how2Text', icon: 'teacher' },
    { n: '03', title: 'landing.how3', text: 'landing.how3Text', icon: 'checkCircle' },
  ];

  return (
    <>
      <section className="hero">
        <div className="hero__bg" aria-hidden="true">
          <span className="hero__orb hero__orb--1" />
          <span className="hero__orb hero__orb--2" />
          <span className="hero__grid" />
        </div>
        <div className="hero__inner">
          <div className="hero__copy">
            <span className="eyebrow">
              <span className="eyebrow__dot" /> {t('landing.badge')}
            </span>
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

          <div className="hero__visual" aria-hidden="true">
            <div className="mockcard mockcard--main">
              <div className="mockcard__head">
                <span className="mockcard__logo">M</span>
                <div>
                  <strong>MDUIK Tahfiz</strong>
                  <small>Sesi kemasukan 2026</small>
                </div>
                <Badge tone="amber" dot>Dalam temuduga</Badge>
              </div>
              <div className="mockcard__ref">
                <span>{t('apply.reference')}</span>
                <strong>APP-KL/2026/00018</strong>
              </div>
              <div className="mockcard__person">
                <span className="mockcard__avatar">AH</span>
                <div>
                  <strong>Ahmad Haziq bin Ismail</strong>
                  <small>Tahfiz · Kelas 4 · 10 tahun</small>
                </div>
              </div>
              <div className="mocksteps">
                <span className="mocksteps__item is-done"><i /> Mohon</span>
                <span className="mocksteps__item is-active"><i /> Temuduga</span>
                <span className="mocksteps__item"><i /> Keputusan</span>
                <span className="mocksteps__item"><i /> Daftar</span>
              </div>
              <div className="mockcard__score">
                <div>
                  <span>{t('applications.finalMark')}</span>
                  <strong>86<span>/100</span></strong>
                </div>
                <div className="mockcard__assessors">
                  <span className="mockcard__avatar mockcard__avatar--sm">NA</span>
                  <span className="mockcard__avatar mockcard__avatar--sm">MZ</span>
                  <small>2 {t('interviews.assessor')}</small>
                </div>
              </div>
            </div>

            <div className="mockcard mockcard--float">
              <span className="mockcard__receipticon"><Icon name="receipt" size={20} /></span>
              <div>
                <small>{t('common.receipt')}</small>
                <strong>RCP/2026/00034</strong>
              </div>
              <span className="mockcard__amount">RM 150.00</span>
            </div>
            <div className="mockcard mockcard--chip">
              <Icon name="checkCircle" size={16} />
              <span>{t('landing.how2')}</span>
            </div>
          </div>
        </div>

        <div className="hero__stats">
          <div>
            <strong>{schools.length || 2}</strong>
            <span>{t('landing.statSchools')}</span>
          </div>
          <div>
            <strong>2</strong>
            <span>{t('landing.statProgrammes')}</span>
          </div>
          <div>
            <strong>2</strong>
            <span>{t('landing.statLanguages')}</span>
          </div>
          <div>
            <strong>100%</strong>
            <span>{t('landing.statRecords')}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <span className="eyebrow eyebrow--muted">{t('landing.badge')}</span>
          <h2>{t('landing.whyTitle')}</h2>
          <p>{t('landing.whySubtitle')}</p>
        </div>
        <div className="featuregrid">
          {features.map((f) => (
            <article className="feature" key={f.title}>
              <span className="feature__icon"><Icon name={f.icon} size={22} /></span>
              <h3>{t(f.title)}</h3>
              <p>{t(f.text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--tint">
        <div className="section__head">
          <span className="eyebrow eyebrow--muted">{t('common.category')}</span>
          <h2>{t('landing.catTitle')}</h2>
          <p>{t('landing.catSubtitle')}</p>
        </div>
        <div className="catgrid">
          <article className="catcard catcard--tahfiz">
            <span className="catcard__pattern" aria-hidden="true" />
            <span className="catcard__icon"><Icon name="book" size={24} /></span>
            <h3>{t('common.tahfiz')}</h3>
            <p>{t('landing.catTahfizText')}</p>
            <ul>
              <li><Icon name="check" size={15} /> {t('landing.catPoint1')}</li>
              <li><Icon name="check" size={15} /> {t('landing.catPoint2')}</li>
              <li><Icon name="check" size={15} /> {t('landing.catPoint3')}</li>
            </ul>
            <Link to="/apply" className="btn btn--outline btn--sm">
              {t('landing.applyNow')} <Icon name="arrowRight" size={15} />
            </Link>
          </article>
          <article className="catcard catcard--islamic">
            <span className="catcard__pattern" aria-hidden="true" />
            <span className="catcard__icon"><Icon name="school" size={24} /></span>
            <h3>{t('common.islamicStudies')}</h3>
            <p>{t('landing.catIslamicText')}</p>
            <ul>
              <li><Icon name="check" size={15} /> {t('landing.catPoint1')}</li>
              <li><Icon name="check" size={15} /> {t('landing.catPoint2')}</li>
              <li><Icon name="check" size={15} /> {t('landing.catPoint3')}</li>
            </ul>
            <Link to="/apply" className="btn btn--outline btn--sm">
              {t('landing.applyNow')} <Icon name="arrowRight" size={15} />
            </Link>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <span className="eyebrow eyebrow--muted">{t('landing.howTitle')}</span>
          <h2>{t('landing.howTitle')}</h2>
        </div>
        <div className="steps">
          {steps.map((s) => (
            <article className="step" key={s.n}>
              <span className="step__num">{s.n}</span>
              <span className="step__icon"><Icon name={s.icon} size={22} /></span>
              <h3>{t(s.title)}</h3>
              <p>{t(s.text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--portal">
        <div className="portalshow">
          <div className="portalshow__copy">
            <span className="eyebrow eyebrow--light">{t('landing.parentPortal')}</span>
            <h2>{t('landing.portalTitle')}</h2>
            <p>{t('landing.portalText')}</p>
            <ul className="portalshow__list">
              <li><Icon name="checkCircle" size={18} /> {t('landing.portalPoint1')}</li>
              <li><Icon name="checkCircle" size={18} /> {t('landing.portalPoint2')}</li>
              <li><Icon name="checkCircle" size={18} /> {t('landing.portalPoint3')}</li>
            </ul>
            <Link to="/login" className="btn btn--light btn--lg">
              {t('landing.parentPortal')} <Icon name="arrowRight" size={18} />
            </Link>
          </div>
          <div className="portalshow__visual" aria-hidden="true">
            <div className="parentcard">
              <div className="parentcard__head">
                <span className="mockcard__avatar">SJ</span>
                <div>
                  <strong>Siti Jannah binti Omar</strong>
                  <small>MDUIK Pengajian Islam</small>
                </div>
              </div>
              <div className="parentcard__balance">
                <span>{t('common.outstanding')}</span>
                <strong>RM 320.00</strong>
                <small>{t('portal.nextDue')} · 07 Dis 2026</small>
              </div>
              <div className="parentcard__row">
                <span>INV/2026/00061</span>
                <span>RM 150.00</span>
                <Badge tone="amber" dot>{t('common.unpaid')}</Badge>
              </div>
              <div className="parentcard__row">
                <span>INV/2026/00047</span>
                <span>RM 170.00</span>
                <Badge tone="red" dot>{t('common.unpaid')}</Badge>
              </div>
              <div className="parentcard__foot">
                <Icon name="bank" size={16} /> {t('portal.bankDetails')}
              </div>
            </div>
          </div>
        </div>
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
