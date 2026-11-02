import { useEffect, useMemo, useState } from 'react';
import { api, openFile } from '../../api';
import { useI18n } from '../../i18n';
import { useApi, toCents, todayIso } from '../../hooks';
import Icon from '../../components/Icon';
import { Alert, Field, Input, Modal, Select, Textarea, useToast } from '../../components/ui';

export function RecordPaymentModal({ open, onClose, onSaved, initialStudentId = '' }) {
  const { t, money } = useI18n();
  const { push } = useToast();
  const { data: lookups } = useApi('/lookups', { enabled: open });
  const [studentId, setStudentId] = useState(initialStudentId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [bankRef, setBankRef] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: invoiceData, reload: reloadInvoices } = useApi(studentId ? `/invoices?studentId=${studentId}&pageSize=100` : null, {
    enabled: open && !!studentId,
  });
  const outstanding = useMemo(
    () => (invoiceData?.invoices || []).filter((i) => i.outstanding > 0).reduce((s, i) => s + i.outstanding, 0),
    [invoiceData],
  );

  useEffect(() => {
    if (open) {
      setStudentId(initialStudentId || '');
      setAmount('');
      setMethod('cash');
      setBankRef('');
      setPaidAt(todayIso());
      setNotes('');
    }
  }, [open, initialStudentId]);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post('/payments', {
        studentId,
        amountCents: toCents(amount),
        method,
        bankRef: method === 'bank' ? bankRef : '',
        paidAt,
        notes,
      });
      push(t('finance.paymentRecorded'));
      onSaved?.(res);
      await reloadInvoices(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('finance.recordPayment')}
      subtitle={t('finance.paymentTitle')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !studentId || toCents(amount) <= 0 || (method === 'bank' && !bankRef)}
            onClick={submit}
          >
            {busy && <span className="spinner spinner--light" />} {t('finance.recordPaymentButton')}
          </button>
        </>
      }
    >
      <Field label={t('finance.selectStudent')} required>
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">{t('common.selectStudent')}</option>
          {(lookups?.students || []).map((s) => (
            <option key={s.id} value={s.id}>{s.full_name} — {s.class_name || '—'}</option>
          ))}
        </Select>
      </Field>

      {studentId && (
        <div className="paymentdue">
          <span>{t('common.outstanding')}</span>
          <strong className={outstanding > 0 ? 'text-rose' : ''}>{money(outstanding)}</strong>
          <button type="button" className="linkbtn" onClick={() => setAmount((outstanding / 100).toFixed(2))}>{t('finance.paidInFull')}</button>
        </div>
      )}

      <div className="formgrid">
        <Field label={t('finance.amountLabel')} required hint="RM">
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label={t('common.method')} required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">{t('common.cash')}</option>
            <option value="bank">{t('common.bank')}</option>
          </Select>
        </Field>
        <Field label={t('finance.paidAt')} required>
          <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
        {method === 'bank' && (
          <Field label={t('finance.bankReference')} required>
            <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
          </Field>
        )}
        <Field label={t('common.notes')} className="formgrid__full">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      {toCents(amount) > outstanding && outstanding > 0 && (
        <Alert tone="info">{t('finance.overpaymentCredit')}</Alert>
      )}
      <Alert tone="info">{t('finance.recoveryHint')}</Alert>
    </Modal>
  );
}

export function ReceiptResult({ result, onClose }) {
  const { t, money, date } = useI18n();
  if (!result) return null;
  const { receipt, allocations = [], credit } = result;

  return (
    <Modal
      open={!!result}
      onClose={onClose}
      title={t('finance.receiptIssued')}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.close')}</button>
          <button type="button" className="btn btn--primary" onClick={() => openFile(`/receipts/${receipt.id}/pdf`)}>
            <Icon name="print" size={16} /> {t('finance.printReceipt')}
          </button>
        </>
      }
    >
      <div className="receiptsuccess">
        <span className="receiptsuccess__icon"><Icon name="receipt" size={30} /></span>
        <span className="mono receiptsuccess__number">{receipt.number}</span>
        <strong className="receiptsuccess__amount">{money(receipt.amount_cents)}</strong>
        <span className="muted">{date(receipt.issued_at)}</span>
      </div>
      {allocations.length > 0 && (
        <>
          <h4 className="detaillabel">{t('finance.paymentAllocated')}</h4>
          <div className="allocationlist">
            {allocations.map((a) => (
              <div className="allocationline" key={a.number}>
                <span className="mono">{a.number}</span>
                <span>{money(a.amount_cents)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {credit > 0 && <Alert tone="info">{t('finance.creditCreated')}: {money(credit)}</Alert>}
    </Modal>
  );
}
