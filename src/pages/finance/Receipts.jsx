import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, downloadFile, openFile } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi, useDebounced, buildQuery } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Alert,
  Card,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';

export default function Receipts() {
  const { t, money, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const debounced = useDebounced(search);
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);
  const [cancel, setCancel] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useApi(`/receipts${buildQuery({ q: debounced, status, page, pageSize: 20 })}`);
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

  function update(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.set('page', '1');
      return next;
    });
  }

  async function submitCancel() {
    setBusy(true);
    try {
      await api.post(`/receipts/${cancel.id}/cancel`, { reason });
      push(t('common.success'));
      setCancel(null);
      setReason('');
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
        title={t('finance.receiptsTitle')}
        subtitle={t('finance.receiptsSubtitle')}
        actions={
          <span className="export-group">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/receipts?format=csv')}>CSV</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/receipts?format=xls')}>Excel</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadFile('/exports/receipts?format=pdf')}>PDF</button>
          </span>
        }
      />
      <Card padded={false}>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={`${t('common.search')} — ${t('common.receipt')}`} />
          <div className="toolbar__filters">
            <Select value={status} onChange={(e) => update('status', e.target.value)}>
              <option value="">{t('common.all')} · {t('common.status')}</option>
              <option value="issued">{t('common.issued')}</option>
              <option value="cancelled">{t('common.cancelled')}</option>
            </Select>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => reload()} aria-label={t('common.refresh')}>
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </div>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <>
            <DataTable
              rows={data?.receipts || []}
              loading={loading}
              columns={[
                { key: 'number', label: t('finance.receiptNo'), render: (r) => <span className="mono cell-strong">{r.number}</span> },
                { key: 'issued_at', label: t('common.date'), render: (r) => date(r.issued_at) },
                { key: 'student_name', label: t('finance.student') },
                { key: 'method', label: t('common.method'), render: (r) => t(`common.${r.method}`) },
                { key: 'bank_ref', label: t('common.reference'), render: (r) => r.bank_ref || '—' },
                { key: 'amount_cents', label: t('common.amount'), align: 'right', render: (r) => <span className="cell-strong">{money(r.amount_cents)}</span> },
                { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'actions',
                  label: '',
                  align: 'right',
                  render: (r) => (
                    <span className="buttonrow">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => openFile(`/receipts/${r.id}/pdf`)}>
                        <Icon name="print" size={15} /> PDF
                      </button>
                      {isAdmin && r.status === 'issued' && (
                        <button type="button" className="btn btn--ghost btn--sm text-rose" onClick={() => setCancel(r)}>
                          {t('finance.cancelReceipt')}
                        </button>
                      )}
                    </span>
                  ),
                },
              ]}
            />
            <Pagination page={data?.page || 1} pageCount={data?.pages || 1} total={data?.total || 0} pageSize={data?.pageSize || 20} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Card>

      <Modal
        open={!!cancel}
        onClose={() => setCancel(null)}
        title={t('finance.cancelReceipt')}
        subtitle={cancel?.number}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setCancel(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--danger" disabled={busy || reason.trim().length < 3} onClick={submitCancel}>
              {busy && <span className="spinner spinner--light" />} {t('finance.cancelReceipt')}
            </button>
          </>
        }
      >
        <Alert tone="warning">{t('finance.cancelledReceipt')}</Alert>
        <Field label={t('finance.cancelReason')} required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
