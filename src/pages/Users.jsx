import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Badge,
  Card,
  Checkbox,
  DataTable,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  RoleBadge,
  SearchBox,
  Select,
  StatusBadge,
  useToast,
} from '../components/ui';

const ROLES = ['school_admin', 'bursar', 'teacher', 'parent'];

export default function Users() {
  const { t, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [modal, setModal] = useState(null);
  const isSuper = Boolean(user?.isSuper);

  const query = search ? `?q=${encodeURIComponent(search)}` : '';
  const { data, loading, error, reload } = useApi(`/users${query}`);

  const users = useMemo(() => {
    const list = data?.users || [];
    if (!roleFilter) return list;
    return list.filter((u) => String(u.roles || '').split(',').includes(roleFilter));
  }, [data, roleFilter]);

  return (
    <>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'add' })}>
            <Icon name="plus" size={16} /> {t('users.addUser')}
          </button>
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder={`${t('common.search')} — ${t('users.name')}`} />
          <div className="toolbar__filters">
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">{t('common.all')} · {t('users.role')}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{t(`users.${r === 'school_admin' ? 'schoolAdmin' : r}`)}</option>
              ))}
            </Select>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => reload()} aria-label={t('common.refresh')}>
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={users}
            loading={loading}
            empty={t('users.noUsers')}
            onRowClick={(row) => setModal({ type: 'edit', id: row.id })}
            columns={[
              {
                key: 'full_name',
                label: t('users.name'),
                render: (r) => (
                  <span className="stack-cell">
                    <strong>{r.full_name}</strong>
                    <small>{r.email}</small>
                  </span>
                ),
              },
              {
                key: 'roles',
                label: t('users.role'),
                render: (r) => (
                  <span className="badgerow">
                    {String(r.roles || '').split(',').filter(Boolean).map((role) => (
                      <RoleBadge key={role} role={role} />
                    ))}
                  </span>
                ),
              },
              { key: 'schools', label: t('users.school'), render: (r) => r.schools || (isSuper ? t('schools.stateLevel') : '—') },
              { key: 'phone', label: t('common.phone'), render: (r) => r.phone || '—' },
              { key: 'last_login_at', label: t('users.lastLogin'), render: (r) => (r.last_login_at ? date(r.last_login_at) : t('users.never')) },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
              { key: 'go', label: '', align: 'right', render: () => <span className="rowaction"><Icon name="chevronRight" size={17} /></span> },
            ]}
          />
        )}
      </Card>

      <UserModal
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={async (message) => {
          push(message);
          setModal(null);
          await reload(true);
        }}
      />
    </>
  );
}

