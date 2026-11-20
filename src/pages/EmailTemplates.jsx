import { useMemo, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import {
  Alert,
  Badge,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  SearchBox,
  Textarea,
  useToast,
} from '../components/ui';

/** Fill {{placeholders}} with readable samples for the preview. */
function preview(text, vars) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (vars.includes(k) ? `[${k}]` : m));
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <label className={`switch ${disabled ? 'switch--disabled' : ''}`.trim()} title={label}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
    </label>
  );
}

export default function EmailTemplates() {
  const { t, date } = useI18n();
  const { push } = useToast();
  const { data, loading, error, reload } = useApi('/email-templates');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const rows = useMemo(() => {
    const list = data?.templates || [];
    const s = q.trim().toLowerCase();
    return s ? list.filter((r) => `${r.name} ${r.key}`.toLowerCase().includes(s)) : list;
  }, [data, q]);

  function open(row) {
    setEdit(row);
    setForm({ subjectBm: row.subjectBm, subjectEn: row.subjectEn, bodyBm: row.bodyBm, bodyEn: row.bodyEn });
    setFormError('');
  }

  async function toggle(row) {
    setBusyKey(row.key);
    try {
      await api.patch(`/email-templates/${row.key}`, { enabled: !row.enabled });
      push(!row.enabled ? t('emailTemplates.enabledMsg') : t('emailTemplates.disabledMsg'), 'success');
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusyKey(null);
    }
  }

  async function save() {
    if (!form.subjectBm?.trim() || !form.subjectEn?.trim() || !form.bodyBm?.trim() || !form.bodyEn?.trim()) {
      setFormError(t('common.requiredNote'));
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await api.patch(`/email-templates/${edit.key}`, form);
      push(t('emailTemplates.saved'), 'success');
      setEdit(null);
      await reload(true);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await api.del(`/email-templates/${resetTarget.key}`);
      push(t('emailTemplates.resetMsg'), 'success');
      setResetTarget(null);
      setEdit(null);
      await reload(true);
    } catch (err) {
      push(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      key: 'name',
      label: t('emailTemplates.template'),
      render: (row) => (
        <div>
          <strong>{row.name}</strong>
          <div className="muted smalltext">{row.key}</div>
        </div>
      ),
    },
    {
      key: 'state',
      label: t('emailTemplates.text'),
      render: (row) => (row.customised ? <Badge tone="amber">{t('emailTemplates.customised')}</Badge> : <Badge tone="slate">{t('emailTemplates.default')}</Badge>),
    },
    {
      key: 'updatedAt',
      label: t('emailTemplates.updated'),
      render: (row) => (row.updatedAt ? `${date(row.updatedAt)} · ${row.updatedBy || ''}` : '—'),
    },
    {
      key: 'enabled',
      label: t('emailTemplates.email'),
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Switch
            checked={row.enabled}
            disabled={row.locked || busyKey === row.key}
            onChange={() => toggle(row)}
            label={row.locked ? t('emailTemplates.lockedHint') : t('emailTemplates.toggle')}
          />
          <span className="smalltext">{row.enabled ? t('emailTemplates.on') : t('emailTemplates.off')}</span>
          {row.locked && <Badge tone="slate">{t('emailTemplates.locked')}</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => open(row)}>
          {t('common.edit')}
        </button>
      ),
    },
  ];

  const vars = edit?.vars || [];

  return (
    <>
      <PageHeader title={t('emailTemplates.title')} subtitle={t('emailTemplates.subtitle')} />
      <Card padded={false}>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder={t('emailTemplates.search')} />
        </div>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.key} empty={t('common.noData')} />
        )}
      </Card>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.name}
        subtitle={edit?.key}
        size="lg"
        persistent
        footer={
          <>
            {edit?.customised && (
              <button type="button" className="btn btn--ghost" onClick={() => setResetTarget(edit)} disabled={busy}>
                {t('emailTemplates.reset')}
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn--ghost" onClick={() => setEdit(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn--primary" onClick={save} disabled={busy}>
              {t('common.save')}
            </button>
          </>
        }
      >
        {edit && (
          <div className="stack">
            {formError && <Alert tone="danger">{formError}</Alert>}
            <Alert tone="info" title={t('emailTemplates.placeholders')}>
              {vars.length ? vars.map((v) => <code key={v} className="tplvar">{`{{${v}}}`}</code>) : '—'}
              <div className="smalltext">{t('emailTemplates.placeholdersHint')}</div>
            </Alert>
            <div className="formgrid">
              <Field label={t('emailTemplates.subjectBm')} required>
                <Input value={form.subjectBm || ''} maxLength={200} onChange={(e) => setForm({ ...form, subjectBm: e.target.value })} />
              </Field>
              <Field label={t('emailTemplates.subjectEn')} required>
                <Input value={form.subjectEn || ''} maxLength={200} onChange={(e) => setForm({ ...form, subjectEn: e.target.value })} />
              </Field>
              <Field label={t('emailTemplates.bodyBm')} required>
                <Textarea rows={8} value={form.bodyBm || ''} maxLength={5000} onChange={(e) => setForm({ ...form, bodyBm: e.target.value })} />
              </Field>
              <Field label={t('emailTemplates.bodyEn')} required>
                <Textarea rows={8} value={form.bodyEn || ''} maxLength={5000} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
              </Field>
            </div>
            <div>
              <div className="reportnav__label">{t('emailTemplates.preview')}</div>
              <div className="tplpreview">
                <div className="tplpreview__subject">
                  {[preview(form.subjectBm, vars), preview(form.subjectEn, vars)].filter(Boolean).join(' / ')}
                </div>
                <div className="tplpreview__body">{[preview(form.bodyBm, vars), preview(form.bodyEn, vars)].filter(Boolean).join('\n\n')}</div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={reset}
        title={t('emailTemplates.reset')}
        message={t('emailTemplates.resetConfirm')}
        confirmLabel={t('emailTemplates.reset')}
        busy={busy}
      />
    </>
  );
}
