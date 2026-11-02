import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi, useDebounced, buildQuery } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  StatusBadge,
  useToast,
} from '../../components/ui';

export default function Invoices() {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const debounced = useDebounced(search);
  const status = params.get('status') || '';
  const type = params.get('type') || '';
  const overdue = params.get('overdue') || '';
  const studentId = params.get('studentId') || '';
  const page = Number(params.get('page') || 1);
  const [runMonthly, setRunMonthly] = useState(params.get('run') === '1');
  const [runRegistration, setRunRegistration] = useState(false);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.isSuper || user?.role === 'school_admin';

  useEffect(() => {
    if ((params.get('q') || '') !== debounced) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (debounced) next.set('q', debounced);
        else next.delete('q');
        next.set('page', '1');
        return next;
      }, { replace: true });
    }
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(
    () => buildQuery({ q: debounced, status, type, overdue, studentId, page, pageSize: 20 }),
    [debounced, status, type, overdue, studentId, page],
  );
  const { data, loading, error, reload } = useApi(`/invoices${query}`);

  function update(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }

  async function generate(kind) {
    setBusy(true);
    try {
      const res =
        kind === 'monthly'
          ? await api.post('/run-monthly', { month })
          : await api.post('/run-registration', { year: Number(year) });
      push(`${t('finance.invoicesCreated')}: ${res.created}`);
      setRunMonthly(false);
      setRunRegistration(false);
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
        title={t('finance.invoicesTitle')}
        subtitle={t('finance.invoicesSubtitle')}
        actions={
          <>
            {isAdmin && (
              <>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRunRegistration(true)}>
                  <Icon name="invoice" size={16} /> {t('finance.runRegistration')}
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setRunMonthly(true)}>
                  <Icon name="calendar" size={16} /> {t('finance.runMonthly')}
                </button>
              </>
            )}
            <span className="export-group">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/invoices?format=csv')}>CSV</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/invoices?format=xls')}>Excel</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/invoices?format=pdf')}>PDF</button>
            </span>
          </>
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={`${t('common.search')} — ${t('finance.invoiceNo')}`} />
          <div className="toolbar__filters">
            <Select value={status} onChange={(e) => update('status', e.target.value)}>
              <option value="">{t('common.all')} · {t('common.status')}</option>
              <option value="unpaid">{t('common.unpaid')}</option>
              <option value="partial">{t('common.partial')}</option>
              <option value="paid">{t('common.paidStatus')}</option>
              <option value="waived">{t('common.waivedStatus')}</option>
            </Select>
            <Select value={type} onChange={(e) => update('type', e.target.value)}>
              <option value="">{t('common.all')} · {t('common.type')}</option>
              <option value="monthly">{t('common.monthly')}</option>
              <option value="registration">{t('common.registration')}</option>
              <option value="opening">{t('common.opening')}</option>
            </Select>
            <button type="button" className={`btn btn--sm ${overdue ? 'btn--primary' : 'btn--ghost'}`} onClick={() => update('overdue', overdue ? '' : '1')}>
              {t('finance.daysOverdue')}
            </button>
            {studentId && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => update('studentId', '')}>
                {t('common.filter')} ×
              </button>
            )}
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <>
            <DataTable
              rows={data?.invoices || []}
              loading={loading}
              onRowClick={(row) => setSelected(row.id)}
              columns={[
                { key: 'number', label: t('finance.invoiceNo'), render: (r) => <span className="mono">{r.number}</span> },
                {
                  key: 'student_name',
                  label: t('finance.student'),
                  render: (r) => (
                    <span className="stack-cell">
                      <strong>{r.student_name}</strong>
                      <small>{r.class_name || '—'}</small>
                    </span>
                  ),
                },
                { key: 'type', label: t('common.type'), render: (r) => <Badge tone={r.type === 'registration' ? 'purple' : r.type === 'opening' ? 'amber' : 'slate'}>{t(`common.${r.type === 'registration' ? 'registration' : r.type === 'opening' ? 'opening' : r.type === 'adjustment' ? 'adjustment' : 'monthly'}`)}</Badge> },
                { key: 'period', label: t('common.period') },
                { key: 'due_date', label: t('common.dueDate'), render: (r) => <span className={r.outstanding > 0 && r.due_date < new Date().toISOString().slice(0, 10) ? 'text-rose' : ''}>{date(r.due_date)}</span> },
                { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => money(r.amount_cents) },
                { key: 'outstanding', label: t('common.outstanding'), align: 'right', render: (r) => <span className={r.outstanding > 0 ? 'cell-strong text-rose' : ''}>{money(r.outstanding)}</span> },
                { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
                { key: 'go', label: '', align: 'right', render: () => <span className="rowaction"><Icon name="chevronRight" size={17} /></span> },
              ]}
            />
            <Pagination page={data?.page || 1} pageCount={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 20} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Card>

      <Modal
        open={runMonthly}
        onClose={() => setRunMonthly(false)}
        title={t('finance.runMonthly')}
        subtitle={t('finance.runBillingTitle')}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setRunMonthly(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={() => generate('monthly')} disabled={busy}>
              {busy && <span className="spinner spinner--light" />} {t('finance.generateNow')}
            </button>
          </>
        }
      >
        <Field label={t('finance.billingMonth')} required>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <p className="muted">{t('finance.dueDateKept')}</p>
        <Alert tone="warning">{t('finance.billingNote')}</Alert>
      </Modal>

      <Modal
        open={runRegistration}
        onClose={() => setRunRegistration(false)}
        title={t('finance.runRegistration')}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setRunRegistration(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={() => generate('registration')} disabled={busy}>
              {busy && <span className="spinner spinner--light" />} {t('finance.generateNow')}
            </button>
          </>
        }
      >
        <Field label={t('finance.registrationYear')} required>
          <Input type="number" min="2020" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        <p className="muted">{t('schools.createHint')}</p>
        <Alert tone="info">{t('finance.paymentTitle')}</Alert>
      </Modal>

      <InvoiceModal id={selected} onClose={() => setSelected(null)} onStudent={(sid) => { setSelected(null); navigate(`/app/students/${sid}`); }} />
    </>
  );
}

