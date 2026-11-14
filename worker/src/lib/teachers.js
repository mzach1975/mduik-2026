import { id, nowIso, normalizeIc, validIc, maskIc } from './util.js';
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

/**
 * A teacher has one record and one login across schools. Each school the
 * teacher works at is a row in teacher_schools (the membership).
 */

export function publicTeacher(t) {
  if (!t) return null;
  const { ic_hash: _h, ic_enc: _e, phone_norm: _n, ...rest } = t;
  return rest;
}

/**
 * Teacher by IC / Passport No. Teachers created before the IC was mandatory
 * have no ic_hash on the teacher row but their login holds it, so the login is
 * the fallback (CR-PR 2026-11-14 PR-2); the teacher row is then backfilled so
 * the next search finds it directly.
 */
export async function findTeacherByIc(env, ic) {
  if (!validIc(ic)) return null;
  const hash = await hashIc(env, ic);
  const direct = await env.DB.prepare('SELECT * FROM teachers WHERE ic_hash = ?').bind(hash).first();
  if (direct) return direct;
  const viaLogin = await env.DB.prepare(
    `SELECT t.* FROM teachers t JOIN users u ON u.id = t.user_id
     WHERE u.ic_hash = ? AND t.ic_hash IS NULL ORDER BY t.created_at LIMIT 1`,
  )
    .bind(hash)
    .first();
  if (!viaLogin) return null;
  const { enc } = await encryptIc(env, ic);
  await env.DB.prepare('UPDATE teachers SET ic_hash = ?, ic_enc = COALESCE(ic_enc, ?), ic_masked = ? WHERE id = ? AND ic_hash IS NULL')
    .bind(hash, enc, maskIc(ic), viaLogin.id)
    .run();
  return { ...viaLogin, ic_hash: hash, ic_masked: maskIc(ic) };
}

export async function membership(env, teacherId, schoolId) {
  return env.DB.prepare('SELECT * FROM teacher_schools WHERE teacher_id = ? AND school_id = ?').bind(teacherId, schoolId).first();
}

export async function teacherSchools(env, teacherId) {
  const { results } = await env.DB.prepare(
    `SELECT ts.school_id, ts.status, s.name AS school_name FROM teacher_schools ts JOIN schools s ON s.id = ts.school_id
     WHERE ts.teacher_id = ? ORDER BY s.name`,
  )
    .bind(teacherId)
    .all();
  return results;
}

/**
 * Same shape as planParent: { teacher } | { create } | { conflict } | { error }.
 * input: { teacherId, ic, name, email, phone, createAnyway, duplicateReason }
 */
export async function planTeacher(env, input, { schoolId } = {}) {
  if (input.teacherId) {
    const t = await env.DB.prepare('SELECT * FROM teachers WHERE id = ?').bind(input.teacherId).first();
    if (!t) return { error: 'not_found', status: 404 };
    // A teacher from another school is only offered after an IC search or the duplicate warning.
    if (schoolId && !(await membership(env, t.id, schoolId)) && !(await knowsPerson(env, t, input))) {
      return { error: 'not_found', status: 404 };
    }
    return { teacher: t };
  }
  if (normalizeIc(input.ic)) {
    if (!validIc(input.ic)) return { error: 'ic_invalid', status: 400 };
    const match = await findTeacherByIc(env, input.ic);
    if (match) return { teacher: match, matchedByIc: true };
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
      ic: normalizeIc(input.ic),
      duplicateReason: matches.length ? reason.slice(0, 500) : null,
      duplicateOf: matches.map((m) => `${m.kind}:${m.id}`),
    },
  };
}

export function teacherPlanFailure(plan) {
  return personPlanFailure(plan, 'teacher');
}

export async function commitTeacher(env, plan, schoolId) {
  if (plan.teacher) return plan.teacher;
  const d = plan.create;
  const ic = await encryptIc(env, d.ic);
  const teacherId = id('tch');
  try {
    await env.DB.prepare(
      `INSERT INTO teachers (id, school_id, full_name, email, phone, phone_norm, ic_hash, ic_enc, ic_masked, duplicate_reason, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'active',?)`,
    )
      .bind(teacherId, schoolId, d.name, d.email, d.phone, normalizePhone(d.phone), ic.hash, ic.enc, ic.masked, d.duplicateReason, nowIso())
      .run();
  } catch (err) {
    if (/unique/i.test(String(err?.message))) {
      const existing = await env.DB.prepare('SELECT * FROM teachers WHERE ic_hash = ?').bind(ic.hash).first();
      if (existing) return existing;
    }
    throw err;
  }
  return env.DB.prepare('SELECT * FROM teachers WHERE id = ?').bind(teacherId).first();
}

/** Add (or reactivate) the teacher's membership at a school. */
export async function addMembership(env, teacherId, schoolId) {
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO teacher_schools (id, teacher_id, school_id, status, created_at) VALUES (?,?,?,'active',?)")
      .bind(id('tsm'), teacherId, schoolId, nowIso()),
    env.DB.prepare("UPDATE teacher_schools SET status = 'active' WHERE teacher_id = ? AND school_id = ?").bind(teacherId, schoolId),
  ]);
}

/**
 * Create a teacher (or add an existing one to the school) with a login.
 * Returns { response } on failure, else { teacher, created, added, login }.
 */
export async function registerTeacher(env, input, { schoolId, appUrl }) {
  const plan = await planTeacher(env, input, { schoolId });
  const failure = teacherPlanFailure(plan);
  if (failure) return { response: failure };
  if (plan.teacher) {
    const m = await membership(env, plan.teacher.id, schoolId);
    if (m?.status === 'active') return { response: teacherPlanFailure({ error: 'already_member', status: 409 }) };
  }
  const teacher = await commitTeacher(env, plan, schoolId);
  await addMembership(env, teacher.id, schoolId);
  const login = await ensureLogin(env, { kind: 'teacher', person: teacher, schoolId, appUrl });
  return { teacher, plan, created: !!plan.create, login };
}
