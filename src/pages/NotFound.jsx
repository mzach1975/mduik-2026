import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { Brand } from '../components/ui';

export default function NotFound({ standalone = false }) {
  const { t } = useI18n();
  return (
    <div className={standalone ? 'notfound notfound--standalone' : 'notfound'}>
      {standalone && <Brand />}
      <span className="notfound__code">404</span>
      <h1>{t('errors.notFound')}</h1>
      <p>{t('common.noResults')}</p>
      <div className="buttonrow">
        <Link to={standalone ? '/' : '/app'} className="btn btn--primary">
          {standalone ? t('nav.backToSite') : t('nav.dashboard')}
        </Link>
      </div>
    </div>
  );
}
