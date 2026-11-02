import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { useApi } from '../../hooks';
import Icon from '../../components/Icon';
import {
  Badge,
  Card,
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
  const { data: detail, loading: detailLoading, reload: reloadDetail } = useApi(selected ? `/parents/${selected}` : null, { enabled: !!selected });

  const parents = (data?.parents || []).filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [p.full_name, p.email, p.phone].some((v) => String(v || '').toLowerCase().includes(q));
  });
  const isAdmin = user?.isSuper || user?.role === 'school_admin';

  async function linkStudent(payload) {
    setBusy(true);
    try {
      await api.post(`/parents/${selected}/link`, payload);
      push(t('common.success'));
      await reloadDetail(true);
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
        title={t('parents.title')}
        subtitle={t('parents.subtitle')}
        actions={
          isAdmin && (
            <Link to="/app/users?role=parent" className="btn btn--primary btn--sm">
              <Icon name="plus" size={16} /> {t('users.addUser')}
            </Link>
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
                    <strong>{r.full_name}</strong>
                    <small>{r.ic_masked || '—'}</small>
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
        onClose={() => setSelected(null)}
        title={detail?.parent?.full_name || t('parents.title')}
        subtitle={t('parents.childDetail')}
        size="lg"
        footer={<button type="button" className="btn btn--ghost" onClick={() => setSelected(null)}>{t('common.close')}</button>}
      >
        {detailLoading && !detail ? (
          <Loading />
        ) : detail ? (
          <>
            <KeyValue
              items={[
                { label: t('common.name'), value: detail.parent.full_name },
                { label: t('common.ic'), value: detail.parent.ic_masked || '—' },
                { label: t('common.email'), value: detail.parent.email || '—' },
                { label: t('common.phone'), value: detail.parent.phone || '—' },
                { label: t('common.address'), value: detail.parent.address || '—' },
              ]}
            />
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
                      <small>{child.class_name || '—'} · {child.school_name}</small>
                    </div>
                    <Badge tone="sand">{t(`students.${child.relationship === 'mother' ? 'mother' : child.relationship === 'father' ? 'father' : 'guardian'}`)}</Badge>
                    <StatusBadge status={child.status} />
                  </div>
                ))}
              </div>
            )}
            {isAdmin && (
              <LinkStudentForm busy={busy} onSubmit={linkStudent} />
            )}
          </>
        ) : null}
      </Modal>
    </>
  );
}

function LinkStudentForm({ busy, onSubmit }) {
  const { t } = useI18n();
  const { data } = useApi('/lookups');
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('guardian');

  return (
    <div className="insetform">
      <h4 className="detaillabel">{t('students.linkParent')}</h4>
      <div className="formgrid">
        <Field label={t('common.selectStudent')}>
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">{t('common.select')}</option>
            {(data?.students || []).map((s) => (
              <option key={s.id} value={s.id}>{s.full_name} — {s.class_name || '—'}</option>
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
      <button type="button" className="btn btn--outline btn--sm" disabled={busy || !studentId} onClick={() => onSubmit({ studentId, relationship })}>
        {busy && <span className="spinner" />} {t('students.addParent')}
      </button>
    </div>
  );
}
