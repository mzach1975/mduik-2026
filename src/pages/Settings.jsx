import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '../components/ui';

export default function Settings() {
  const { t, lang, setLang, money } = useI18n();
  const { user, patchUser } = useAuth();
  const { push } = useToast();
  const canSchool = user?.isSuper || user?.role === 'school_admin';
  const hasSchool = Boolean(user?.activeSchool);
  const [params] = useSearchParams();
  const schoolTabs = canSchool && hasSchool;
  const [tab, setTab] = useState(schoolTabs ? (params.get('tab') === 'classes' ? 'classes' : 'school') : 'account');

  const tabs = [
    ...(schoolTabs ? [{ id: 'school', label: t('settings.schoolTab') }, { id: 'classes', label: t('classes.tab') }] : []),
    { id: 'account', label: t('settings.accountTab') },
  ];

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="tabsbar tabsbar--page">
        <Tabs active={tab} onChange={setTab} tabs={tabs} />
      </div>

      {tab === 'school' && <SchoolSettings />}
      {tab === 'classes' && <ClassSettings />}
      {tab === 'account' && <AccountSettings lang={lang} setLang={setLang} patchUser={patchUser} push={push} />}
    </>
  );
}

/** CR-PR 2026-11-18: the school's classes (School Admin). A class with students can only be deactivated. */
function ClassSettings() {
  const { t, number } = useI18n();
  const { push } = useToast();
  const { data, loading, reload } = useApi('/classes');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const classes = data?.classes || [];

  function open(cls) {
    setEditing(cls || 'new');
    setForm({ name: cls?.name || '', description: cls?.description || '' });
  }

  async function run(fn, message) {
    setBusy(true);
    try {
      await fn();
      push(message);
      setEditing(null);
      setDeleting(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(
      () => (editing === 'new' ? api.post('/classes', form) : api.patch(`/classes/${editing.id}`, form)),
      editing === 'new' ? t('classes.created') : t('classes.updated'),
    );

  return (
    <Card
      padded={false}
      title={t('classes.title')}
      subtitle={t('classes.subtitle')}
      actions={
        <button type="button" className="btn btn--primary btn--sm" onClick={() => open(null)}>
          <Icon name="plus" size={16} /> {t('classes.add')}
        </button>
      }
    >
      {!loading && !classes.length ? (
        <EmptyState icon="file" title={t('classes.empty')}>{t('classes.emptyHint')}</EmptyState>
      ) : (
        <DataTable
          rows={classes}
          loading={loading}
          columns={[
            { key: 'name', label: t('classes.name'), render: (r) => <strong>{r.name}</strong> },
            { key: 'description', label: t('classes.description'), render: (r) => r.description || '—' },
            { key: 'student_count', label: t('classes.students'), align: 'right', render: (r) => number(r.student_count) },
            {
              key: 'status',
              label: t('common.status'),
              render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'slate'} dot>{r.status === 'active' ? t('common.active') : t('common.inactive')}</Badge>,
            },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (r) => (
                <span className="buttonrow">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => open(r)}>{t('common.edit')}</button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => run(() => api.patch(`/classes/${r.id}`, { status: r.status === 'active' ? 'inactive' : 'active' }), t('classes.updated'))}
                  >
                    {r.status === 'active' ? t('classes.deactivate') : t('classes.activate')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger-text"
                    disabled={r.student_count > 0}
                    title={r.student_count > 0 ? t('classes.inUse') : undefined}
                    onClick={() => setDeleting(r)}
                  >
                    {t('common.delete')}
                  </button>
                </span>
              ),
            },
          ]}
        />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('classes.add') : t('classes.edit')}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy || !form.name.trim()}>
              {busy && <span className="spinner spinner--light" />} {t('common.save')}
            </button>
          </>
        }
      >
        <div className="formgrid">
          <Field label={t('classes.name')} required className="formgrid__full">
            <Input value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t('classes.description')} className="formgrid__full">
            <Textarea rows={2} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        busy={busy}
        title={t('classes.deleteTitle')}
        message={t('classes.deleteConfirm', { name: deleting?.name || '' })}
        confirmLabel={t('common.delete')}
        onConfirm={() => run(() => api.del(`/classes/${deleting.id}`), t('classes.deleted'))}
      />
    </Card>
  );
}

