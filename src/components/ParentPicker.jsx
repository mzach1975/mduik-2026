import { useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import Icon from './Icon';
import { Alert, Badge, Checkbox, Field, Input, KeyValue, Textarea } from './ui';

export const emptyParent = (defaults = {}) => ({
  ic: '',
  searched: false,
  match: null,
  parentId: null,
  name: defaults.name || '',
  email: defaults.email || '',
  phone: defaults.phone || '',
  duplicates: null,
  createAnyway: false,
  duplicateReason: '',
});

/** Request fields for the registration and parent APIs. */
export function parentPayload(p) {
  if (p.parentId) return { parentId: p.parentId, parentIc: p.ic || undefined, parentEmail: p.email || undefined, parentPhone: p.phone || undefined };
  return {
    parentIc: p.ic,
    parentName: p.name,
    parentEmail: p.email,
    parentPhone: p.phone,
    createAnyway: p.createAnyway || undefined,
    duplicateReason: p.createAnyway ? p.duplicateReason : undefined,
  };
}

/** True when the error was the duplicate email/phone warning (state is updated to show it). */
export function takeDuplicateError(err, setValue) {
  if (err?.status === 409 && err.data?.code === 'duplicate_contact') {
    setValue((p) => ({ ...p, duplicates: err.data.matches || [] }));
    return true;
  }
  return false;
}

/** Same rule as the server: uppercase, spaces and hyphens removed. */
export const normalizeIc = (v) => String(v ?? '').toUpperCase().replace(/[\s-]+/g, '');
const icSearchable = (v) => /^[A-Z0-9]{5,20}$/.test(normalizeIc(v));

/** The form can be submitted: a record was selected, or a new one has IC / Passport No., name, email and phone. */
export function parentReady(p) {
  if (p.parentId) return true;
  if (!p.searched || !p.ic || !p.name.trim() || !p.email.trim() || !p.phone.trim()) return false;
  if (p.createAnyway && p.duplicateReason.trim().length < 5) return false;
  return true;
}

/**
 * Person section of a form (parent, or teacher with kind="teacher"): search by
 * IC / Passport No. first. A match is selected and shown; no match opens the
 * new-person fields. An email/phone warning from the server lists parents and
 * teachers; "use existing" is offered for records of the same kind, otherwise
 * "create anyway" with a reason.
 */
export default function ParentPicker({ value, onChange, kind = 'parent' }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => onChange((p) => ({ ...p, ...patch }));
  const ns = kind === 'teacher' ? 'teachers' : 'parentRecord';

  async function search() {
    setBusy(true);
    setError('');
    try {
      const res = await api.get(`/${kind === 'teacher' ? 'teachers' : 'parents'}/lookup?ic=${encodeURIComponent(normalizeIc(value.ic))}`);
      set({ searched: true, match: res.match, parentId: res.match?.id || null, duplicates: null, createAnyway: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const reset = () => onChange((p) => ({ ...emptyParent({ name: p.name, email: p.email, phone: p.phone }), ic: p.ic }));

  return (
    <div className="parentpicker">
      <div className="parentpicker__search">
        <Field label={t(`${ns}.icLabel`)} hint={t('parentRecord.icHint')} error={error} required>
          <Input
            value={value.ic}
            autoComplete="off"
            onChange={(e) => onChange((p) => ({ ...emptyParent({ name: p.name, email: p.email, phone: p.phone }), ic: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (icSearchable(value.ic)) search();
              }
            }}
          />
        </Field>
        <button type="button" className="btn btn--ghost" onClick={search} disabled={busy || !icSearchable(value.ic)}>
          {busy ? <span className="spinner" /> : <Icon name="search" size={15} />} {t('parentRecord.search')}
        </button>
      </div>

      {value.searched && value.match && (
        <div className="parentpicker__match">
          <Alert tone="success" title={t(`${ns}.matchTitle`)}>{t(kind === 'teacher' ? 'teachers.matchHint' : 'parentRecord.matchHint')}</Alert>
          <KeyValue
            items={[
              { label: t('common.name'), value: value.match.full_name },
              { label: t('parentRecord.ic'), value: <span className="mono">{value.match.ic_masked}</span> },
              { label: t('common.email'), value: value.match.email || '—' },
              { label: t('common.phone'), value: value.match.phone || '—' },
              { label: t('common.address'), value: value.match.address || '—' },
              { label: t('parentRecord.linkedSchools'), value: (value.match.linkedSchools || value.match.schools?.map((x) => x.school_name))?.join(', ') || '—' },
            ]}
          />
          {kind === 'parent' && value.match.status === 'inactive' && <Alert tone="danger">{t('parentRecord.inactive')}</Alert>}
          {value.match.memberHere && <Alert tone="warning">{t('teachers.alreadyMember')}</Alert>}
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>{t('parentRecord.searchAgain')}</button>
        </div>
      )}

      {value.searched && !value.match && !value.parentId && (
        <>
          <Alert tone="info" title={t(`${ns}.noMatchTitle`)}>{t(`${ns}.noMatchHint`)}</Alert>
          <div className="formgrid">
            <Field label={t('common.name')} required>
              <Input value={value.name} onChange={(e) => set({ name: e.target.value, duplicates: null })} />
            </Field>
            <Field label={t('common.email')} required>
              <Input type="email" value={value.email} onChange={(e) => set({ email: e.target.value, duplicates: null, createAnyway: false })} />
            </Field>
            <Field label={t('common.phone')} required>
              <Input value={value.phone} onChange={(e) => set({ phone: e.target.value, duplicates: null, createAnyway: false })} />
            </Field>
          </div>
        </>
      )}

      {value.parentId && !value.match && (
        <Alert tone="success" title={t('parentRecord.linkingTitle')}>
          {t('parentRecord.linkingHint')}{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => set({ parentId: null })}>{t('common.cancel')}</button>
        </Alert>
      )}

      {value.duplicates?.length > 0 && !value.parentId && (
        <div className="parentpicker__dups">
          <Alert tone="warning" title={t('parentRecord.dupTitle')}>{t('parentRecord.dupHint')}</Alert>
          <ul className="duplist">
            {value.duplicates.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>{m.full_name}</strong>
                  <small>
                    {[m.email, m.phone, m.ic_masked].filter(Boolean).join(' · ')}
                  </small>
                  <span className="duplist__tags">
                    <Badge tone="slate">{t(m.kind === 'teacher' ? 'parentRecord.kindTeacher' : 'parentRecord.kindParent')}</Badge>
                    {m.matchedOn?.map((k) => <Badge key={k} tone="amber">{t(`parentRecord.matched_${k}`)}</Badge>)}
                  </span>
                </div>
                {(m.kind || 'parent') === kind && (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => set({ parentId: m.id, createAnyway: false })}>
                    {t('parentRecord.linkExisting')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Checkbox label={t('parentRecord.createAnyway')} checked={value.createAnyway} onChange={(e) => set({ createAnyway: e.target.checked })} />
          {value.createAnyway && (
            <Field label={t('parentRecord.reason')} hint={t('parentRecord.reasonHint')} required>
              <Textarea rows={2} value={value.duplicateReason} onChange={(e) => set({ duplicateReason: e.target.value })} />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
