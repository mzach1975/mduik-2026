import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadFile } from '../../api';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Badge,
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
  useToast,
} from '../../components/ui';
import { todayIso } from '../../hooks';

const BUCKETS = [
  { key: 'current', label: 'dashboard.current', tone: 'green' },
  { key: 'd1_30', label: 'dashboard.days1_30', tone: 'teal' },
  { key: 'd31_60', label: 'dashboard.days31_60', tone: 'amber' },
  { key: 'd61_90', label: 'dashboard.days61_90', tone: 'orange' },
  { key: 'over90', label: 'dashboard.over90', tone: 'rose' },
];

export default function Arrears() {
  const { t, money, date } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState(todayIso());
  const [tab, setTab] = useState('invoices');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi(`/arrears?asOf=${asOf}`);
  const { data: reminderData, reload: reloadReminders } = useApi('/reminders');
  const buckets = data?.buckets || {};
  const rows = data?.rows || [];
  const reminders = reminderData?.reminders || [];

  async function release(reminder) {
    setBusy(true);
    try {
      await api.post(`/reminders/${reminder.id}/release`, {});
      push(t('common.success'));
      await reloadReminders(true);
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
        title={t('finance.arrearsTitle')}
        subtitle={t('finance.arrearsSubtitle')}
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/reports/arrears-aging?from=2000-01-01&to=${asOf}&format=pdf`)}>
              <Icon name="download" size={15} /> PDF
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/reports/arrears-aging?from=2000-01-01&to=${asOf}&format=xls`)}>
              <Icon name="download" size={15} /> Excel
            </button>
          </>
        }
      />

      <div className="statgrid statgrid--5">
        {BUCKETS.map((b) => (
          <StatCard key={b.key} label={t(b.label)} value={money(buckets[b.key] || 0)} tone={b.tone} />
        ))}
      </div>

      <Card padded={false}>
        <div className="tabsbar">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'invoices', label: t('finance.arrearsTitle'), count: rows.length },
              { id: 'reminders', label: t('finance.remindersTitle'), count: reminders.length },
            ]}
          />
        </div>

        {tab === 'invoices' && (
          <>
            <div className="toolbar">
              <Field label={t('common.date')}>
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </Field>
              <div className="toolbar__filters">
                <span className="muted">{t('finance.aging')}: <strong>{money(buckets.total || 0)}</strong></span>
                <button type="button" className="btn btn--ghost btn--icon" onClick={() => reload()} aria-label={t('common.refresh')}><Icon name="refresh" size={17} /></button>
              </div>
            </div>
            {error ? (
              <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
            ) : (
              <DataTable
                rows={rows}
                loading={loading}
                onRowClick={(r) => navigate(`/app/students/${r.student_id}`)}
                columns={[
                  {
                    key: 'student_name',
                    label: t('finance.student'),
                    render: (r) => (
                      <span className="stack-cell">
                        <strong>{r.student_name}</strong>
                      </span>
                    ),
                  },
                  { key: 'number', label: t('finance.invoiceNo'), render: (r) => <span className="mono">{r.number}</span> },
                  { key: 'due_date', label: t('common.dueDate'), render: (r) => date(r.due_date) },
                  { key: 'days_overdue', label: t('finance.daysOverdue'), align: 'right', render: (r) => <span className={r.days_overdue > 60 ? 'text-rose cell-strong' : ''}>{r.days_overdue}</span> },
                  { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => money(r.amount_cents) },
                  { key: 'outstanding', label: t('common.outstanding'), align: 'right', render: (r) => <span className="cell-strong text-rose">{money(r.outstanding)}</span> },
                  { key: 'bucket', label: t('finance.bucket'), render: (r) => <Badge tone={r.bucket === 'over90' ? 'red' : r.bucket === 'current' ? 'green' : 'amber'}>{t(`dashboard.${r.bucket === 'current' ? 'current' : r.bucket === 'd1_30' ? 'days1_30' : r.bucket === 'd31_60' ? 'days31_60' : r.bucket === 'd61_90' ? 'days61_90' : 'over90'}`)}</Badge> },
                ]}
              />
            )}
          </>
        )}

        {tab === 'reminders' && (
          <DataTable
            rows={reminders}
            rowKey={(r) => r.id}
            empty={t('finance.noReminders')}
            columns={[
              { key: 'student_name', label: t('finance.student'), render: (r) => <strong>{r.student_name}</strong> },
              { key: 'invoice_number', label: t('finance.invoiceNo'), render: (r) => <span className="mono">{r.invoice_number}</span> },
              { key: 'stage', label: t('finance.stage'), align: 'center', render: (r) => `${r.stage} ${t('common.days')}` },
              { key: 'due_date', label: t('common.dueDate'), render: (r) => date(r.due_date) },
              { key: 'outstanding', label: t('common.outstanding'), align: 'right', render: (r) => money(r.outstanding) },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (r) =>
                  r.status === 'pending_review' ? (
                    <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => release(r)}>
                      {t('finance.releaseReminder')}
                    </button>
                  ) : (
                    <span className="muted">{r.status === 'sent' ? t('common.sent') : ''}</span>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
