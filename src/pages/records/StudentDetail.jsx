import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Loading,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui';

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, money, date, statusLabel } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi(`/students/${id}`);
  const [tab, setTab] = useState('invoices');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.isSuper || user?.role === 'school_admin';
  const canAdjust = isAdmin || user?.role === 'bursar';

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { student, parents = [], invoices = [], payments = [], adjustments = [], balance = {} } = data;

  async function act(fn, message) {
    setBusy(true);
    try {
      await fn();
      push(message);
      setModal(null);
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
        back={
          <button type="button" className="backlink" onClick={() => navigate('/app/students')}>
            <Icon name="arrowLeft" size={15} /> {t('students.title')}
          </button>
        }
        eyebrow={student.ic_masked || undefined}
        title={student.full_name}
        subtitle={`${t('students.registeredOn')} ${date(student.created_at)}`}
        actions={
          <>
            <StatusBadge status={student.status} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/students/${id}/statement.pdf`)}>
              <Icon name="download" size={15} /> {t('students.statement')}
            </button>
            {isAdmin && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal('edit')}>
                <Icon name="edit" size={15} /> {t('common.edit')}
              </button>
            )}
          </>
        }
      />

      <div className="statgrid statgrid--3">
        <StatCard label={t('common.outstanding')} value={money(balance.outstanding)} tone="rose" icon="clock" />
        <StatCard label={t('common.credit')} value={money(balance.credit)} tone="teal" icon="invoice" />
        <StatCard label={t('students.monthlyFee')} value={money(student.monthly_fee_cents)} tone="green" icon="payment" hint={student.has_adjusted_rate ? t('students.adjustedRate') : t('students.schoolDefaultRate')} />
      </div>

      <div className="detailgrid">
        <div className="stack">
          <Card title={t('students.personalInfo')}>
            <KeyValue
              items={[
                { label: t('students.name'), value: student.full_name },
                { label: t('common.ic'), value: student.ic_masked || '—' },
                { label: t('students.dob'), value: student.dob ? date(student.dob) : '—' },
                { label: t('students.gender'), value: student.gender ? t(student.gender === 'male' ? 'apply.male' : 'apply.female') : '—' },
                { label: t('common.address'), value: student.address || '—' },
              ]}
            />
          </Card>

          <Card
            title={t('students.feeSection')}
            actions={
              isAdmin && (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setModal('tracking')}>
                  {student.monthly_tracking ? t('students.trackingOff') : t('students.trackingOn')}
                </button>
              )
            }
          >
            <KeyValue
              items={[
                { label: t('students.monthlyFee'), value: money(student.monthly_fee_cents) },
                { label: t('students.rateSource'), value: student.has_adjusted_rate ? t('students.adjustedRate') : t('students.schoolDefaultRate') },
                { label: t('students.tracking'), value: <Badge tone={student.monthly_tracking ? 'green' : 'slate'} dot>{student.monthly_tracking ? t('students.trackingOn') : t('students.trackingOff')}</Badge> },
                { label: t('students.trackingStart'), value: student.tracking_start ? date(`${student.tracking_start}-01`) : '—' },
                { label: t('students.reminders'), value: <Badge tone={student.reminders_enabled ? 'green' : 'slate'} dot>{student.reminders_enabled ? t('students.remindersOn') : t('students.remindersOff')}</Badge> },
              ]}
            />
            <p className="muted smalltext">{t('students.trackingHint')}</p>
            <div className="buttonrow">
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setModal('registration')}>
                <Icon name="invoice" size={15} /> {t('students.generateRegistration')}
              </button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setModal('reminders')}>
                <Icon name="bell" size={15} /> {student.reminders_enabled ? t('students.remindersOff') : t('students.remindersOn')}
              </button>
              {canAdjust && (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setModal('adjustment')}>
                  <Icon name="adjust" size={15} /> {t('finance.adjustmentsTitle')}
                </button>
              )}
              <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate(`/app/payments?new=1&studentId=${student.id}`)}>
                <Icon name="payment" size={15} /> {t('finance.recordPayment')}
              </button>
            </div>
          </Card>

          <Card title={t('students.parents')} subtitle={t('students.parentsReadOnly')}>
            {!parents.length ? (
              <p className="muted">{t('common.noData')}</p>
            ) : (
              <div className="parentrows">
                {parents.map((p) => (
                  <div className="parentrow" key={p.id}>
                    <span className="avatar avatar--sky">{p.full_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                    <div className="parentrow__text">
                      <strong>{p.full_name}</strong>
                      <small>{p.ic_masked || '—'} · {p.email || '—'} · {p.phone || '—'}</small>
                    </div>
                    <Badge tone="sand">{t(`students.${p.relationship === 'mother' ? 'mother' : p.relationship === 'father' ? 'father' : 'guardian'}`)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="tabsbar">
              <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                  { id: 'invoices', label: t('students.invoicesTab'), count: invoices.length },
                  { id: 'payments', label: t('students.paymentsTab'), count: payments.length },
                  { id: 'adjustments', label: t('students.adjustmentsTab'), count: adjustments.length },
                ]}
              />
            </div>
            {tab === 'invoices' && (
              <DataTable
                dense
                rows={invoices}
                rowKey={(r) => r.id}
                empty={t('students.noInvoices')}
                columns={[
                  { key: 'number', label: t('finance.invoiceNo'), render: (r) => <span className="mono">{r.number}</span> },
                  { key: 'type', label: t('common.type'), render: (r) => t(`common.${r.type === 'registration' ? 'registration' : r.type === 'opening' ? 'opening' : r.type === 'adjustment' ? 'adjustment' : 'monthly'}`) },
                  { key: 'period', label: t('common.period') },
                  { key: 'due_date', label: t('common.dueDate'), render: (r) => date(r.due_date) },
                  { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => money(r.amount_cents) },
                  { key: 'outstanding', label: t('common.outstanding'), align: 'right', render: (r) => money(r.amount_cents - r.paid_cents - r.credited_cents - r.waived_cents) },
                  { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
                ]}
              />
            )}
            {tab === 'payments' && (
              <DataTable
                dense
                rows={payments}
                rowKey={(r) => r.id}
                empty={t('students.noPayments')}
                columns={[
                  { key: 'paid_at', label: t('common.date'), render: (r) => date(r.paid_at) },
                  { key: 'receipt_number', label: t('common.receipt'), render: (r) => <span className="mono">{r.receipt_number || '—'}</span> },
                  { key: 'method', label: t('common.method'), render: (r) => t(`common.${r.method}`) },
                  { key: 'bank_ref', label: t('common.reference'), render: (r) => r.bank_ref || '—' },
                  { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong">{money(r.amount_cents)}</span> },
                ]}
              />
            )}
            {tab === 'adjustments' && (
              <DataTable
                dense
                rows={adjustments}
                rowKey={(r) => r.id}
                empty={t('finance.noAdjustments')}
                columns={[
                  { key: 'created_at', label: t('common.date'), render: (r) => date(r.created_at) },
                  { key: 'old_rate_cents', label: t('finance.currentRate'), align: 'right', render: (r) => money(r.old_rate_cents) },
                  { key: 'new_rate_cents', label: t('finance.newRate'), align: 'right', render: (r) => <span className="cell-strong">{money(r.new_rate_cents)}</span> },
                  { key: 'reason', label: t('common.reason') },
                  { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
                ]}
              />
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title={t('students.history')}>
            <div className="historyline">
              <span><Icon name="calendar" size={15} /> {t('students.registeredOn')}</span>
              <strong>{date(student.created_at)}</strong>
            </div>
            {student.application_id && (
              <button type="button" className="cardlink" onClick={() => navigate(`/app/applications/${student.application_id}`)}>
                {t('applications.viewApplication')} <Icon name="arrowRight" size={14} />
              </button>
            )}
            <button type="button" className="cardlink" onClick={() => navigate(`/app/invoices?studentId=${student.id}`)}>
              {t('common.invoice')} <Icon name="arrowRight" size={14} />
            </button>
          </Card>

          <Card title={t('finance.financeSummary')}>
            <KeyValue
              columns={1}
              items={[
                { label: t('common.outstanding'), value: <span className="text-rose">{money(balance.outstanding)}</span> },
                { label: t('common.paid'), value: money(balance.paid) },
                { label: t('common.waived'), value: money(balance.waived) },
                { label: t('common.credit'), value: money(balance.credit) },
              ]}
            />
          </Card>
        </div>
      </div>

      <EditModal open={modal === 'edit'} onClose={() => setModal(null)} busy={busy} student={student} onSubmit={(payload) => act(() => api.patch(`/students/${id}`, payload), t('students.updated'))} />
      <AdjustmentModal open={modal === 'adjustment'} onClose={() => setModal(null)} busy={busy} student={student} onSubmit={(payload) => act(() => api.post(`/students/${id}/adjustments`, payload), t('common.success'))} />
      <ConfirmDialog
        open={modal === 'tracking'}
        onClose={() => setModal(null)}
        busy={busy}
        danger={!student.monthly_tracking}
        title={student.monthly_tracking ? t('students.toggleTracking') : t('students.toggleTracking')}
        message={student.monthly_tracking ? t('students.trackingConfirmOff') : t('students.trackingConfirmOn')}
        confirmLabel={student.monthly_tracking ? t('students.trackingOff') : t('students.trackingOn')}
        onConfirm={() => act(() => api.post(`/students/${id}/tracking`, { enabled: !student.monthly_tracking }), t('common.success'))}
      />
      <ConfirmDialog
        open={modal === 'reminders'}
        onClose={() => setModal(null)}
        busy={busy}
        danger={false}
        title={t('students.reminders')}
        message={student.reminders_enabled ? t('students.remindersOff') : t('students.remindersOn')}
        confirmLabel={t('common.confirm')}
        onConfirm={() => act(() => api.post(`/students/${id}/reminders`, { enabled: !student.reminders_enabled }), t('common.success'))}
      />
      <ConfirmDialog
        open={modal === 'registration'}
        onClose={() => setModal(null)}
        busy={busy}
        danger={false}
        title={t('students.generateRegistration')}
        message={t('students.trackingHint')}
        confirmLabel={t('finance.generateNow')}
        onConfirm={async () => {
          setBusy(true);
          try {
            const res = await api.post(`/students/${id}/registration-invoice`, {});
            push(res.created ? t('finance.invoicesCreated') : t('applications.alreadyRegistered'));
            setModal(null);
            await reload(true);
          } catch (err) {
            push(err.message, 'danger');
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function EditModal({ open, onClose, onSubmit, busy, student }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    full_name: student.full_name || '',
    ic: '',
    dob: student.dob || '',
    gender: student.gender || '',
    address: student.address || '',
    status: student.status || 'active',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('students.edit')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => onSubmit({ ...form, ic: form.ic || undefined })}
          >
            {busy && <span className="spinner spinner--light" />} {t('students.saveStudent')}
          </button>
        </>
      }
    >
      <div className="formgrid">
        <Field label={t('students.name')} className="formgrid__full">
          <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label={t('common.ic')} hint={t('students.icHint')}>
          <Input value={form.ic} onChange={(e) => set('ic', e.target.value)} placeholder={student.ic_masked || ''} />
        </Field>
        <Field label={t('students.dob')}>
          <Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label={t('students.gender')}>
          <Select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">{t('common.select')}</option>
            <option value="male">{t('apply.male')}</option>
            <option value="female">{t('apply.female')}</option>
          </Select>
        </Field>
        <Field label={t('common.address')} className="formgrid__full">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">{t('common.active')}</option>
            <option value="withdrawn">{t('students.withdrawn')}</option>
            <option value="graduated">{t('students.graduated')}</option>
            <option value="applicant">{t('students.applicantStatus')}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function AdjustmentModal({ open, onClose, onSubmit, busy, student }) {
  const { t, money } = useI18n();
  const [rate, setRate] = useState((student.monthly_fee_cents / 100).toFixed(2));
  const [reason, setReason] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('finance.adjustmentsTitle')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !reason.trim() || rate === ''}
            onClick={() => onSubmit({ newRateCents: Math.round(Number(rate) * 100), reason })}
          >
            {busy && <span className="spinner spinner--light" />} {t('common.request')}
          </button>
        </>
      }
    >
      <div className="ratecompare">
        <div><span>{t('finance.currentRate')}</span><strong>{money(student.monthly_fee_cents)}</strong></div>
        <Icon name="arrowRight" size={20} />
        <div><span>{t('finance.newRate')}</span><strong>{rate ? money(Math.round(Number(rate) * 100)) : '—'}</strong></div>
      </div>
      <Field label={t('finance.newRate')} required hint="RM">
        <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <Field label={t('common.reason')} required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Alert tone="info">{t('finance.pendingReview')}</Alert>
    </Modal>
  );
}
