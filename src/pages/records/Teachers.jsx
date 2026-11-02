import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Badge,
  Card,
  Checkbox,
  DataTable,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  useToast,
} from '../../components/ui';

export default function Teachers() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/teachers');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.isSuper || user?.role === 'school_admin';

  async function submit(path, payload, message) {
    setBusy(true);
    try {
      await api.post(path, payload);
      push(message);
      setModal(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function update(id, payload) {
    setBusy(true);
    try {
      await api.patch(`/teachers/${id}`, payload);
      push(t('common.success'));
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
        title={t('teachers.title')}
        subtitle={t('teachers.subtitle')}
        actions={
          isAdmin && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'add' })}>
              <Icon name="plus" size={16} /> {t('teachers.addTeacher')}
            </button>
          )
        }
      />

      <Card padded={false}>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={data?.teachers || []}
            loading={loading}
            columns={[
              {
                key: 'full_name',
                label: t('teachers.name'),
                render: (r) => (
                  <span className="stack-cell">
                    <strong>{r.full_name}</strong>
                    <small>{r.ic_masked || '—'}</small>
                  </span>
                ),
              },
              { key: 'email', label: t('teachers.email'), render: (r) => r.email || '—' },
              { key: 'phone', label: t('teachers.phone'), render: (r) => r.phone || '—' },
              { key: 'schools', label: t('teachers.schools'), render: (r) => r.schools || '—' },
              {
                key: 'login',
                label: t('teachers.loginAccount'),
                render: (r) =>
                  r.user_id ? (
                    <Badge tone={r.user_status === 'active' ? 'green' : 'slate'} dot>
                      {r.login_email || t('teachers.createLogin')}
                    </Badge>
                  ) : (
                    <span className="muted">{t('teachers.noLogin')}</span>
                  ),
              },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (r) => (
                  isAdmin && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setModal({ type: 'edit', teacher: r })}>
                      <Icon name="edit" size={15} /> {t('common.edit')}
                    </button>
                  )
                ),
              },
            ]}
          />
        )}
      </Card>

      {modal?.type === 'add' && (
        <TeacherModal
          onClose={() => setModal(null)}
          busy={busy}
          onSubmit={(payload) => submit('/teachers', payload, t('teachers.created'))}
        />
      )}
      {modal?.type === 'edit' && (
        <TeacherModal
          teacher={modal.teacher}
          onClose={() => setModal(null)}
          busy={busy}
          onSubmit={(payload) => update(modal.teacher.id, payload)}
        />
      )}
    </>
  );
}

function TeacherModal({ teacher, onClose, onSubmit, busy }) {
  const { t } = useI18n();
  const editing = !!teacher;
  const [form, setForm] = useState({
    fullName: teacher?.full_name || '',
    email: teacher?.email || '',
    phone: teacher?.phone || '',
    status: teacher?.status || 'active',
    createLogin: !teacher,
    password: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('common.edit') : t('teachers.addTitle')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !form.fullName}
            onClick={() =>
              onSubmit(
                editing
                  ? { full_name: form.fullName, email: form.email, phone: form.phone, status: form.status }
                  : { fullName: form.fullName, email: form.email, phone: form.phone, createLogin: form.createLogin, password: form.password || undefined },
              )
            }
          >
            {busy && <span className="spinner spinner--light" />} {t('common.save')}
          </button>
        </>
      }
    >
      <div className="formgrid">
        <Field label={t('teachers.name')} required className="formgrid__full">
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label={t('teachers.email')}>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('teachers.phone')}>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        {editing && (
          <Field label={t('common.status')}>
            <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
            </Select>
          </Field>
        )}
      </div>
      {!editing && (
        <>
          <Checkbox checked={form.createLogin} onChange={(e) => set('createLogin', e.target.checked)} label={t('teachers.createLogin')} />
          {form.createLogin && (
            <Field label={t('auth.password')} hint={`${t('teachers.passwordHint')} — ${t('auth.newPasswordHint')}`}>
              <Input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Mduik@2026" />
            </Field>
          )}
        </>
      )}
    </Modal>
  );
}
