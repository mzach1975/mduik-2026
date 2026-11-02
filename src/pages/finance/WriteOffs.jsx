import { useMemo, useState } from 'react';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  Checkbox,
  DataTable,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';

export default function WriteOffs() {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/write-offs');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState([]);
  const { data: lookups } = useApi('/lookups', { enabled: open });
  const { data: invoiceData } = useApi(studentId ? `/invoices?studentId=${studentId}&pageSize=100` : null, { enabled: open && !!studentId });
  const isAdmin = user?.isSuper || user?.role === 'school_admin';

  const outstanding = useMemo(
    () => (invoiceData?.invoices || []).filter((i) => i.outstanding > 0),
    [invoiceData],
  );
  const selectedTotal = outstanding.filter((i) => selected.includes(i.id)).reduce((s, i) => s + i.outstanding, 0);
  const allTotal = outstanding.reduce((s, i) => s + i.outstanding, 0);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post('/write-offs', { studentId, reason, invoiceIds: selected });
      push(`${t('finance.writeOffSuccess')} ${money(res.amountCents)}`);
      setOpen(false);
      setStudentId('');
      setReason('');
      setSelected([]);
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
        title={t('finance.writeOffsTitle')}
        subtitle={t('finance.writeOffsSubtitle')}
        actions={
          <>
            {isAdmin && (
              <button type="button" className="btn btn--primary btn--sm" onClick={() => setOpen(true)}>
                <Icon name="writeoff" size={16} /> {t('finance.writeOff')}
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/write-offs?format=xls')}>
              <Icon name="download" size={15} /> Excel
            </button>
          </>
        }
      />

      <Alert tone="info">{t('finance.writeOffReason')} — {t('users.superAdmin')} / {t('users.schoolAdmin')}.</Alert>

      <Card padded={false}>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={data?.writeOffs || []}
            loading={loading}
            empty={t('finance.noWriteOffs')}
            columns={[
              { key: 'created_at', label: t('common.date'), render: (r) => date(r.created_at) },
              { key: 'student_name', label: t('finance.student'), render: (r) => <strong>{r.student_name}</strong> },
              { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong text-rose">{money(r.amount_cents)}</span> },
              { key: 'recovered_cents', label: t('finance.recordRecovery'), align: 'right', render: (r) => money(r.recovered_cents) },
              { key: 'invoices', label: t('common.invoice'), align: 'center', render: (r) => { try { return <Badge tone="slate">{JSON.parse(r.invoice_ids).length}</Badge>; } catch { return '—'; } } },
              { key: 'reason', label: t('common.reason'), className: 'cell-wrap' },
              { key: 'approver_name', label: t('finance.approvedBy'), render: (r) => r.approver_name || '—' },
            ]}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('finance.writeOff')}
        subtitle={t('finance.writeOffConfirm')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--danger" onClick={submit} disabled={busy || !studentId || reason.trim().length < 3 || (!selected.length && !outstanding.length)}>
              {busy && <span className="spinner spinner--light" />} {t('finance.waive')} {selected.length ? money(selectedTotal) : outstanding.length && !selected.length ? money(allTotal) : ''}
            </button>
          </>
        }
      >
        <Field label={t('finance.selectStudent')} required>
          <Select value={studentId} onChange={(e) => { setStudentId(e.target.value); setSelected([]); }}>
            <option value="">{t('common.selectStudent')}</option>
            {(lookups?.students || []).map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.class_name || '—'}</option>)}
          </Select>
        </Field>

        {studentId && (
          <>
            <h4 className="detaillabel">{t('finance.selectInvoices')}</h4>
            {!outstanding.length ? (
              <p className="muted">{t('finance.noOutstanding')}</p>
            ) : (
              <>
                <Checkbox
                  checked={selected.length === outstanding.length}
                  onChange={(e) => setSelected(e.target.checked ? outstanding.map((i) => i.id) : [])}
                  label={`${t('finance.writeOffAll')} — ${money(allTotal)}`}
                />
                <div className="invoicelist">
                  {outstanding.map((inv) => (
                    <label className="invoiceline" key={inv.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(inv.id)}
                        onChange={(e) =>
                          setSelected((prev) => (e.target.checked ? [...prev, inv.id] : prev.filter((x) => x !== inv.id)))
                        }
                      />
                      <span className="mono">{inv.number}</span>
                      <span>{inv.period || inv.type}</span>
                      <span className="muted">{date(inv.due_date)}</span>
                      <strong>{money(inv.outstanding)}</strong>
                    </label>
                  ))}
                </div>
                <p className="muted smalltext">{t('finance.selectInvoicesHint')}</p>
              </>
            )}
          </>
        )}

        <Field label={t('finance.writeOffReason')} required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Alert tone="warning">{t('finance.writeOffConfirm')}</Alert>
      </Modal>
    </>
  );
}
