import { useMemo, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import Icon from '../components/Icon';
import {
  Alert,
  Badge,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  Tabs,
  useToast,
} from '../components/ui';

const EMPTY = {
  title_bm: '',
  title_en: '',
  body_bm: '',
  body_en: '',
  category: 'general',
  status: 'draft',
  starts_at: '',
  ends_at: '',
  link_url: '',
  link_label_bm: '',
  link_label_en: '',
  is_pinned: false,
};

const CATEGORY_TONE = { general: 'slate', admission: 'teal', event: 'amber', reminder: 'purple' };

function toForm(row) {
  return {
    title_bm: row.title_bm || '',
    title_en: row.title_en || '',
    body_bm: row.body_bm || '',
    body_en: row.body_en || '',
    category: row.category || 'general',
    status: row.status || 'draft',
    starts_at: row.starts_at ? String(row.starts_at).slice(0, 10) : '',
    ends_at: row.ends_at ? String(row.ends_at).slice(0, 10) : '',
    link_url: row.link_url || '',
    link_label_bm: row.link_label_bm || '',
    link_label_en: row.link_label_en || '',
    is_pinned: Boolean(row.is_pinned),
  };
}

export default function Announcements() {
  const { t, lang, date } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/announcements');
  const announcements = data?.announcements || [];

  const [tab, setTab] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const counts = useMemo(() => {
    const result = { all: announcements.length, published: 0, draft: 0, archived: 0, pinned: 0 };
    for (const item of announcements) {
      if (result[item.status] !== undefined) result[item.status] += 1;
      if (item.is_pinned) result.pinned += 1;
    }
    return result;
  }, [announcements]);

  const rows = useMemo(
    () => (tab === 'all' ? announcements : announcements.filter((item) => item.status === tab)),
    [announcements, tab],
  );

  function openAdd() {
    setForm(EMPTY);
    setFormError('');
    setModal({ type: 'form', row: null });
  }

  function openEdit(row) {
    setForm(toForm(row));
    setFormError('');
    setModal({ type: 'form', row });
  }

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!form.title_bm.trim() || !form.body_bm.trim()) {
      setFormError(t('common.requiredNote'));
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const payload = { ...form, is_pinned: form.is_pinned ? 1 : 0 };
      if (modal.row) {
        await api.patch(`/announcements/${modal.row.id}`, payload);
        push(t('announcements.saved'), 'success');
      } else {
        await api.post('/announcements', payload);
        push(t('announcements.created'), 'success');
      }
      setModal(null);
      await reload(true);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row, status) {
    setBusyId(row.id);
    try {
      await api.patch(`/announcements/${row.id}`, { status });
      push(status === 'published' ? t('announcements.publishedMsg') : t('announcements.archivedMsg'), 'success');
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.del(`/announcements/${deleteTarget.id}`);
      push(t('announcements.deleted'), 'success');
      setDeleteTarget(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'title',
      label: t('announcements.title'),
      render: (row) => (
        <span className="stack-cell">
          <strong>{lang === 'en' ? row.title_en || row.title_bm : row.title_bm}</strong>
          <small>{lang === 'en' ? row.title_bm : row.title_en || '—'}</small>
        </span>
      ),
    },
    {
      key: 'category',
      label: t('announcements.category'),
      render: (row) => (
        <Badge tone={CATEGORY_TONE[row.category] || 'slate'}>
          {t(`announcements.categories.${row.category}`)}
        </Badge>
      ),
    },
    {
      key: 'schedule',
      label: t('announcements.schedule'),
      render: (row) => (
        <span className="stack-cell announcement-schedule">
          <strong>{date(row.starts_at) || '—'}</strong>
          <small>{t('announcements.endsAt')}: {date(row.ends_at) || '—'}</small>
        </span>
      ),
    },
    {
      key: 'pinned',
      label: '',
      render: (row) => (row.is_pinned ? (
        <span className="announcement-pin" title={t('announcements.pinned')}>
          <Icon name="pin" size={15} />
        </span>
      ) : null),
    },
    { key: 'status', label: t('announcements.status'), render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'updated_at',
      label: t('announcements.updated'),
      render: (row) => <span className="muted">{date(row.updated_at || row.created_at)}</span>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <span className="buttonrow">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => openEdit(row)}>
            {t('common.edit')}
          </button>
          {row.status === 'published' ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setStatus(row, 'archived')}
              disabled={busyId === row.id}
            >
              {t('announcements.archive')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setStatus(row, 'published')}
              disabled={busyId === row.id}
            >
              {t('announcements.publish')}
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setDeleteTarget(row)}>
            {t('common.delete')}
          </button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t('nav.administration')}
        title={t('announcements.title')}
        subtitle={t('announcements.subtitle')}
        actions={
          <button type="button" className="btn btn--primary" onClick={openAdd}>
            <Icon name="plus" size={17} /> {t('announcements.add')}
          </button>
        }
      />

      <div className="statgrid statgrid--4">
        <StatCard label={t('announcements.total')} value={counts.all} icon="megaphone" tone="teal" />
        <StatCard label={t('announcements.live')} value={counts.published} icon="checkCircle" tone="green" />
        <StatCard label={t('announcements.drafts')} value={counts.draft} icon="edit" tone="amber" />
        <StatCard label={t('announcements.pinnedStat')} value={counts.pinned} icon="pin" tone="purple" />
      </div>

      {error && <Alert tone="danger">{error.message}</Alert>}

      <Card padded={false}>
        <div className="tabsbar">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: t('common.all'), count: counts.all },
              { id: 'published', label: t('common.published'), count: counts.published },
              { id: 'draft', label: t('common.draft'), count: counts.draft },
              { id: 'archived', label: t('common.archived'), count: counts.archived },
            ]}
          />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          empty={
            <div className="announcement-empty">
              <span className="announcement-empty__icon"><Icon name="megaphone" size={26} /></span>
              <h3>{t('announcements.emptyTitle')}</h3>
              <p>{t('announcements.emptyText')}</p>
              <button type="button" className="btn btn--primary btn--sm" onClick={openAdd}>
                <Icon name="plus" size={15} /> {t('announcements.add')}
              </button>
            </div>
          }
        />
      </Card>

      <Modal
        open={modal?.type === 'form'}
        onClose={() => !busy && setModal(null)}
        title={modal?.row ? t('announcements.edit') : t('announcements.add')}
        subtitle={t('announcements.formHint')}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setModal(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
              {busy && <span className="spinner spinner--light" />}
              {t('common.save')}
            </button>
          </>
        }
      >
        {formError && <Alert tone="danger" onClose={() => setFormError('')}>{formError}</Alert>}

        <div className="formgrid">
          <Field label={t('announcements.category')}>
            <Select value={form.category} onChange={(e) => update('category', e.target.value)}>
              {Object.keys(CATEGORY_TONE).map((key) => (
                <option key={key} value={key}>{t(`announcements.categories.${key}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('announcements.status')}>
            <Select value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="draft">{t('common.draft')}</option>
              <option value="published">{t('common.published')}</option>
              <option value="archived">{t('common.archived')}</option>
            </Select>
          </Field>
        </div>

        <div className="formgrid">
          <Field label={t('announcements.titleBm')} required>
            <Input
              value={form.title_bm}
              onChange={(e) => update('title_bm', e.target.value)}
              maxLength={180}
              placeholder="Contoh: Pendaftaran sesi 2026 kini dibuka"
            />
          </Field>
          <Field label={t('announcements.titleEn')}>
            <Input
              value={form.title_en}
              onChange={(e) => update('title_en', e.target.value)}
              maxLength={180}
              placeholder="e.g. 2026 enrolment is now open"
            />
          </Field>
          <Field label={t('announcements.bodyBm')} required>
            <Textarea
              value={form.body_bm}
              onChange={(e) => update('body_bm', e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Tulis ringkasan pengumuman dalam Bahasa Melayu."
            />
          </Field>
          <Field label={t('announcements.bodyEn')}>
            <Textarea
              value={form.body_en}
              onChange={(e) => update('body_en', e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Write the announcement summary in English."
            />
          </Field>
        </div>

        <div className="formgrid">
          <Field label={t('announcements.startsAt')}>
            <Input type="date" value={form.starts_at} onChange={(e) => update('starts_at', e.target.value)} />
          </Field>
          <Field label={t('announcements.endsAt')}>
            <Input type="date" value={form.ends_at} onChange={(e) => update('ends_at', e.target.value)} />
          </Field>
        </div>

        <div className="formgrid">
          <Field label={t('announcements.linkUrl')} hint={t('announcements.linkUrlHint')} className="formgrid__full">
            <Input
              value={form.link_url}
              onChange={(e) => update('link_url', e.target.value)}
              maxLength={500}
              placeholder="/apply"
            />
          </Field>
          <Field label={t('announcements.linkLabelBm')}>
            <Input
              value={form.link_label_bm}
              onChange={(e) => update('link_label_bm', e.target.value)}
              maxLength={80}
              placeholder="Mohon sekarang"
            />
          </Field>
          <Field label={t('announcements.linkLabelEn')}>
            <Input
              value={form.link_label_en}
              onChange={(e) => update('link_label_en', e.target.value)}
              maxLength={80}
              placeholder="Apply now"
            />
          </Field>
        </div>

        <div className="announcement-form__pin">
          <Checkbox
            label={t('announcements.pinned')}
            checked={form.is_pinned}
            onChange={(e) => update('is_pinned', e.target.checked)}
          />
          <p>{t('announcements.pinnedHint')}</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => !busy && setDeleteTarget(null)}
        onConfirm={remove}
        title={t('announcements.deleteTitle')}
        message={t('announcements.deleteText')}
        confirmLabel={t('common.delete')}
        busy={busy}
      />
    </>
  );
}
