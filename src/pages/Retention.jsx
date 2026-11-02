import { useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  ErrorState,
  Modal,
  PageHeader,
  StatusBadge,
  useToast,
} from '../components/ui';

export default function Retention() {
  const { t, date } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/retention');
  const { data: configData } = useApi('/retention/config');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null);
  const [mode, setMode] = useState('anonymise');

  async function scan() {
    setBusy(true);
    try {
      const res = await api.post('/retention/scan', {});
      push(`${t('retention.flagged')}: ${res.flagged}`);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function resolve(rec, kind) {
    setBusy(true);
    try {
      if (kind === 'dismiss') await api.post(`/retention/${rec.id}/dismiss`, {});
      else await api.post(`/retention/${rec.id}/approve`, { action: mode });
      push(t('common.success'));
      setAction(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t('retention.title')}
        subtitle={t('retention.subtitle')}
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={scan} disabled={busy}>
            {busy && <span className="spinner spinner--light" />} {t('retention.scanNow')}
          </button>
        }
      />

      <Alert tone="warning" title={t('retention.config')}>{t('retention.retentionNotice')}</Alert>

      <div className="configgrid">
        {(configData?.config || []).map((c) => (
          <div className="configcard" key={c.id}>
            <span>{c.data_type}</span>
            <strong>{c.months === null ? t('retention.indefinite') : `${c.months} ${t('retention.monthsValue')}`}</strong>
            <small>{c.description_bm || c.description_en || ''}</small>
          </div>
        ))}
      </div>

      <Card title={t('retention.flagged')} padded={false}>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={data?.records || []}
            loading={loading}
            empty={t('retention.noRecords')}
            columns={[
              { key: 'flagged_at', label: t('retention.flaggedAt'), render: (r) => date(r.flagged_at) },
              { key: 'entity', label: t('retention.dataType'), render: (r) => <Badge tone="slate">{r.entity}</Badge> },
              { key: 'label', label: t('audit.record'), render: (r) => <span className="cell-strong">{r.label || r.entity_id}</span> },
              { key: 'note', label: t('common.notes'), render: (r) => r.note || '—' },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              { key: 'action', label: t('retention.actionLabel'), render: (r) => (r.action ? t(`retention.${r.action}`) : '—') },
              { key: 'resolved_at', label: t('common.date'), render: (r) => (r.resolved_at ? date(r.resolved_at) : '—') },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (r) =>
                  r.status === 'pending' ? (
                    <span className="buttonrow">
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => setAction(r)}>{t('retention.approveAction')}</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => resolve(r, 'dismiss')}>{t('retention.dismiss')}</button>
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        title={t('retention.approveAction')}
        subtitle={action?.label || action?.entity_id}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setAction(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => resolve(action, 'approve')}>
              {busy && <span className="spinner spinner--light" />} {t('retention.approveAction')}
            </button>
          </>
        }
      >
        <p>{t('retention.retentionNotice')}</p>
        <div className="radiochoice">
          <label className={mode === 'anonymise' ? 'is-selected' : ''}>
            <input type="radio" checked={mode === 'anonymise'} onChange={() => setMode('anonymise')} />
            <span><strong>{t('retention.anonymise')}</strong></span>
          </label>
          <label className={mode === 'delete' ? 'is-selected' : ''}>
            <input type="radio" checked={mode === 'delete'} onChange={() => setMode('delete')} />
            <span><strong>{t('retention.delete')}</strong></span>
          </label>
        </div>
        <Alert tone="warning">{t('retention.retentionNotice')}</Alert>
      </Modal>
    </>
  );
}
