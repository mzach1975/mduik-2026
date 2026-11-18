import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  PageHeader,
  StatusBadge,
  useToast,
} from '../../components/ui';

export default function Portal() {
  const { t, money, date } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data, reload } = useApi('/portal/children');
  const { data: appData, reload: reloadApps } = useApi('/portal/applications');
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(false);

  const children = data?.children || [];
  const schools = data?.schools || [];
  const applications = appData?.applications || [];

  async function respond(response) {
    setBusy(true);
    try {
      await api.post(`/applications/${offer.id}/offer-response`, { response });
      push(t('common.success'));
      setOffer(null);
      await reloadApps(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t('portal.title')}
        subtitle={t('portal.subtitle')}
      />

      <Alert tone="info" title={t('portal.noOnlinePayment')}>{t('portal.contactSchool')}</Alert>

      {children.length > 0 && (
        <section className="portaltotal" aria-label={t('portal.totalOutstanding')}>
          <div className="portaltotal__main">
            <span>{t('portal.totalOutstanding')}</span>
            <strong className={data.totalOutstanding > 0 ? 'text-rose' : ''}>{money(data.totalOutstanding)}</strong>
          </div>
          {schools.length > 1 && (
            <ul className="portaltotal__schools">
              {schools.map((sc) => (
                <li key={sc.school_id}>
                  <span>{sc.school_name}</span>
                  <strong>{money(sc.outstanding)}</strong>
                </li>
              ))}
            </ul>
          )}
          <small>{t('portal.perSchoolNote')}</small>
        </section>
      )}

      {!children.length ? (
        <Card>
          <p className="muted">{t('portal.noChildren')}</p>
        </Card>
      ) : (
        <div className="childgrid">
          {children.map((child) => (
            <article className="childcard" key={child.id}>
              <div className="childcard__school">
                <Icon name="school" size={14} /> {child.school_name}
              </div>
              <div className="childcard__head">
                <span className="avatar avatar--teal">{child.full_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                <div>
                  <strong>{child.full_name}</strong>
                </div>
                <StatusBadge status={child.status} />
              </div>
              <div className="childcard__balance">
                <div>
                  <span>{t('parents.outstanding')}</span>
                  <strong className={child.outstanding > 0 ? 'text-rose' : ''}>{money(child.outstanding)}</strong>
                </div>
                <div>
                  <span>{t('portal.credit')}</span>
                  <strong>{money(child.credit)}</strong>
                </div>
              </div>
              {child.invoices?.length > 0 ? (
                <ul className="childcard__invoices">
                  {child.invoices.map((inv) => (
                    <li key={inv.id}>
                      <span className="mono">{inv.number}</span>
                      <span>{date(inv.due_date)}</span>
                      <strong>{money(inv.outstanding_cents)}</strong>
                    </li>
                  ))}
                  {child.invoice_count > child.invoices.length && (
                    <li className="muted">{t('portal.moreInvoices', { n: child.invoice_count - child.invoices.length })}</li>
                  )}
                </ul>
              ) : (
                <p className="muted childcard__none">{t('portal.noOpenInvoices')}</p>
              )}
              <div className="childcard__foot">
                <span>
                  <Icon name="calendar" size={15} /> {t('portal.nextPayment')}:{' '}
                  {child.next_due ? `${money(child.next_due_amount)} · ${date(child.next_due)}` : '—'}
                </span>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate(`/app/portal/${child.id}`)}>
                  {t('portal.viewChild')} <Icon name="arrowRight" size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Card title={t('portal.applications')} subtitle={t('parents.applicationsTab')}>
        {!applications.length ? (
          <p className="muted">{t('parents.noApplications')}</p>
        ) : (
          <div className="applist">
            {applications.map((app) => (
              <div className="applist__row" key={app.id}>
                <div className="applist__main">
                  <strong>{app.student_name}</strong>
                  <small className="mono">{app.reference}</small>
                  <small>{app.school_name}</small>
                </div>
                <div className="applist__meta">
                  <StatusBadge status={app.status} />
                  {app.offer_status && <Badge tone={app.offer_status === 'offered' ? 'amber' : app.offer_status === 'accepted' ? 'green' : 'slate'} dot>{t(`applications.${app.offer_status}`)}</Badge>}
                  {app.offer_deadline && <small>{t('portal.deadline')}: {date(app.offer_deadline)}</small>}
                </div>
                {app.offer_status === 'offered' && (
                  <div className="buttonrow">
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setOffer({ ...app, response: 'accepted' })}>{t('portal.acceptOffer')}</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOffer({ ...app, response: 'declined' })}>{t('portal.declineOffer')}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!offer}
        onClose={() => setOffer(null)}
        busy={busy}
        danger={offer?.response === 'declined'}
        title={offer?.response === 'accepted' ? t('portal.acceptOffer') : t('portal.declineOffer')}
        message={t('portal.respond')}
        confirmLabel={offer?.response === 'accepted' ? t('portal.acceptOffer') : t('portal.declineOffer')}
        onConfirm={() => respond(offer.response)}
      />
    </>
  );
}

