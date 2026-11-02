import { useState } from 'react';
import { downloadFile } from '../../api';
import { useI18n } from '../../i18n';
import { useApi, todayIso, yearStartIso } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  PageHeader,
  StatCard,
} from '../../components/ui';

export default function Ledger() {
  const { t, money, date } = useI18n();
  const [from, setFrom] = useState(yearStartIso());
  const [to, setTo] = useState(todayIso());
  const { data, loading, error, reload } = useApi(`/ledger?from=${from}&to=${to}`);
  const rows = data?.rows || [];
  const totals = data?.totals || { debit: 0, credit: 0 };
  const balance = totals.debit - totals.credit;

  return (
    <>
      <PageHeader
        title={t('finance.ledgerTitle')}
        subtitle={t('finance.ledgerSubtitle')}
        actions={
          <span className="export-group">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/ledger?from=${from}&to=${to}&format=csv`)}>CSV</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/ledger?from=${from}&to=${to}&format=xls`)}>Excel</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile(`/ledger?from=${from}&to=${to}&format=pdf`)}>PDF</button>
          </span>
        }
      />

      <div className="statgrid statgrid--3">
        <StatCard label={t('finance.debit')} value={money(totals.debit)} tone="rose" icon="invoice" />
        <StatCard label={t('finance.creditCol')} value={money(totals.credit)} tone="green" icon="payment" />
        <StatCard label={t('finance.runningBalance')} value={money(balance)} tone={balance > 0 ? 'amber' : 'teal'} icon="book" />
      </div>

      <Card padded={false}>
        <div className="toolbar">
          <div className="toolbar__filters">
            <Field label={t('common.fromDate')}>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t('common.toDate')}>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => reload()} aria-label={t('common.refresh')}>
              <Icon name="refresh" size={17} />
            </button>
          </div>
          <span className="muted">{rows.length} {t('common.results')}</span>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            dense
            rows={rows}
            loading={loading}
            rowKey={(r, i) => `${r.ref}-${i}`}
            columns={[
              { key: 'date', label: t('common.date'), render: (r) => date(r.date) },
              { key: 'ref', label: t('common.reference'), render: (r) => <span className="mono">{r.ref}</span> },
              { key: 'kind', label: t('finance.kind'), render: (r) => r.kind },
              { key: 'type', label: t('common.type'), render: (r) => (r.kind === 'Payment' ? t(`common.${r.type}`) : r.type) },
              { key: 'student_name', label: t('finance.student') },
              { key: 'debit', label: t('finance.debit'), align: 'right', render: (r) => (r.debit ? money(r.debit) : '—') },
              { key: 'credit', label: t('finance.creditCol'), align: 'right', render: (r) => (r.credit ? <span className="text-green">{money(r.credit)}</span> : '—') },
              { key: 'balance', label: t('finance.runningBalance'), align: 'right', render: (r) => <span className="cell-strong">{money(r.balance)}</span> },
            ]}
            footer={
              <tr>
                <td colSpan={5}><strong>{t('common.total')}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{money(totals.debit)}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{money(totals.credit)}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{money(balance)}</strong></td>
              </tr>
            }
          />
        )}
      </Card>
    </>
  );
}
