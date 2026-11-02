import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';

export default function Portal() {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data, reload } = useApi('/portal/children');
  const { data: appData, reload: reloadApps } = useApi('/portal/applications');
  const [contactOpen, setContactOpen] = useState(false);
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(false);

  const children = data?.children || [];
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
        actions={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setContactOpen(true)}>
            <Icon name="edit" size={15} /> {t('portal.updateContact')}
          </button>
        }
      />

      <Alert tone="info" title={t('portal.noOnlinePayment')}>{t('portal.contactSchool')}</Alert>

      {!children.length ? (
        <Card>
          <p className="muted">{t('portal.noChildren')}</p>
        </Card>
      ) : (
        <div className="childgrid">
          {children.map((child) => (
            <article className="childcard" key={child.id}>
              <div className="childcard__head">
                <span className="avatar avatar--teal">{child.full_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                <div>
                  <strong>{child.full_name}</strong>
                  <small>{child.class_name || '—'} · {child.school_name}</small>
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
              <div className="childcard__foot">
                <span><Icon name="calendar" size={15} /> {t('parents.nextDue')}: {date(child.next_due)}</span>
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

      <ContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        email={user?.email || ''}
        onSaved={() => {
          push(t('portal.contactUpdated'));
          setContactOpen(false);
        }}
      />

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

function ContactModal({ open, onClose, email, onSaved }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [form, setForm] = useState({ email, phone: '', address: '' });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.patch('/portal/contact', form);
      onSaved();
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('portal.updateContact')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
            {busy && <span className="spinner spinner--light" />} {t('common.save')}
          </button>
        </>
      }
    >
      <p className="muted">{t('parents.contactHint')}</p>
      <Field label={t('common.email')}>
        <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </Field>
      <Field label={t('common.phone')}>
        <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+60" />
      </Field>
      <Field label={t('common.address')}>
        <Textarea rows={3} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
      </Field>
    </Modal>
  );
}
