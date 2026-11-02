import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  ErrorState,
  PageHeader,
  StatusBadge,
  Tabs,
  useToast,
} from '../components/ui';

export default function Notifications() {
  const { t, dateTime } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState('inbox');
  const { data, loading, error, reload } = useApi('/notifications');
  const isAdmin = user?.role === 'school_admin';
  const { data: outbox, loading: outboxLoading, error: outboxError, reload: reloadOutbox } = useApi(
    isAdmin ? '/notifications/outbox' : null,
    { enabled: isAdmin },
  );
  const items = data?.notifications || [];
  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(item) {
    if (item.read_at) return;
    try {
      await api.post(`/notifications/${item.id}/read`, {});
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    }
  }

  async function markAll() {
    try {
      await api.post('/notifications/read-all', {});
      push(t('common.success'));
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    }
  }

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={
          <button type="button" className="btn btn--ghost btn--sm" onClick={markAll} disabled={!unread}>
            <Icon name="check" size={15} /> {t('notifications.markAllRead')}
          </button>
        }
      />

      <Card padded={false}>
        <div className="tabsbar">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'inbox', label: t('notifications.title'), count: unread },
              ...(isAdmin ? [{ id: 'outbox', label: t('notifications.outbox'), count: outbox?.notifications?.length || 0 }] : []),
            ]}
          />
        </div>

        {tab === 'inbox' && (
          <>
            {error ? (
              <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
            ) : loading ? (
              <div className="pad"><span className="spinner" /></div>
            ) : !items.length ? (
              <div className="empty"><Icon name="bell" size={26} /><p>{t('notifications.empty')}</p></div>
            ) : (
              <div className="notificationlist">
                {items.map((n) => (
                  <article className={`notification ${n.read_at ? '' : 'notification--unread'}`.trim()} key={n.id}>
                    <span className={`notification__icon notification__icon--${n.type?.includes('payment') ? 'green' : n.type?.includes('invoice') ? 'amber' : 'teal'}`}>
                      <Icon name={n.type?.includes('payment') ? 'payment' : n.type?.includes('invoice') ? 'invoice' : n.type?.includes('application') ? 'file' : 'bell'} size={18} />
                    </span>
                    <div className="notification__body">
                      <div className="notification__head">
                        <strong>{n.subject}</strong>
                        <span className="muted">{dateTime(n.created_at)}</span>
                      </div>
                      <p>{n.body}</p>
                      <div className="notification__meta">
                        <Badge tone={n.email_status === 'sent' ? 'green' : n.email_status === 'failed' ? 'red' : n.email_status === 'queued' ? 'amber' : 'slate'} dot>
                          {t(`notifications.${n.email_status === 'portal_only' ? 'portalOnly' : n.email_status}`)}
                        </Badge>
                        {!n.read_at && (
                          <button type="button" className="linkbtn" onClick={() => markRead(n)}>
                            {t('notifications.markRead')}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'outbox' && isAdmin && (
          <>
            <div className="toolbar">
              <Alert tone="info">{t('dashboard.pendingActions')}</Alert>
              <button type="button" className="btn btn--ghost btn--icon" onClick={() => reloadOutbox()} aria-label={t('common.refresh')}>
                <Icon name="refresh" size={17} />
              </button>
            </div>
            {outboxError ? (
              <div className="pad"><ErrorState error={outboxError} onRetry={reloadOutbox} /></div>
            ) : (
              <DataTable
                rows={outbox?.notifications || []}
                loading={outboxLoading}
                empty={t('notifications.empty')}
                columns={[
                  { key: 'created_at', label: t('common.date'), render: (r) => dateTime(r.created_at) },
                  {
                    key: 'recipient_name',
                    label: t('common.name'),
                    render: (r) => (
                      <span className="stack-cell">
                        <strong>{r.recipient_name || '—'}</strong>
                        <small>{r.recipient_email || '—'}</small>
                      </span>
                    ),
                  },
                  { key: 'subject', label: t('common.notes'), className: 'cell-wrap' },
                  { key: 'type', label: t('common.type'), render: (r) => <Badge tone="slate">{r.type}</Badge> },
                  { key: 'email_status', label: t('notifications.emailStatus'), render: (r) => <StatusBadge status={r.email_status} /> },
                  { key: 'read_at', label: t('common.status'), render: (r) => <Badge tone={r.read_at ? 'green' : 'amber'} dot>{r.read_at ? t('common.read') : t('common.unread')}</Badge> },
                ]}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}
