import { bad, today } from './util.js';

/** CR-PR 2026-11-18: placement values (labels come from the locale files). */
export const PLACEMENTS = ['boarding', 'day', 'temp_boarding'];

const PLACEMENT_ALIASES = {
  boarding: 'boarding',
  asrama: 'boarding',
  day: 'day',
  harian: 'day',
  temp_boarding: 'temp_boarding',
  'temporary boarding': 'temp_boarding',
  'asrama sementara': 'temp_boarding',
};

/** Placement key from a key or a BM/EN label (CSV import); '' when unknown. */
export function placementKey(value) {
  const v = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return PLACEMENT_ALIASES[v] || PLACEMENT_ALIASES[v.replace(/ /g, '_')] || '';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** '' when valid, else an error code. Registration date: YYYY-MM-DD, not in the future. */
export function registrationDateError(value) {
  const v = String(value || '');
  if (!v) return 'registration_date_required';
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return 'registration_date_invalid';
  if (v > today()) return 'registration_date_future';
  return '';
}

const MESSAGES = {
  registration_date_required: 'Tarikh pendaftaran diperlukan. / Registration date is required.',
  registration_date_invalid: 'Tarikh pendaftaran tidak sah. / Invalid registration date.',
  registration_date_future: 'Tarikh pendaftaran tidak boleh pada masa hadapan. / Registration date cannot be in the future.',
  class_required: 'Kelas diperlukan. / Class is required.',
  class_invalid: 'Kelas tidak sah atau tidak aktif. / Invalid or inactive class.',
  placement_required: 'Penempatan diperlukan. / Placement is required.',
  placement_invalid: 'Penempatan tidak sah. / Invalid placement.',
};

export function studentFieldMessage(code) {
  return MESSAGES[code] || code;
}

/** An active class of the school, by id. */
export function activeClass(env, schoolId, classId) {
  if (!classId) return null;
  return env.DB.prepare("SELECT id, name FROM classes WHERE id = ? AND school_id = ? AND status = 'active'").bind(classId, schoolId).first();
}

/** An active class of the school, by name (case-insensitive; CSV import). */
export function activeClassByName(env, schoolId, name) {
  if (!name) return null;
  return env.DB.prepare("SELECT id, name FROM classes WHERE school_id = ? AND lower(name) = lower(?) AND status = 'active'")
    .bind(schoolId, String(name).trim())
    .first();
}

/**
 * Validates registration date, class and placement for a new student.
 * Returns { error } (a Response) or { values: { registration_date, class_id, class_name, placement } }.
 */
export async function newStudentFields(env, schoolId, body, { defaultDate = today() } = {}) {
  const date = body.registrationDate || defaultDate;
  const dateErr = registrationDateError(date);
  if (dateErr) return { error: bad(MESSAGES[dateErr], 400, { code: dateErr }) };
  if (!body.classId) return { error: bad(MESSAGES.class_required, 400, { code: 'class_required' }) };
  const cls = await activeClass(env, schoolId, body.classId);
  if (!cls) return { error: bad(MESSAGES.class_invalid, 400, { code: 'class_invalid' }) };
  if (!body.placement) return { error: bad(MESSAGES.placement_required, 400, { code: 'placement_required' }) };
  if (!PLACEMENTS.includes(body.placement)) return { error: bad(MESSAGES.placement_invalid, 400, { code: 'placement_invalid' }) };
  return { values: { registration_date: date, class_id: cls.id, class_name: cls.name, placement: body.placement } };
}
