import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { openFile } from '../../api';
import { useI18n } from '../../i18n';
import { useApi, buildQuery } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  StatCard,
} from '../../components/ui';
import { RecordPaymentModal, ReceiptResult } from './PaymentModals';

export default function Payments() {
  const { t, money, date } = useI18n();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const studentId = params.get('studentId') || '';
  const page = Number(params.get('page') || 1);
  const [recordOpen, setRecordOpen] = useState(params.get('new') === '1');
  const [result, setResult] = useState(null);
  const { data: lookups } = useApi('/lookups');
  const query = useMemo(() => buildQuery({ from, to, studentId, page, pageSize: 20 }), [from, to, studentId, page]);
  const { data, loading, error, reload } = useApi(`/payments${query}`);

  function update(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }

  const pageTotal = (data?.payments || []).reduce((s, p) => s + p.amount_cents, 0);

  return (
    <>
      <PageHeader
        title={t('finance.paymentsTitle')}
        subtitle={t('finance.paymentsSubtitle')}
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setRecordOpen(true)}>
            <Icon name="plus" size={16} /> {t('finance.recordPayment')}
          </button>
        }
      />

      <div className="statgrid statgrid--3">
        <StatCard label={t('common.total')} value={money(pageTotal)} icon="payment" tone="green" hint={t('common.page')} />
        <StatCard label={t('common.from')} value={from || '—'} icon="calendar" tone="teal" />
        <StatCard label={t('common.to')} value={to || '—'} icon="calendar" tone="sky" />
      </div>

      <Card padded={false}>
        <div className="toolbar">
          <div className="toolbar__filters">
            <Field label={t('common.fromDate')}>
              <Input type="date" value={from} onChange={(e) => update('from', e.target.value)} />
            </Field>
            <Field label={t('common.toDate')}>
              <Input type="date" value={to} onChange={(e) => update('to', e.target.value)} />
            </Field>
            <Field label={t('finance.student')}>
              <Select value={studentId} onChange={(e) => update('studentId', e.target.value)}>
                <option value="">{t('finance.allStudents')}</option>
                {(lookups?.students || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </Select>
            </Field>
            {(from || to || studentId) && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setParams({})}>{t('common.filter')} ×</button>
            )}
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <>
            <DataTable
              rows={data?.payments || []}
              loading={loading}
              columns={[
                { key: 'paid_at', label: t('common.date'), render: (r) => <span className="cell-strong">{date(r.paid_at)}</span> },
                {
                  key: 'student_name',
                  label: t('finance.student'),
                  render: (r) => (
                    <span className="stack-cell">
                      <strong>{r.student_name}</strong>
                      <small>{r.recorded_by_name || '—'}</small>
                    </span>
                  ),
                },
                { key: 'receipt_number', label: t('common.receipt'), render: (r) => <span className="mono">{r.receipt_number || '—'}</span> },
                { key: 'method', label: t('common.method'), render: (r) => <span className="badge badge--slate">{t(`common.${r.method}`)}</span> },
                { key: 'bank_ref', label: t('common.reference'), render: (r) => r.bank_ref || '—' },
                { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong">{money(r.amount_cents)}</span> },
                { key: 'receipt_status', label: t('common.status'), render: (r) => (r.receipt_status ? <StatusBadge status={r.receipt_status} /> : '—') },
                {
                  key: 'pdf',
                  label: '',
                  align: 'right',
                  render: (r) =>
                    r.receipt_id ? (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openFile(`/receipts/${r.receipt_id}/pdf`)}>
                        <Icon name="print" size={15} /> PDF
                      </button>
                    ) : null,
                },
              ]}
            />
            <Pagination page={data?.page || 1} pageCount={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 20} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Card>

      <RecordPaymentModal
        open={recordOpen}
        initialStudentId={studentId}
        onClose={() => setRecordOpen(false)}
        onSaved={(res) => {
          setRecordOpen(false);
          setResult(res);
          reload(true);
        }}
      />
      <ReceiptResult result={result} onClose={() => setResult(null)} />
    </>
  );
}
