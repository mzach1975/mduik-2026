import { useState } from 'react';
import { api } from '../../api';
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

export default function Adjustments() {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/adjustments');
  const { data: lookups } = useApi('/lookups');
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [rate, setRate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const { data: studentData } = useApi(studentId ? `/students/${studentId}` : null, { enabled: open && !!studentId });
  const isAdmin = user?.isSuper || user?.role === 'school_admin';
  const canCreate = isAdmin || user?.role === 'bursar';
  const student = studentData?.student;

  async function submit() {
    setBusy(true);
    try {
      await api.post(`/students/${studentId}/adjustments`, { newRateCents: toCents(rate), reason });
      push(t('common.success'));
      setOpen(false);
      setStudentId('');
      setRate('');
      setReason('');
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function decide(action) {
    setBusy(true);
    try {
      await api.post(`/adjustments/${decision.id}/${action}`, {});
      push(t('common.success'));
      setDecision(null);
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
        title={t('finance.adjustmentsTitle')}
        subtitle={t('finance.adjustmentsSubtitle')}
        actions={
          canCreate && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
              <Icon name="adjust" size={16} /> {t('finance.adjustmentsTitle')}
            </button>
          )
        }
      />

      <Alert tone="info">{t('finance.pendingReview')} — {t('finance.currentRate')} → {t('finance.newRate')}</Alert>

      <Card padded={false}>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={data?.adjustments || []}
            loading={loading}
            empty={t('finance.noAdjustments')}
            columns={[
              { key: 'created_at', label: t('common.date'), render: (r) => date(r.created_at) },
              { key: 'student_name', label: t('finance.student'), render: (r) => <strong>{r.student_name}</strong> },
              { key: 'old_rate_cents', label: t('finance.currentRate'), align: 'right', render: (r) => money(r.old_rate_cents) },
              { key: 'new_rate_cents', label: t('finance.newRate'), align: 'right', render: (r) => <span className="cell-strong">{money(r.new_rate_cents)}</span> },
              { key: 'reason', label: t('common.reason'), className: 'cell-wrap' },
              { key: 'requester_name', label: t('finance.requestedBy'), render: (r) => r.requester_name || '—' },
              { key: 'effective_date', label: t('finance.effectiveDate'), render: (r) => (r.effective_date ? date(r.effective_date) : '—') },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (r) =>
                  r.status === 'pending' && isAdmin ? (
                    <span className="buttonrow">
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => setDecision({ ...r, action: 'approve' })}>{t('common.approve')}</button>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDecision({ ...r, action: 'reject' })}>{t('common.reject')}</button>
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('finance.adjustmentsTitle')}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !studentId || !rate || reason.trim().length < 3}>
              {busy && <span className="spinner spinner--light" />} {t('common.request')}
            </button>
          </>
        }
      >
        <Field label={t('finance.selectStudent')} required>
          <Select value={studentId} onChange={(e) => { setStudentId(e.target.value); setRate(''); }}>
            <option value="">{t('common.selectStudent')}</option>
            {(lookups?.students || []).map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.class_name || '—'}</option>)}
          </Select>
        </Field>
        {student && (
          <div className="ratecompare">
            <div><span>{t('finance.currentRate')}</span><strong>{money(student.monthly_fee_cents)}</strong></div>
            <Icon name="arrowRight" size={20} />
            <div><span>{t('finance.newRate')}</span><strong>{rate ? money(toCents(rate)) : '—'}</strong></div>
          </div>
        )}
        <Field label={t('finance.newRate')} required hint="RM">
          <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label={t('common.reason')} required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Alert tone="info">{t('finance.pendingReview')}</Alert>
      </Modal>

      <ConfirmDialog
        open={!!decision}
        onClose={() => setDecision(null)}
        busy={busy}
        danger={decision?.action === 'reject'}
        title={decision?.action === 'approve' ? t('finance.approveAdjustment') : t('finance.rejectAdjustment')}
        message={`${decision?.student_name || ''} — ${money(decision?.old_rate_cents || 0)} → ${money(decision?.new_rate_cents || 0)}`}
        confirmLabel={decision?.action === 'approve' ? t('common.approve') : t('common.reject')}
        onConfirm={() => decide(decision.action)}
      />
    </>
  );
}
