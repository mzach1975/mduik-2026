import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useApi } from '../hooks';
import { Alert, Field, Input, Select } from './ui';

/** CR-PR 2026-11-18: student placement keys (labels in the locale files). */
export const PLACEMENTS = ['boarding', 'day', 'temp_boarding'];

const PLACEMENT_KEY = { boarding: 'students.placementBoarding', day: 'students.placementDay', temp_boarding: 'students.placementTempBoarding' };

export function placementLabel(t, value) {
  return value && PLACEMENT_KEY[value] ? t(PLACEMENT_KEY[value]) : '—';
}

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The school's classes; `active` lists those that can be given to a student. */
export function useClasses(enabled = true) {
  const { data, loading, reload } = useApi(enabled ? '/classes' : null);
  const classes = data?.classes || [];
  return { classes, active: classes.filter((c) => c.status === 'active'), loading, reload };
}

/**
 * Registration date, class and placement inputs for a `formgrid`.
 * `form` holds registrationDate, classId and placement; `currentClass` keeps an
 * inactive class visible on an existing student.
 */
export function StudentClassFields({ form, set, classes, currentClass = null }) {
  const { t } = useI18n();
  const options = currentClass && !classes.some((c) => c.id === currentClass.id) ? [currentClass, ...classes] : classes;
  return (
    <>
      <Field label={t('students.registrationDate')} required>
        <Input type="date" max={todayLocal()} value={form.registrationDate} onChange={(e) => set('registrationDate', e.target.value)} />
      </Field>
      <Field label={t('students.class')} required>
        <Select value={form.classId} onChange={(e) => set('classId', e.target.value)}>
          <option value="">{t('common.select')}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('students.placement')} required>
        <Select value={form.placement} onChange={(e) => set('placement', e.target.value)}>
          <option value="">{t('common.select')}</option>
          {PLACEMENTS.map((p) => (
            <option key={p} value={p}>{placementLabel(t, p)}</option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/** Shown when the school has no active class yet (a class is required for every new student). */
export function NoClassesAlert() {
  const { t } = useI18n();
  return (
    <Alert tone="warning">
      {t('students.noClasses')} <Link to="/app/settings?tab=classes">{t('students.goToClasses')}</Link>
    </Alert>
  );
}

export function studentFieldsComplete(form) {
  return Boolean(form.registrationDate && form.classId && form.placement);
}
