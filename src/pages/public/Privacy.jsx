import { useI18n } from '../../i18n';
import Icon from '../../components/Icon';

export default function Privacy() {
  const { t } = useI18n();
  return (
    <section className="legalpage">
      <div className="legalpage__inner">
        <span className="eyebrow eyebrow--muted">PDPA 2010</span>
        <h1>{t('privacy.title')}</h1>
        <p className="legalpage__lead">{t('privacy.body')}</p>

        <div className="legalgrid">
          <article>
            <span className="legalgrid__icon"><Icon name="student" size={20} /></span>
            <h3>{t('common.students')}</h3>
            <p>{t('privacy.studentsText')}</p>
          </article>
          <article>
            <span className="legalgrid__icon"><Icon name="parent" size={20} /></span>
            <h3>{t('common.parents')}</h3>
            <p>{t('privacy.parentsText')}</p>
          </article>
          <article>
            <span className="legalgrid__icon"><Icon name="invoice" size={20} /></span>
            <h3>{t('common.finance')}</h3>
            <p>{t('privacy.financeText')}</p>
          </article>
        </div>

        <div className="legalpage__rights">
          <h2>{t('privacy.rightsTitle')}</h2>
          <ul>
            <li><Icon name="check" size={16} /> {t('privacy.rightAccess')}</li>
            <li><Icon name="check" size={16} /> {t('privacy.rightCorrection')}</li>
            <li><Icon name="check" size={16} /> {t('privacy.rightRetention')}</li>
          </ul>
        </div>

        <p className="legalpage__contact">
          <Icon name="mail" size={16} /> {t('privacy.contact')} <a href="mailto:admin@mduik.my">admin@mduik.my</a>
        </p>
      </div>
    </section>
  );
}
