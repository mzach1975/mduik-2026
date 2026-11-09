import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import ParentPicker, { emptyParent, parentReady, takeDuplicateError } from '../../components/ParentPicker';
import {
  Alert,
  Badge,
  Card,
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
                      {r.login_email || '—'}
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
        <AddTeacherModal
          onClose={() => setModal(null)}
          onDone={async (res) => {
            push(res?.linked ? t('teachers.addedToSchool') : t('teachers.created'));
            setModal(null);
            await reload(true);
          }}
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

/** Add teacher: search by IC / Passport No. first; a login is always created (first password is the IC). */
function AddTeacherModal({ onClose, onDone }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [person, setPerson] = useState(emptyParent);
  const [busy, setBusy] = useState(false);
  const memberHere = person.match?.memberHere;

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post('/teachers', {
        teacherId: person.parentId || undefined,
        ic: person.ic,
        fullName: person.name,
        email: person.email,
        phone: person.phone,
        createAnyway: person.createAnyway || undefined,
        duplicateReason: person.createAnyway ? person.duplicateReason : undefined,
      });
      await onDone(res);
    } catch (err) {
      if (!takeDuplicateError(err, setPerson)) push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('teachers.addTitle')}
      subtitle={t('teachers.addHint')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn--primary" disabled={busy || memberHere || !parentReady(person)} onClick={submit}>
            {busy && <span className="spinner spinner--light" />} {person.parentId ? t('teachers.addToSchool') : t('common.save')}
          </button>
        </>
      }
    >
      <ParentPicker kind="teacher" value={person} onChange={setPerson} />
      <Alert tone="info">{t('teachers.loginNote')}</Alert>
    </Modal>
  );
}

function TeacherModal({ teacher, onClose, onSubmit, busy }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    fullName: teacher.full_name || '',
    email: teacher.email || '',
    phone: teacher.phone || '',
    status: teacher.status || 'active',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={t('common.edit')}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !form.fullName.trim() || !form.email.trim() || !form.phone.trim()}
            onClick={() => onSubmit({ full_name: form.fullName, email: form.email, phone: form.phone, status: form.status })}
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
        <Field label={t('common.ic')}>
          <Input value={teacher.ic_masked || '—'} disabled />
        </Field>
        <Field label={t('teachers.email')} required>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('teachers.phone')} required>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
