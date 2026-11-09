import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi, useDebounced } from '../../hooks';
import Icon from '../../components/Icon';
import ParentPicker, { emptyParent, parentReady, takeDuplicateError } from '../../components/ParentPicker';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Loading,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';

export default function Parents() {
  const { t, date } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/parents');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [unlinking, setUnlinking] = useState(null);
  const { data: detail, loading: detailLoading, reload: reloadDetail } = useApi(selected ? `/parents/${selected}` : null, { enabled: !!selected });

  const parents = (data?.parents || []).filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [p.full_name, p.email, p.phone, p.ic_masked].some((v) => String(v || '').toLowerCase().includes(q));
  });
  const isAdmin = user?.isSuper || user?.role === 'school_admin';

  async function run(fn, message) {
    setBusy(true);
    try {
      await fn();
      push(message || t('common.success'));
      return true;
    } catch (err) {
      push(err.message, 'danger');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(payload) {
    if (await run(() => api.patch(`/parents/${selected}`, payload), t('parentRecord.updated'))) {
      setEditing(false);
      await reloadDetail(true);
      await reload(true);
    }
  }

  // Server enforces Super Admin only; School Admin never sees these actions.
  async function doConfirm() {
    const action = confirm;
    const ok = await run(
      () => (action === 'delete' ? api.del(`/parents/${selected}`) : api.post(`/parents/${selected}/status`, { status: action })),
      t(action === 'delete' ? 'parentRecord.deleted' : action === 'inactive' ? 'parentRecord.deactivated' : 'parentRecord.activated'),
    );
    setConfirm(null);
    if (ok) {
      if (action === 'delete') setSelected(null);
      else await reloadDetail(true);
      await reload(true);
    }
  }

  async function linkStudent(payload) {
    if (await run(() => api.post(`/parents/${selected}/link`, payload), t('parentRecord.childLinked'))) {
      await reloadDetail(true);
      await reload(true);
      return true;
    }
    return false;
  }

  async function removeLink() {
    const child = unlinking;
    const ok = await run(
      () => api.del(`/parents/${selected}/links/${child.id}`, child.last_link ? { confirmLastLink: true } : {}),
      t('parentRecord.linkRemoved'),
    );
    setUnlinking(null);
    if (ok) {
      await reloadDetail(true);
      await reload(true);
    }
  }

  return (
    <>
      <PageHeader
        title={t('parents.title')}
        subtitle={t('parents.subtitle')}
        actions={
          isAdmin && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> {t('parentRecord.add')}
            </button>
          )
        }
      />

      <Card padded={false}>
        <div className="toolbar">
          <div className="searchbox">
            <Icon name="search" size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')} — ${t('parents.contact')}`} />
          </div>
          <span className="muted">{parents.length} {t('common.results')}</span>
        </div>
        {error ? (
          <div className="pad"><ErrorState error={error} onRetry={reload} /></div>
        ) : (
          <DataTable
            rows={parents}
            loading={loading}
            onRowClick={(row) => setSelected(row.id)}
            columns={[
              {
                key: 'full_name',
                label: t('common.name'),
                render: (r) => (
                  <span className="stack-cell">
                    <strong>{r.full_name} {r.status === 'inactive' && <Badge tone="rose">{t('parentRecord.inactiveBadge')}</Badge>}</strong>
                    <small>{r.ic_masked || '—'}{r.schools > 1 ? ` · ${t('parentRecord.schoolsCount', { n: r.schools })}` : ''}</small>
                  </span>
                ),
              },
              {
                key: 'contact',
                label: t('parents.contact'),
                render: (r) => (
                  <span className="stack-cell">
                    <span>{r.email || '—'}</span>
                    <small>{r.phone || '—'}</small>
                  </span>
                ),
              },
              { key: 'children', label: t('nav.children') === 'nav.children' ? t('parents.children') : t('parents.children'), align: 'center', render: (r) => <Badge tone={r.children ? 'teal' : 'slate'}>{r.children}</Badge> },
              { key: 'created_at', label: t('common.date'), render: (r) => date(r.created_at) },
              { key: 'go', label: '', align: 'right', render: () => <span className="rowaction"><Icon name="chevronRight" size={17} /></span> },
            ]}
          />
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setEditing(false);
        }}
        title={detail?.parent?.full_name || t('parents.title')}
        subtitle={t('parents.childDetail')}
        size="lg"
        footer={
          <>
            {detail?.canDeactivate && (
              <>
                <button type="button" className="btn btn--danger" onClick={() => setConfirm('delete')} disabled={busy}>
                  {t('parentRecord.delete')}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setConfirm(detail.parent.status === 'inactive' ? 'active' : 'inactive')}
                  disabled={busy}
                >
                  {detail.parent.status === 'inactive' ? t('parentRecord.activate') : t('parentRecord.deactivate')}
                </button>
              </>
            )}
            {detail?.canEdit && !editing && (
              <button type="button" className="btn btn--outline" onClick={() => setEditing(true)}>
                <Icon name="edit" size={15} /> {t('common.edit')}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => setSelected(null)}>{t('common.close')}</button>
          </>
        }
      >
        {detailLoading && !detail ? (
          <Loading />
        ) : detail ? (
          <>
            {detail.parent.status === 'inactive' && <Alert tone="danger">{t('parentRecord.inactive')}</Alert>}
            {editing ? (
              <EditParentForm parent={detail.parent} busy={busy} onCancel={() => setEditing(false)} onSave={saveEdit} />
            ) : (
            <KeyValue
              items={[
                { label: t('common.name'), value: detail.parent.full_name },
                { label: t('common.ic'), value: detail.parent.ic_masked || '—' },
                { label: t('common.email'), value: detail.parent.email || '—' },
                { label: t('common.phone'), value: detail.parent.phone || '—' },
                { label: t('common.address'), value: detail.parent.address || '—' },
              ]}
            />
            )}
            <h4 className="detaillabel">{t('parents.children')}</h4>
            {!detail.children?.length ? (
              <p className="muted">{t('parents.noChildren')}</p>
            ) : (
              <div className="childlinklist">
                {detail.children.map((child) => (
                  <div className="childlink" key={child.id}>
                    <span className="avatar avatar--teal">{child.full_name.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                    <div>
                      <strong>{child.full_name}</strong>
                      <small>{child.ic_masked || '—'} · {child.school_name}</small>
                    </div>
                    <Badge tone="sand">{t(`students.${child.relationship === 'mother' ? 'mother' : child.relationship === 'father' ? 'father' : 'guardian'}`)}</Badge>
                    <StatusBadge status={child.status} />
                    {detail.canLink && child.school_id === user?.activeSchool && (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setUnlinking(child)} disabled={busy}>
                        {t('parentRecord.removeLink')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {detail.canLink && detail.parent.status !== 'inactive' && (
              <LinkStudentForm busy={busy} linkedIds={(detail.children || []).map((c) => c.id)} onSubmit={linkStudent} />
            )}
          </>
        ) : null}
      </Modal>

      <AddParentModal
        open={adding}
        onClose={() => setAdding(false)}
        onDone={async (res) => {
          push(res?.linked ? t('parentRecord.linkedExisting') : t('parentRecord.created'));
          setAdding(false);
          await reload(true);
        }}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        busy={busy}
        danger={confirm !== 'active'}
        title={confirm === 'delete' ? t('parentRecord.delete') : confirm === 'inactive' ? t('parentRecord.deactivate') : t('parentRecord.activate')}
        message={confirm === 'delete' ? t('parentRecord.deleteConfirm') : confirm === 'inactive' ? t('parentRecord.deactivateConfirm') : t('parentRecord.activateConfirm')}
        confirmLabel={confirm === 'delete' ? t('parentRecord.delete') : confirm === 'inactive' ? t('parentRecord.deactivate') : t('parentRecord.activate')}
        onConfirm={doConfirm}
      />

      <ConfirmDialog
        open={!!unlinking}
        onClose={() => setUnlinking(null)}
        busy={busy}
        danger
        title={t('parentRecord.removeLink')}
        message={unlinking?.last_link
          ? t('parentRecord.removeLastLinkConfirm', { student: unlinking.full_name })
          : t('parentRecord.removeLinkConfirm', { student: unlinking?.full_name || '' })}
        confirmLabel={t('parentRecord.removeLink')}
        onConfirm={removeLink}
      />
    </>
  );
}

function EditParentForm({ parent, busy, onCancel, onSave }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    fullName: parent.full_name || '',
    email: parent.email || '',
    phone: parent.phone || '',
    address: parent.address || '',
    ic: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="insetform">
      <div className="formgrid">
        <Field label={t('common.name')} required>
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label={t('parentRecord.icLabel')} hint={parent.ic_masked ? t('parentRecord.icKeep', { ic: parent.ic_masked }) : t('parentRecord.icMissing')}>
          <Input value={form.ic} autoComplete="off" onChange={(e) => set('ic', e.target.value)} />
        </Field>
        <Field label={t('common.email')} required>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('common.phone')} required>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('common.address')} className="formgrid__full">
          <Textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>
      <div className="buttonrow">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>{t('common.cancel')}</button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={busy || !form.fullName.trim() || !form.email.trim() || !form.phone.trim()}
          onClick={() => {
            const { ic, ...rest } = form;
            onSave(ic ? { ...rest, ic } : rest);
          }}
        >
          {busy && <span className="spinner spinner--light" />} {t('common.save')}
        </button>
      </div>
    </div>
  );
}

function AddParentModal({ open, onClose, onDone }) {
  const { t } = useI18n();
  const { push } = useToast();
  const { data } = useApi('/lookups', { enabled: open });
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('guardian');
  const [parent, setParent] = useState(emptyParent);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post('/parents', {
        studentId,
        relationship,
        ic: parent.ic,
        parentId: parent.parentId || undefined,
        fullName: parent.name,
        email: parent.email,
        phone: parent.phone,
        createAnyway: parent.createAnyway || undefined,
        duplicateReason: parent.createAnyway ? parent.duplicateReason : undefined,
      });
      setParent(emptyParent());
      setStudentId('');
      await onDone(res);
    } catch (err) {
      if (!takeDuplicateError(err, setParent)) push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('parentRecord.add')}
      subtitle={t('parentRecord.addHint')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn--primary" disabled={busy || !studentId || !parentReady(parent)} onClick={submit}>
            {busy && <span className="spinner spinner--light" />} {t('common.save')}
          </button>
        </>
      }
    >
      <div className="formgrid">
        <Field label={t('common.selectStudent')} required>
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {(data?.students || []).map((s) => (
              <option key={s.id} value={s.id}>{s.full_name} — {s.ic_masked || '—'}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('students.relationship')}>
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            <option value="guardian">{t('students.guardian')}</option>
            <option value="father">{t('students.father')}</option>
            <option value="mother">{t('students.mother')}</option>
          </Select>
        </Field>
      </div>
      <ParentPicker value={parent} onChange={setParent} />
    </Modal>
  );
}

/** Link child: search the school's own students by name or IC / Passport No. */
function LinkStudentForm({ busy, linkedIds, onSubmit }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const term = debounced.trim();
  const { data, loading } = useApi(term.length >= 2 ? `/students?q=${encodeURIComponent(term)}&pageSize=10` : null, { enabled: term.length >= 2 });
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('guardian');
  const results = (data?.students || []).filter((s) => !linkedIds.includes(s.id));

  return (
    <div className="insetform">
      <h4 className="detaillabel">{t('parentRecord.linkChild')}</h4>
      <div className="formgrid">
        <Field label={t('parentRecord.findStudent')} hint={t('parentRecord.findStudentHint')}>
          <Input value={q} onChange={(e) => { setQ(e.target.value); setStudentId(''); }} autoComplete="off" />
        </Field>
        <Field label={t('students.relationship')}>
          <Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            <option value="guardian">{t('students.guardian')}</option>
            <option value="father">{t('students.father')}</option>
            <option value="mother">{t('students.mother')}</option>
          </Select>
        </Field>
        {term.length >= 2 && (
          <Field label={t('common.selectStudent')} className="formgrid__full">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">{loading ? '…' : results.length ? t('common.select') : t('common.noData')}</option>
              {results.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} — {s.ic_masked || '—'}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <button
        type="button"
        className="btn btn--outline btn--sm"
        disabled={busy || !studentId}
        onClick={async () => {
          if (await onSubmit({ studentId, relationship })) {
            setQ('');
            setStudentId('');
          }
        }}
      >
        {busy && <span className="spinner" />} {t('parentRecord.linkChild')}
      </button>
    </div>
  );
}
