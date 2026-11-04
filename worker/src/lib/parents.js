import { id, nowIso, normalizeIc, bad, json } from './util.js';
import { encryptIc, hashIc, hashPassword } from './auth.js';
import { notify } from './notify.js';

/** Digits only, with a +60 country code folded into the local 0 prefix. */
export function normalizePhone(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = `0${d.slice(2)}`;
  return d.length >= 7 ? d : '';
}

/** Parent fields safe to return to the client (no IC hash or ciphertext). */
export function publicParent(p) {
  if (!p) return null;
  const { ic_hash: _h, ic_enc: _e, phone_norm: _n, ...rest } = p;
  return rest;
}

export async function findParentByIc(env, ic) {
  const digits = normalizeIc(ic);
  if (digits.length < 6) return null;
  // Only the keyed hash is searched; the encrypted IC is never compared.
  const hash = await hashIc(env, digits);
  return env.DB.prepare('SELECT * FROM parents WHERE ic_hash = ?').bind(hash).first();
}

/** Parents who share the email or phone. */
export async function findContactMatches(env, { email, phone, excludeId } = {}) {
  const e = String(email || '').trim().toLowerCase();
  const ph = normalizePhone(phone);
  if (!e && !ph) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM parents WHERE id != ?3 AND ((?1 != '' AND lower(email) = ?1) OR (?2 != '' AND phone_norm = ?2))
     ORDER BY created_at LIMIT 10`,
  )
    .bind(e, ph, excludeId || '')
    .all();
  return results.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    phone: r.phone,
    ic_masked: r.ic_masked,
    status: r.status,
    matchedOn: [
      e && String(r.email || '').toLowerCase() === e ? 'email' : null,
      ph && r.phone_norm === ph ? 'phone' : null,
    ].filter(Boolean),
  }));
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
 *   { parent }            use this existing record (selected, or matched by IC)
 *   { create }            a new record may be created
 *   { conflict }          email/phone already used: the admin must link or create anyway with a reason
 *   { error, status }     invalid input
 *
 * input: { parentId, ic, name, email, phone, address, createAnyway, duplicateReason }
 */
export async function planParent(env, input, { schoolId, requireIc = false } = {}) {
  if (input.parentId) {
    const p = await env.DB.prepare('SELECT * FROM parents WHERE id = ?').bind(input.parentId).first();
    if (!p) return { error: 'not_found', status: 404 };
    if (p.status === 'inactive') return { error: 'inactive', status: 409 };
    // A parent from another school needs proof the admin knows the person:
    // an IC that matches, or the email/phone shown in the duplicate warning.
    if (schoolId && !(await parentInSchool(env, p.id, schoolId)) && (await hasAnyLink(env, p.id))) {
      const icOk = input.ic && p.ic_hash && (await hashIc(env, input.ic)) === p.ic_hash;
      const emailOk = input.email && String(p.email || '').toLowerCase() === String(input.email).trim().toLowerCase();
      const phoneOk = input.phone && p.phone_norm && normalizePhone(input.phone) === p.phone_norm;
      if (!icOk && !emailOk && !phoneOk) return { error: 'not_found', status: 404 };
    }
    return { parent: p };
  }
  const digits = normalizeIc(input.ic);
  if (digits) {
    if (digits.length < 6 || digits.length > 20) return { error: 'ic_invalid', status: 400 };
    const match = await findParentByIc(env, digits);
    if (match) {
      if (match.status === 'inactive') return { error: 'inactive', status: 409 };
      return { parent: match, matchedByIc: true };
    }
  } else if (requireIc) {
    return { error: 'ic_required', status: 400 };
  }
  const name = String(input.name || '').trim();
  if (!name) return { error: 'name_required', status: 400 };
  const matches = await findContactMatches(env, input);
  const reason = String(input.duplicateReason || '').trim();
  if (matches.length && !input.createAnyway) return { conflict: matches, status: 409 };
  if (matches.length && reason.length < 5) return { error: 'reason_required', status: 400, matches };
  return {
    create: {
      name: name.slice(0, 160),
      email: String(input.email || '').trim().slice(0, 160),
      phone: String(input.phone || '').trim().slice(0, 40),
      address: String(input.address || '').slice(0, 500),
      ic: digits || null,
      duplicateReason: matches.length ? reason.slice(0, 500) : null,
      duplicateOf: matches.map((m) => m.id),
    },
  };
}

const MESSAGES = {
  not_found: 'Ibu bapa tidak dijumpai. / Parent not found.',
  inactive: 'Akaun ibu bapa ini tidak aktif. Hubungi Pentadbir Super. / This parent account is inactive. Contact the Super Admin.',
  ic_invalid: 'No. IC ibu bapa tidak sah. / Invalid parent IC number.',
  ic_required: 'No. IC ibu bapa diperlukan. / Parent IC number is required.',
  name_required: 'Nama ibu bapa diperlukan. / Parent name is required.',
  reason_required:
    'Nyatakan sebab untuk mencipta rekod baharu walaupun e-mel atau telefon sudah wujud. / Give a reason for creating a new record when the email or phone already exists.',
  duplicate_contact:
    'E-mel atau telefon ini sudah digunakan oleh ibu bapa lain. Pautkan kepada rekod sedia ada atau cipta juga dengan sebab. / This email or phone is already used by another parent. Link to the existing record or create anyway with a reason.',
};

/** Response for a plan that cannot proceed, or null. */
export function planFailure(plan) {
  if (plan.conflict) {
    return json({ error: MESSAGES.duplicate_contact, code: 'duplicate_contact', matches: plan.conflict }, 409);
  }
  if (plan.error) return bad(MESSAGES[plan.error] || 'Ralat. / Error.', plan.status || 400, { code: plan.error, matches: plan.matches });
  return null;
}

/** Write the planned parent (if new) and return the parent row. */
export async function commitParent(env, plan) {
  if (plan.parent) return plan.parent;
  const d = plan.create;
  const ic = d.ic ? await encryptIc(env, d.ic) : { enc: null, hash: null, masked: null };
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
  await env.DB.prepare(
    'INSERT OR IGNORE INTO parent_students (id, parent_id, student_id, relationship, school_id) VALUES (?,?,?,?,?)',
  )
    .bind(id('ps'), parentId, studentId, relationship || 'guardian', schoolId)
    .run();
}

/**
 * Give the parent a portal login with a parent role at the school. An existing
 * login (same email) is reused. New logins get a random password; the parent
 * sets their own through "Forgot password".
 */
export async function ensureParentLogin(env, parent, schoolId, { appUrl } = {}) {
  let userId = parent.user_id || null;
  let created = false;
  if (!userId) {
    if (!parent.email) return { userId: null, created: false };
    const user = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(parent.email).first();
    if (user) {
      if (user.parent_id && user.parent_id !== parent.id) return { userId: null, created: false };
      userId = user.id;
    } else {
      userId = id('usr');
      const random = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare(
        `INSERT INTO users (id, email, full_name, ic_hash, ic_enc, ic_masked, phone, password_hash, language, status, parent_id, created_at)
         VALUES (?,?,?,NULL,NULL,?,?,?,'bm','active',?,?)`,
      )
        .bind(userId, parent.email, parent.full_name, parent.ic_masked || null, parent.phone || '', await hashPassword(random), parent.id, nowIso())
        .run();
      created = true;
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET parent_id = ? WHERE id = ? AND parent_id IS NULL').bind(parent.id, userId),
      env.DB.prepare('UPDATE parents SET user_id = ? WHERE id = ?').bind(userId, parent.id),
    ]);
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,'parent',?,'active')",
  )
    .bind(id('url'), userId, schoolId, nowIso())
    .run();
  if (created) {
    await notify(env, {
      schoolId,
      userId,
      email: parent.email,
      name: parent.full_name,
      type: 'account_created',
      subject: 'Akaun portal ibu bapa MDUIK / MDUIK parent portal account',
      body: `Akaun portal ibu bapa anda telah dicipta. Di ${appUrl || ''}, pilih "Lupa kata laluan" untuk menetapkan kata laluan.\nYour parent portal account has been created. At ${appUrl || ''}, choose "Forgot password" to set your password.`,
      language: 'bm',
    });
  }
  return { userId, created };
}
