import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Badge,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../components/ui';

const EMPTY = {
  name: '', shortName: '', category: 'tahfiz', state: '', address: '', phone: '', email: '',
  monthlyFee: '150.00', registrationFee: '200.00', monthlyDueDay: '7',
  bankName: '', bankAccount: '', invoicePrefix: 'INV', receiptPrefix: 'RCP',
  adminName: '', adminEmail: '', adminPassword: '',
};

export default function Schools() {
  const { t, money, number } = useI18n();
  const { user, switchSchool } = useAuth();
  const { push } = useToast();
  const { data, loading, reload } = useApi('/schools');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);

  function openAdd() {
    setForm(EMPTY);
    setModal({ type: 'add' });
  }

  function openEdit(school) {
    setForm({
      name: school.name || '',
      shortName: school.short_name || '',
      category: school.category || 'tahfiz',
      state: school.state || '',
      address: school.address || '',
      phone: school.phone || '',
      email: school.email || '',
      monthlyFee: (school.monthly_fee_cents / 100).toFixed(2),
      registrationFee: (school.registration_fee_cents / 100).toFixed(2),
      monthlyDueDay: String(school.monthly_due_day || 7),
      bankName: school.bank_name || '',
      bankAccount: school.bank_account || '',
      invoicePrefix: school.invoice_prefix || 'INV',
      receiptPrefix: school.receipt_prefix || 'RCP',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
    });
    setModal({ type: 'edit', school });
  }

  async function save() {
    setBusy(true);
    try {
      if (modal.type === 'add') {
        await api.post('/schools', {
          ...form,
          monthlyFeeCents: Math.round(Number(form.monthlyFee) * 100),
          registrationFeeCents: Math.round(Number(form.registrationFee) * 100),
          monthlyDueDay: Number(form.monthlyDueDay),
        });
        push(t('schools.created'));
      } else {
        await api.patch(`/schools/${modal.school.id}`, {
          short_name: form.shortName,
          state: form.state,
          address: form.address,
          phone: form.phone,
          email: form.email,
          monthly_fee_cents: Math.round(Number(form.monthlyFee) * 100),
          registration_fee_cents: Math.round(Number(form.registrationFee) * 100),
          monthly_due_day: Number(form.monthlyDueDay),
          bank_name: form.bankName,
          bank_account: form.bankAccount,
          invoice_prefix: form.invoicePrefix,
          receipt_prefix: form.receiptPrefix,
        });
        push(t('schools.saved'));
      }
      setModal(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(school) {
    try {
      await api.patch(`/schools/${school.id}`, { status: school.status === 'active' ? 'suspended' : 'active' });
      push(t('common.success'));
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    }
  }

  async function openSchool(school) {
    await switchSchool(school.id);
    window.location.assign('/app');
  }

  const schools = data?.schools || [];

  return (
    <>
      <PageHeader
        title={t('schools.title')}
        subtitle={t('schools.subtitle')}
        actions={
          user?.isSuper && (
            <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
              <Icon name="plus" size={16} /> {t('schools.addSchool')}
            </button>
          )
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <span className="muted">{t('schools.tenantNote')}</span>
          <span className="muted">{number(schools.length)} {t('common.schools').toLowerCase()}</span>
        </div>
        <DataTable
          rows={schools}
          loading={loading}
          columns={[
            {
              key: 'name',
              label: t('common.school'),
              render: (r) => (
                <span className="stack-cell">
                  <strong>{r.name}</strong>
                  <small>{r.short_name} · {r.slug}</small>
                </span>
              ),
            },
            { key: 'category', label: t('common.category'), render: (r) => <Badge tone={r.category === 'tahfiz' ? 'teal' : 'sand'}>{t(r.category === 'tahfiz' ? 'common.tahfiz' : 'common.islamicStudies')}</Badge> },
            { key: 'state', label: t('common.state') },
            { key: 'students', label: t('common.students'), align: 'right' },
            { key: 'teachers', label: t('nav.teachers'), align: 'right' },
            { key: 'applications', label: t('nav.applications'), align: 'right' },
            { key: 'monthly_fee_cents', label: t('schools.monthlyFee'), align: 'right', render: (r) => money(r.monthly_fee_cents) },
            { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (r) => (
                <span className="buttonrow">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(r)}>{t('common.edit')}</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => openSchool(r)}>{t('schools.manage')}</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleStatus(r)}>
                    {r.status === 'active' ? t('schools.suspend') : t('schools.activate')}
                  </button>
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.type === 'add' ? t('schools.addTitle') : t('schools.settingsTitle')}
        subtitle={modal?.type === 'add' ? t('schools.createHint') : modal?.school?.name}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setModal(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy || !form.name}>
              {busy && <span className="spinner spinner--light" />} {modal?.type === 'add' ? t('schools.createSchool') : t('common.saveChanges')}
            </button>
          </>
        }
      >
        <h4 className="detaillabel">{t('schools.brandingTitle')}</h4>
        <div className="formgrid">
          <Field label={t('schools.name')} required className="formgrid__full">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={modal?.type === 'edit'} />
          </Field>
          <Field label={t('schools.shortName')}>
            <Input value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
          </Field>
          <Field label={t('common.category')} required>
            <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} disabled={modal?.type === 'edit'}>
              <option value="tahfiz">{t('common.tahfiz')}</option>
              <option value="islamic_studies">{t('common.islamicStudies')}</option>
            </Select>
          </Field>
          <Field label={t('common.state')}>
            <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
          </Field>
          <Field label={t('common.phone')}>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label={t('common.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label={t('common.address')} className="formgrid__full">
            <Textarea rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
        </div>

        <h4 className="detaillabel">{t('schools.feesTitle')}</h4>
        <div className="formgrid">
          <Field label={t('schools.monthlyFee')} hint="RM">
            <Input type="number" min="0" step="0.01" value={form.monthlyFee} onChange={(e) => setForm((f) => ({ ...f, monthlyFee: e.target.value }))} />
          </Field>
          <Field label={t('schools.registrationFee')} hint="RM">
            <Input type="number" min="0" step="0.01" value={form.registrationFee} onChange={(e) => setForm((f) => ({ ...f, registrationFee: e.target.value }))} />
          </Field>
          <Field label={t('schools.monthlyDueDay')} hint={t('schools.dueTitle')}>
            <Input type="number" min="1" max="28" value={form.monthlyDueDay} onChange={(e) => setForm((f) => ({ ...f, monthlyDueDay: e.target.value }))} />
          </Field>
          <Field label={t('schools.invoicePrefix')}>
            <Input value={form.invoicePrefix} onChange={(e) => setForm((f) => ({ ...f, invoicePrefix: e.target.value }))} />
          </Field>
          <Field label={t('schools.receiptPrefix')}>
            <Input value={form.receiptPrefix} onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value }))} />
          </Field>
        </div>

        <h4 className="detaillabel">{t('schools.paymentTitle')}</h4>
        <div className="formgrid">
          <Field label={t('schools.bankName')}>
            <Input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
          </Field>
          <Field label={t('schools.bankAccount')}>
            <Input value={form.bankAccount} onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))} />
          </Field>
        </div>

        {modal?.type === 'add' && (
          <>
            <h4 className="detaillabel">{t('schools.adminSection')}</h4>
            <div className="formgrid">
              <Field label={t('schools.adminName')} required>
                <Input value={form.adminName} onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))} />
              </Field>
              <Field label={t('schools.adminEmail')} required>
                <Input type="email" value={form.adminEmail} onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))} />
              </Field>
              <Field label={t('schools.adminPassword')} hint={t('auth.newPasswordHint')}>
                <Input value={form.adminPassword} onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))} placeholder="Mduik@2026" />
              </Field>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
