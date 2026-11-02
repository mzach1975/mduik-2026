import { useState } from 'react';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi, toCents } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';

export default function Refunds() {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/refunds');
  const { data: lookups } = useApi('/lookups');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentId: '', amount: '', reason: '' });
  const [rejectReason, setRejectReason] = useState('');
  const refunds = data?.refunds || [];

  async function request() {
    setBusy(true);
    try {
      await api.post('/refunds', { studentId: form.studentId, amountCents: toCents(form.amount), reason: form.reason });
      push(t('finance.refundSuccess'));
      setModal(null);
      setForm({ studentId: '', amount: '', reason: '' });
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function decide(refund, action) {
    setBusy(true);
    try {
      await api.post(`/refunds/${refund.id}/${action}`, action === 'reject' ? { reason: rejectReason } : {});
      push(action === 'approve' ? t('finance.refundApproved') : t('common.success'));
      setModal(null);
      setRejectReason('');
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
        title={t('finance.refundsTitle')}
        subtitle={t('finance.refundsSubtitle')}
        actions={
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'request' })}>
              <Icon name="plus" size={16} /> {t('finance.requestRefund')}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/refunds?format=xls')}>
              <Icon name="download" size={15} /> Excel
            </button>
          </>
        }
      />

      <Alert tone="info">{t('finance.pendingReview')} — {t('finance.refundReason')}</Alert>

      <Card padded={false}>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={refunds}
            loading={loading}
            empty={t('finance.noRefunds')}
            columns={[
              { key: 'created_at', label: t('common.date'), render: (r) => date(r.created_at) },
              { key: 'student_name', label: t('finance.student'), render: (r) => <strong>{r.student_name}</strong> },
              { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong">{money(r.amount_cents)}</span> },
              { key: 'reason', label: t('finance.refundReason'), className: 'cell-wrap' },
              { key: 'requester_name', label: t('finance.requester'), render: (r) => r.requester_name || '—' },
              { key: 'approver_name', label: t('finance.approver'), render: (r) => r.approver_name || '—' },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (r) =>
                  r.status === 'pending' ? (
                    <span className="buttonrow">
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'approve', refund: r })}>{t('common.approve')}</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal({ type: 'reject', refund: r })}>{t('common.reject')}</button>
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={modal?.type === 'request'}
        onClose={() => setModal(null)}
        title={t('finance.requestRefund')}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setModal(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={request} disabled={busy || !form.studentId || toCents(form.amount) <= 0 || form.reason.trim().length < 3}>
              {busy && <span className="spinner spinner--light" />} {t('common.request')}
            </button>
          </>
        }
      >
        <Field label={t('finance.selectStudent')} required>
          <Select value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}>
            <option value="">{t('common.selectStudent')}</option>
            {(lookups?.students || []).map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.class_name || '—'}</option>)}
          </Select>
        </Field>
        <Field label={t('finance.amountLabel')} required hint="RM">
          <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </Field>
        <Field label={t('finance.refundReason')} required>
          <Textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </Field>
        <Alert tone="warning">{t('finance.creditBalance')}: {t('finance.pendingReview')}</Alert>
      </Modal>

      <ConfirmDialog
        open={modal?.type === 'approve'}
        onClose={() => setModal(null)}
        busy={busy}
        danger={false}
        title={t('finance.approveRefund')}
        message={`${modal?.refund?.student_name} — ${money(modal?.refund?.amount_cents || 0)}. ${t('finance.refundApproved')}`}
        confirmLabel={t('common.approve')}
        onConfirm={() => decide(modal.refund, 'approve')}
      />

      <Modal
        open={modal?.type === 'reject'}
        onClose={() => setModal(null)}
        title={t('finance.rejectRefund')}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setModal(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--danger" onClick={() => decide(modal.refund, 'reject')} disabled={busy}>
              {busy && <span className="spinner spinner--light" />} {t('common.reject')}
            </button>
          </>
        }
      >
        <Field label={t('common.reason')}>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