function UserModal({ modal, onClose, onSaved }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const isSuper = Boolean(user?.isSuper);
  const isEdit = modal?.type === 'edit';
  const { data: detail, loading } = useApi(isEdit ? `/users/${modal.id}` : null, { enabled: isEdit });
  const { data: schoolData } = useApi('/schools', { enabled: isSuper });
  const { data: lookups } = useApi('/lookups', { enabled: modal?.type === 'add' });
  const [form, setForm] = useState({});
  const [roles, setRoles] = useState([]);
  const [studentIds, setStudentIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!modal) return;
    if (modal.type === 'add') {
      setForm({
        fullName: '',
        email: '',
        phone: '',
        ic: '',
        password: '',
        language: 'bm',
        role: 'teacher',
        schoolId: user?.activeSchool || '',
      });
      setRoles([]);
      setStudentIds([]);
    }
    setPassword('');
    setPwOpen(false);
  }, [modal, user?.activeSchool]);

  useEffect(() => {
    if (!detail) return;
    setForm({
      fullName: detail.user.full_name || '',
      email: detail.user.email || '',
      phone: detail.user.phone || '',
      language: detail.user.language || 'bm',
      status: detail.user.status || 'active',
      role: detail.roles?.[0]?.role || 'teacher',
      schoolId: detail.roles?.[0]?.school_id || '',
    });
    setRoles((detail.roles || []).map((r) => ({ role: r.role, schoolId: r.school_id || '' })));
  }, [detail]);

  const schools = schoolData?.schools || [];
  const schoolStudents = lookups?.students || [];

  async function save() {
    setBusy(true);
    try {
      if (isEdit) {
        const body = {
          fullName: form.fullName,
          phone: form.phone,
          language: form.language,
          status: form.status,
        };
        if (password) body.password = password;
        if (isSuper) body.roles = roles.filter((r) => r.role);
        await api.patch(`/users/${detail.user.id}`, body);
        onSaved(t('common.success'));
      } else {
        const res = await api.post('/users', {
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          ic: form.ic,
          password: form.password,
          language: form.language,
          role: form.role,
          schoolId: form.schoolId,
          studentIds: form.role === 'parent' ? studentIds : undefined,
        });
        onSaved(res.temporaryPassword ? `${t('users.temporaryPassword')}: ${res.temporaryPassword}` : t('users.created'));
      }
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    try {
      await api.patch(`/users/${modal.id}`, { password });
      push(t('users.passwordChanged'));
      setPassword('');
      setPwOpen(false);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = isEdit
    ? form.fullName?.length > 0
    : form.fullName?.length > 0 && /\S+@\S+\.\S+/.test(form.email || '') && (isSuper ? form.schoolId : true);

  return (
    <>
      <Modal
        open={!!modal}
        onClose={onClose}
        title={isEdit ? t('users.title') : t('users.addTitle')}
        subtitle={isEdit ? detail?.user?.email : t('users.roleHint')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
            {isEdit && form.status === 'active' && (
              <button type="button" className="btn btn--ghost text-rose" onClick={() => setForm((f) => ({ ...f, status: 'inactive' }))}>
                {t('users.deactivate')}
              </button>
            )}
            {isEdit && form.status === 'inactive' && (
              <button type="button" className="btn btn--ghost" onClick={() => setForm((f) => ({ ...f, status: 'active' }))}>
                {t('users.activate')}
              </button>
            )}
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy || !canSubmit}>
              {busy && <span className="spinner spinner--light" />} {isEdit ? t('common.saveChanges') : t('users.addButton')}
            </button>
          </>
        }
      >
        {isEdit && loading && !detail ? (
          <Loading />
        ) : (
          <>
            {!isEdit && (
              <>
                <div className="formgrid">
                  <Field label={t('users.role')} required>
                    <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                      {(isSuper ? ROLES : ROLES.filter((r) => r !== 'school_admin')).map((r) => (
                        <option key={r} value={r}>{t(`users.${r === 'school_admin' ? 'schoolAdmin' : r}`)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('users.school')} required={isSuper}>
                    <Select value={form.schoolId} onChange={(e) => setForm((f) => ({ ...f, schoolId: e.target.value }))} disabled={!isSuper}>
                      {!isSuper && <option value={user?.activeSchool}>{user?.school?.name || '—'}</option>}
                      {isSuper && <option value="">{t('common.select')}</option>}
                      {isSuper && schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                  </Field>
                </div>
                <p className="muted smalltext">{t('users.permissions')}</p>
              </>
            )}

            <div className="formgrid">
              <Field label={t('users.name')} required>
                <Input value={form.fullName || ''} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </Field>
              <Field label={t('users.email')} required={!isEdit}>
                <Input type="email" value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={isEdit} />
              </Field>
              <Field label={t('common.phone')}>
                <Input value={form.phone || ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+60" />
              </Field>
              {!isEdit ? (
                <>
                  <Field label={t('common.ic')} hint={t('students.icHint')}>
                    <Input value={form.ic || ''} onChange={(e) => setForm((f) => ({ ...f, ic: e.target.value }))} placeholder="900101-14-5566" />
                  </Field>
                  <Field label={t('auth.password')} hint={t('users.passwordHint')}>
                    <Input type="text" value={form.password || ''} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mduik@2026" />
                  </Field>
                </>
              ) : (
                <Field label={t('users.accountStatus')}>
                  <Select value={form.status || 'active'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="active">{t('common.active')}</option>
                    <option value="inactive">{t('common.inactive')}</option>
                  </Select>
                </Field>
              )}
              <Field label={t('settings.preferredLanguage')}>
                <Select value={form.language || 'bm'} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                  <option value="bm">{t('settings.malay')}</option>
                  <option value="en">{t('settings.english')}</option>
                </Select>
              </Field>
            </div>

            {!isEdit && form.role === 'parent' && schoolStudents.length > 0 && (
              <div className="insetform">
                <h4 className="detaillabel">{t('users.childLinkHint')}</h4>
                <div className="checkgrid">
                  {schoolStudents.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={`${s.full_name} — ${s.class_name || '—'}`}
                      checked={studentIds.includes(s.id)}
                      onChange={(e) => setStudentIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                    />
                  ))}
                </div>
              </div>
            )}

            {isEdit && detail?.children?.length > 0 && (
              <div className="insetform">
                <h4 className="detaillabel">{t('users.createParentLink')}</h4>
                <div className="childlinklist">
                  {detail.children.map((c) => (
                    <div className="childlink" key={c.student_id}>
                      <span className="avatar avatar--teal">{c.full_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                      <div><strong>{c.full_name}</strong><small>{c.class_name || '—'} · {c.relationship}</small></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSuper && (
              <div className="insetform">
                <div className="section-title">
                  <h4 className="detaillabel">{t('users.rolesLabel')}</h4>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRoles((r) => [...r, { role: 'teacher', schoolId: schools[0]?.id || '' }])}>
                    <Icon name="plus" size={14} /> {t('common.add')}
                  </button>
                </div>
                {roles.map((r, i) => (
                  <div className="roleedit" key={`${r.role}-${i}`}>
                    <Select value={r.role} onChange={(e) => setRoles((prev) => prev.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>
                      <option value="super_admin">{t('users.superAdmin')}</option>
                      {ROLES.map((role) => <option key={role} value={role}>{t(`users.${role === 'school_admin' ? 'schoolAdmin' : role}`)}</option>)}
                    </Select>
                    <Select value={r.schoolId || ''} onChange={(e) => setRoles((prev) => prev.map((x, j) => (j === i ? { ...x, schoolId: e.target.value } : x)))} disabled={r.role === 'super_admin'}>
                      <option value="">{t('schools.stateLevel')}</option>
                      {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>
                    <button type="button" className="btn btn--ghost btn--icon text-rose" onClick={() => setRoles((prev) => prev.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
                {!roles.length && <p className="muted">{t('users.rolesLabel')}: —</p>}
              </div>
            )}

            {isEdit && (
              <div className="insetform">
                <div className="section-title">
                  <h4 className="detaillabel">{t('users.resetPassword')}</h4>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPwOpen((v) => !v)}>
                    <Icon name="lock" size={14} /> {t('auth.changePassword')}
                  </button>
                </div>
                {pwOpen && (
                  <div className="formgrid">
                    <Field label={t('auth.newPassword')} hint={t('auth.newPasswordHint')}>
                      <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                    <div className="formaction">
                      <button type="button" className="btn btn--outline btn--sm" onClick={savePassword} disabled={busy || password.length < 8}>
                        {busy && <span className="spinner" />} {t('common.save')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isEdit && (
              <div className="auditmeta">
                <div><span>{t('users.createdOn')}</span><strong>{detail?.user?.created_at?.slice(0, 10) || '—'}</strong></div>
                <div><span>{t('users.lastLogin')}</span><strong>{detail?.user?.last_login_at?.slice(0, 16).replace('T', ' ') || t('users.never')}</strong></div>
                <div><span>{t('common.ic')}</span><strong>{detail?.user?.ic_masked || '—'}</strong></div>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
