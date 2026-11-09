import { id, nowIso, normalizeIc, validIc } from './util.js';
import { encryptIc, hashIc } from './auth.js';
import {
  normalizePhone,
  findContactMatches,
  checkNewPerson,
  loginEmailTaken,
  knowsPerson,
  planFailure as personPlanFailure,
  ensureLogin,
} from './people.js';

export { normalizePhone, findContactMatches };

/** Parent fields safe to return to the client (no IC hash or ciphertext). */
export function publicParent(p) {
  if (!p) return null;
  const { ic_hash: _h, ic_enc: _e, phone_norm: _n, ...rest } = p;
  return rest;
}

export async function findParentByIc(env, ic) {
  if (!validIc(ic)) return null;
  // Only the keyed hash is searched; the encrypted value is never compared.
  const hash = await hashIc(env, ic);
  return env.DB.prepare('SELECT * FROM parents WHERE ic_hash = ?').bind(hash).first();
}

/** True when the parent has at least one linked student in the school. */
export async function parentInSchool(env, parentId, schoolId) {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM parent_students ps JOIN students s ON s.id = ps.student_id
     WHERE ps.parent_id = ? AND s.school_id = ? LIMIT 1`,
  )
    .bind(parentId, schoolId)
    .first();
  return Boolean(row);
}

async function hasAnyLink(env, parentId) {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM parent_students WHERE parent_id = ? LIMIT 1').bind(parentId).first();
  return Boolean(row);
}

/**
 * Decide which parent record a form refers to, without writing anything.
 * Returns one of:
 *   { parent }            use this existing record (selected, or matched by IC / Passport No.)
 *   { create }            a new record may be created
 *   { conflict }          email/phone already used: the admin must use the existing record or create anyway with a reason
 *   { error, status }     invalid input
 *
 * input: { parentId, ic, name, email, phone, address, createAnyway, duplicateReason }
 * A new parent needs name, IC / Passport No., email and phone.
 */
export async function planParent(env, input, { schoolId } = {}) {
  if (input.parentId) {
    const p = await env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(input.parentId).first();
    if (!p) return { error: 'not_found', status: 404 };
    if (p.status === 'inactive') return { error: 'inactive', status: 409 };
    // A parent from another school needs proof the admin knows the person:
    // an IC that matches, or the email/phone shown in the duplicate warning.
    if (schoolId && !(await parentInSchool(env, p.id, schoolId)) && (await hasAnyLink(env, p.id))) {
      if (!(await knowsPerson(env, p, input))) return { error: 'not_found', status: 404 };
    }
    return { parent: p };
  }
  if (normalizeIc(input.ic)) {
    if (!validIc(input.ic)) return { error: 'ic_invalid', status: 400 };
    const match = await findParentByIc(env, input.ic);
    if (match) {
      if (match.status === 'inactive') return { error: 'inactive', status: 409 };
      return { parent: match, matchedByIc: true };
    }
  }
  const invalid = checkNewPerson(input);
  if (invalid) return { error: invalid, status: 400 };
  const icHash = await hashIc(env, input.ic);
  const matches = await findContactMatches(env, { email: input.email, phone: input.phone, excludeIcHash: icHash });
  const reason = String(input.duplicateReason || '').trim();
  if (matches.length && !input.createAnyway) return { conflict: matches, status: 409 };
  if (matches.length && reason.length < 5) return { error: 'reason_required', status: 400, matches };
  // Checked after the warning, so "use existing" is still offered for a shared email.
  if (await loginEmailTaken(env, String(input.email).trim(), icHash)) return { error: 'login_email_taken', status: 409 };
  return {
    create: {
      name: String(input.name).trim().slice(0, 160),
      email: String(input.email).trim().slice(0, 160),
      phone: String(input.phone).trim().slice(0, 40),
      address: String(input.address || '').slice(0, 500),
      ic: normalizeIc(input.ic),
      duplicateReason: matches.length ? reason.slice(0, 500) : null,
      duplicateOf: matches.map((m) => `${m.kind}:${m.id}`),
    },
  };
}

export function planFailure(plan) {
  return personPlanFailure(plan, 'parent');
}

/** Write the planned parent (if new) and return the parent row. */
export async function commitParent(env, plan) {
  if (plan.parent) return plan.parent;
  const d = plan.create;
  const ic = await encryptIc(env, d.ic);
  const parentId = id('par');
  try {
    await env.DB.prepare(
      `INSERT INTO parents (id, full_name, email, phone, phone_norm, ic_hash, ic_enc, ic_masked, address, status, duplicate_reason, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,'active',?,?)`,
    )
      .bind(parentId, d.name, d.email, d.phone, normalizePhone(d.phone), ic.hash, ic.enc, ic.masked, d.address, d.duplicateReason, nowIso())
      .run();
  } catch (err) {
    // Two forms raced on the same IC: use the record that won.
    if (ic.hash && /unique/i.test(String(err?.message))) {
      const existing = await env.DB.prepare('SELECT * FROM parents WHERE ic_hash = ?').bind(ic.hash).first();
      if (existing) return existing;
    }
    throw err;
  }
  return env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(parentId).first();
}

/** Link a parent to a student, recording the student's school on the link. */
export async function linkParentToStudent(env, parentId, studentId, schoolId, relationship = 'guardian') {
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO parent_students (id, parent_id, student_id, relationship, school_id) VALUES (?,?,?,?,?)',
  )
    .bind(id('ps'), parentId, studentId, relationship || 'guardian', schoolId)
    .run();
  return Boolean(res?.meta?.changes);
}

/**
 * Add parent form (and Users with role parent): use the parent found by IC /
 * Passport No. or create a new one, link the chosen children and make sure the
 * parent has a login. Returns { response } on failure.
 */
export async function registerParent(env, input, { schoolId, appUrl, studentIds = [], relationship } = {}) {
  const plan = await planParent(env, input, { schoolId });
  const failure = planFailure(plan);
  if (failure) return { response: failure };
  const parent = await commitParent(env, plan);
  for (const sid of studentIds) await linkParentToStudent(env, parent.id, sid, schoolId, relationship);
  const login = await ensureParentLogin(env, parent, schoolId, { appUrl });
  return { parent, plan, login };
}

/** Portal login for the parent with a parent role at the school (see ensureLogin). */
export async function ensureParentLogin(env, parent, schoolId, { appUrl } = {}) {
  return ensureLogin(env, { kind: 'parent', person: parent, schoolId, appUrl });
}
