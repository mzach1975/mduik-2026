import { Link, useNavigate, useParams } from 'react-router-dom';
import { openFile } from '../../api';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Card,
  DataTable,
  ErrorState,
  KeyValue,
  Loading,
  PageHeader,
  StatCard,
  StatusBadge,
} from '../../components/ui';

export default function ChildDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang, money, date } = useI18n();
  const { data, loading, error, reload } = useApi(`/portal/children/${id}`);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  const { student, invoices = [], payments = [], balance = {} } = data;
  const instructions = lang === 'en' ? student.payment_instructions_en : student.payment_instructions_bm;

  return (
    <>
      <PageHeader
        back={
          <button type="button" className="backlink" onClick={() => navigate('/app/portal')}>
            <Icon name="arrowLeft" size={15} /> {t('portal.title')}
          </button>
        }
        eyebrow={student.school_name}
        title={student.full_name}
        subtitle={`${t('students.registeredOn')} ${date(student.created_at)}`}
        actions={<StatusBadge status={student.status} />}
      />

      <div className="statgrid statgrid--3">
        <StatCard label={t('parents.outstanding')} value={money(balance.outstanding)} icon="clock" tone="rose" />
        <StatCard label={t('portal.credit')} value={money(balance.credit)} icon="invoice" tone="teal" />
        <StatCard label={t('common.amount')} value={money(balance.paid)} icon="payment" tone="green" hint={t('portal.paid')} />
      </div>

      <div className="detailgrid">
        <div className="stack">
          <Card title={t('portal.invoices')} padded={false}>
            <DataTable
              dense
              rows={invoices}
              rowKey={(r) => r.id}
              empty={t('portal.noInvoices')}
              columns={[
                { key: 'number', label: t('finance.invoiceNo'), render: (r) => <span className="mono">{r.number}</span> },
                { key: 'period', label: t('common.period') },
                { key: 'due_date', label: t('common.dueDate'), render: (r) => date(r.due_date) },
                { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => money(r.amount_cents) },
                { key: 'outstanding', label: t('common.outstanding'), align: 'right', render: (r) => money(r.amount_cents - r.paid_cents - r.credited_cents - r.waived_cents) },
                { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          </Card>

          <Card title={t('portal.receipts')} padded={false}>
            <DataTable
              dense
              rows={payments}
              rowKey={(r) => r.id}
              empty={t('portal.noReceipts')}
              columns={[
                { key: 'paid_at', label: t('common.date'), render: (r) => date(r.paid_at) },
                { key: 'receipt_number', label: t('common.receipt'), render: (r) => <span className="mono">{r.receipt_number || '—'}</span> },
                { key: 'method', label: t('common.method'), render: (r) => t(`common.${r.method}`) },
                { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong">{money(r.amount_cents)}</span> },
                {
                  key: 'pdf',
                  label: '',
                  align: 'right',
                  render: (r) =>
                    r.receipt_id ? (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openFile(`/portal/receipts/${r.receipt_id}/pdf`)}>
                        <Icon name="download" size={15} /> PDF
                      </button>
                    ) : null,
                },
              ]}
            />
          </Card>
        </div>

        <div className="stack">
          <Card title={t('portal.paymentInstructions')}>
            <Alert tone="warning">{t('portal.noOnlinePayment')}</Alert>
            <KeyValue
              columns={1}
              items={[
                { label: t('parents.bank'), value: student.bank_name || '—' },
                { label: t('parents.accountNo'), value: <span className="mono">{student.bank_account || '—'}</span> },
                { label: t('portal.amount'), value: money(balance.outstanding) },
              ]}
            />
            <p className="instructions">{instructions || t('portal.cashAtOffice')}</p>
            <p className="muted smalltext">{t('parents.instructionsNote')}</p>
          </Card>

          <Card title={t('portal.contactTitle')}>
            <p className="muted">{t('portal.contactSchool')}</p>
            <Link to="/app/portal" className="cardlink">
              {t('portal.updateContact')} <Icon name="arrowRight" size={14} />
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