function InvoiceModal({ id, onClose, onStudent }) {
  const { t, money, date } = useI18n();
  const { data, loading } = useApi(id ? `/invoices/${id}` : null, { enabled: !!id });
  const invoice = data?.invoice;

  return (
    <Modal open={!!id} onClose={onClose} title={invoice?.number || t('finance.invoiceDetails')} size="lg" footer={<button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.close')}</button>}>
      {loading && !data ? (
        <Loading />
      ) : invoice ? (
        <>
          <KeyValue
            items={[
              { label: t('finance.student'), value: invoice.student_name },
              { label: t('common.class'), value: invoice.class_name || '—' },
              { label: t('common.type'), value: t(`common.${invoice.type === 'registration' ? 'registration' : invoice.type === 'opening' ? 'opening' : invoice.type === 'adjustment' ? 'adjustment' : 'monthly'}`) },
              { label: t('common.period'), value: invoice.period || '—' },
              { label: t('common.issueDate'), value: date(invoice.issue_date) },
              { label: t('common.dueDate'), value: date(invoice.due_date) },
              { label: t('common.amount'), value: money(invoice.amount_cents) },
              { label: t('common.outstanding'), value: <span className="text-rose cell-strong">{money(invoice.outstanding)}</span> },
              { label: t('common.status'), value: <StatusBadge status={invoice.status} /> },
            ]}
          />
          <h4 className="detaillabel">{t('finance.lines')}</h4>
          <DataTable
            dense
            rows={data.lines || []}
            rowKey={(r) => r.id}
            columns={[
              { key: 'description', label: t('common.notes') },
              { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => money(r.amount_cents) },
            ]}
          />
          <h4 className="detaillabel">{t('finance.allocations')}</h4>
          <DataTable
            dense
            rows={data.allocations || []}
            rowKey={(r) => r.id}
            empty={t('finance.noPayments')}
            columns={[
              { key: 'receipt_number', label: t('common.receipt'), render: (r) => <span className="mono">{r.receipt_number || '—'}</span> },
              { key: 'paid_at', label: t('common.date'), render: (r) => date(r.paid_at) },
              { key: 'method', label: t('common.method'), render: (r) => t(`common.${r.method}`) },
              { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => money(r.amount_cents) },
            ]}
          />
          <button type="button" className="btn btn--outline btn--sm" onClick={() => onStudent(invoice.student_id)}>
            {t('students.detail')} <Icon name="arrowRight" size={15} />
          </button>
        </>
      ) : null}
    </Modal>
  );
}