function SchoolSettings() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const { data, loading, reload } = useApi('/school-settings');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data?.school) return;
    const s = data.school;
    setForm({
      name: s.name || '',
      short_name: s.short_name || '',
      category: s.category || 'tahfiz',
      state: s.state || '',
      address: s.address || '',
      phone: s.phone || '',
      email: s.email || '',
      monthly_fee: (s.monthly_fee_cents / 100).toFixed(2),
      registration_fee: (s.registration_fee_cents / 100).toFixed(2),
      monthly_due_day: String(s.monthly_due_day || 7),
      reg_due_day: String(s.reg_due_day || 14),
      bank_name: s.bank_name || '',
      bank_account: s.bank_account || '',
      payment_instructions_bm: s.payment_instructions_bm || '',
      payment_instructions_en: s.payment_instructions_en || '',
      invoice_prefix: s.invoice_prefix || 'INV',
      receipt_prefix: s.receipt_prefix || 'RCP',
      status: s.status || 'active',
    });
  }, [data]);

  const locked = !user?.isSuper;
  if (!form) return <Loading />;
  if (!data?.school) {
    return (
      <Card>
        <Alert tone="info" title={t('settings.schoolContext')}>
          <Link to="/app/schools" className="cardlink">{t('settings.switchSchool')} <Icon name="arrowRight" size={14} /></Link>
        </Alert>
      </Card>
    );
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/schools/${user.activeSchool}`, {
        // Name, short name, category and state are read-only for School Admin (CR-PR 2026-11-14 CR-3).
        ...(user.isSuper ? { name: form.name, short_name: form.short_name, category: form.category, state: form.state, status: form.status } : {}),
        address: form.address,
        phone: form.phone,
        email: form.email,
        monthly_fee_cents: Math.round(Number(form.monthly_fee) * 100),
        registration_fee_cents: Math.round(Number(form.registration_fee) * 100),
        monthly_due_day: Number(form.monthly_due_day),
        reg_due_day: Number(form.reg_due_day),
        bank_name: form.bank_name,
        bank_account: form.bank_account,
        payment_instructions_bm: form.payment_instructions_bm,
        payment_instructions_en: form.payment_instructions_en,
        invoice_prefix: form.invoice_prefix,
        receipt_prefix: form.receipt_prefix,
      });
      push(t('settings.schoolSaved'));
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={data.school.name}
      subtitle={`${data.school.slug} · ${t('settings.schoolTab')}`}
      actions={<button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy && <span className="spinner spinner--light" />} {t('common.saveChanges')}</button>}
    >
      <h4 className="detaillabel">{t('schools.brandingTitle')}</h4>
      <div className="formgrid">
        <Field label={t('schools.name')} required hint={locked ? t('settings.readOnlyHint') : undefined}><Input value={form.name} readOnly={locked} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label={t('schools.shortName')}><Input value={form.short_name} readOnly={locked} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))} /></Field>
        <Field label={t('common.category')}>
          <Select value={form.category} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="tahfiz">{t('common.tahfiz')}</option>
            <option value="islamic_studies">{t('common.islamicStudies')}</option>
          </Select>
        </Field>
        <Field label={t('common.state')}><Input value={form.state} readOnly={locked} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></Field>
        <Field label={t('common.phone')}><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label={t('common.email')}><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label={t('common.address')} className="formgrid__full"><Textarea rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
      </div>

      <h4 className="detaillabel">{t('settings.feesTab')}</h4>
      <p className="muted smalltext">{t('schools.feeHint')}</p>
      <div className="formgrid">
        <Field label={t('schools.monthlyFee')} hint="RM" required><Input type="number" min="0" step="0.01" value={form.monthly_fee} onChange={(e) => setForm((f) => ({ ...f, monthly_fee: e.target.value }))} /></Field>
        <Field label={t('schools.registrationFee')} hint="RM" required><Input type="number" min="0" step="0.01" value={form.registration_fee} onChange={(e) => setForm((f) => ({ ...f, registration_fee: e.target.value }))} /></Field>
        <Field label={t('schools.monthlyDueDay')} hint={t('settings.dueTitle')}><Input type="number" min="1" max="28" value={form.monthly_due_day} onChange={(e) => setForm((f) => ({ ...f, monthly_due_day: e.target.value }))} /></Field>
        <Field label={t('schools.regDueDate')}><Input type="number" min="1" max="28" value={form.reg_due_day} onChange={(e) => setForm((f) => ({ ...f, reg_due_day: e.target.value }))} /></Field>
        <Field label={t('schools.invoicePrefix')}><Input value={form.invoice_prefix} onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))} /></Field>
        <Field label={t('schools.receiptPrefix')}><Input value={form.receipt_prefix} onChange={(e) => setForm((f) => ({ ...f, receipt_prefix: e.target.value }))} /></Field>
      </div>

      <h4 className="detaillabel">{t('schools.paymentTitle')}</h4>
      <div className="formgrid">
        <Field label={t('schools.bankName')}><Input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} /></Field>
        <Field label={t('schools.bankAccount')}><Input value={form.bank_account} onChange={(e) => setForm((f) => ({ ...f, bank_account: e.target.value }))} /></Field>
        <Field label={t('schools.instructionsBm')} className="formgrid__full"><Textarea rows={3} value={form.payment_instructions_bm} onChange={(e) => setForm((f) => ({ ...f, payment_instructions_bm: e.target.value }))} /></Field>
        <Field label={t('schools.instructionsEn')} className="formgrid__full"><Textarea rows={3} value={form.payment_instructions_en} onChange={(e) => setForm((f) => ({ ...f, payment_instructions_en: e.target.value }))} /></Field>
      </div>

      <Alert tone="info">{t('settings.billingNote')}</Alert>
    </Card>
  );
}

function AccountSettings({ lang, setLang, patchUser, push }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { push: toast } = useToast();
  const canEmail = user?.isSuper || user?.schools?.some((s) => s.role === 'school_admin');
  const [profile, setProfile] = useState({ fullName: user?.name || '', phone: '', language: user?.language || lang, email: user?.email || '', currentPassword: '' });
  const emailChanged = canEmail && profile.email.trim().toLowerCase() !== String(user?.email || '').toLowerCase();
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  async function saveProfile() {
    setBusy(true);
    try {
      const res = await api.patch('/auth/profile', {
        fullName: profile.fullName,
        phone: profile.phone,
        language: profile.language,
        ...(emailChanged ? { email: profile.email.trim(), currentPassword: profile.currentPassword } : {}),
      });
      patchUser({ name: res.user.name, language: res.user.language, email: res.user.email });
      setProfile((p) => ({ ...p, email: res.user.email, currentPassword: '' }));
      setLang(profile.language);
      toast(t('settings.profileUpdated'));
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast(t('auth.passwordMismatch'), 'danger');
      return;
    }
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      toast(t('settings.passwordChanged'));
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="detailgrid">
      <Card title={t('settings.profileTitle')} subtitle={t('settings.accountInfo')}>
        <div className="profilehead">
          <span className="avatar avatar--teal">{user?.name?.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
          <div>
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </div>
          <Badge tone="purple">{t(`users.${user?.role === 'school_admin' ? 'schoolAdmin' : user?.role === 'super_admin' ? 'superAdmin' : user?.role || 'teacher'}`)}</Badge>
        </div>
        <div className="formgrid">
          <Field label={t('common.name')}><Input value={profile.fullName} onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} /></Field>
          <Field label={t('common.email')} hint={canEmail ? t('settings.emailHint') : undefined}><Input type="email" value={canEmail ? profile.email : user?.email || ''} disabled={!canEmail} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></Field>
          {emailChanged && (
            <Field label={t('auth.currentPassword')} required><Input type="password" value={profile.currentPassword} onChange={(e) => setProfile((p) => ({ ...p, currentPassword: e.target.value }))} /></Field>
          )}
          <Field label={t('common.phone')}><Input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+60" /></Field>
          <Field label={t('settings.preferredLanguage')}>
            <Select value={profile.language} onChange={(e) => setProfile((p) => ({ ...p, language: e.target.value }))}>
              <option value="bm">{t('settings.malay')}</option>
              <option value="en">{t('settings.english')}</option>
            </Select>
          </Field>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={saveProfile} disabled={busy || (emailChanged && !profile.currentPassword)}>
          {busy && <span className="spinner spinner--light" />} {t('settings.saveProfile')}
        </button>
      </Card>

      <Card title={t('settings.changePassword')} subtitle={t('auth.newPasswordHint')}>
        <Field label={t('auth.currentPassword')} required>
          <Input type="password" value={passwords.currentPassword} onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))} />
        </Field>
        <Field label={t('auth.newPassword')} required>
          <Input type="password" value={passwords.newPassword} onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))} />
        </Field>
        <Field label={t('auth.confirmPassword')} required>
          <Input type="password" value={passwords.confirmPassword} onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))} />
        </Field>
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={changePassword}
          disabled={pwBusy || !passwords.currentPassword || passwords.newPassword.length < 8}
        >
          {pwBusy && <span className="spinner" />} {t('auth.changePassword')}
        </button>
      </Card>
    </div>
  );
}
