import { id, nowIso, bad, json, normalizeIc, validIc } from './util.js';
import { hashIc, hashPassword, INITIAL_ID_PASSWORD } from './auth.js';
import { notify } from './notify.js';

/**
 * Rules shared by parents and teachers: one record per person found by the
 * keyed IC / Passport No. hash, a warning when the email or phone belongs to
 * another parent or teacher, and one login per person.
 */

/** Digits only, with a +60 country code folded into the local 0 prefix. */
export function normalizePhone(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('60')) d = `0${d.slice(2)}`;
  return d.length >= 7 ? d : '';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parents and teachers who share the email or phone (people with the same IC are the same person, so they are left out). */
export async function findContactMatches(env, { email, phone, excludeParentId, excludeTeacherId, excludeIcHash } = {}) {
  const e = String(email || '').trim().toLowerCase();
  const ph = normalizePhone(phone);
  if (!e && !ph) return [];
  const where = `((?1 != '' AND lower(email) = ?1) OR (?2 != '' AND phone_norm = ?2)) AND (?5 = '' OR ic_hash IS NULL OR ic_hash != ?5)`;
  const { results } = await env.DB.prepare(
    `SELECT 'parent' AS kind, id, full_name, email, phone, phone_norm, ic_masked, status, created_at FROM parents WHERE id != ?3 AND ${where}
     UNION ALL
     SELECT 'teacher' AS kind, id, full_name, email, phone, phone_norm, ic_masked, status, created_at FROM teachers WHERE id != ?4 AND ${where}
     ORDER BY created_at LIMIT 10`,
  )
    .bind(e, ph, excludeParentId || '', excludeTeacherId || '', excludeIcHash || '')
    .all();
  return results.map((r) => ({
    kind: r.kind,
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

/** Check the four mandatory fields of a new parent or teacher. Returns an error code or null. */
export function checkNewPerson(input) {
  if (!String(input.name || '').trim()) return 'name_required';
  if (!normalizeIc(input.ic)) return 'ic_required';
  if (!validIc(input.ic)) return 'ic_invalid';
  const email = String(input.email || '').trim();
  if (!email) return 'email_required';
  if (!EMAIL_RE.test(email)) return 'email_invalid';
  if (!String(input.phone || '').trim()) return 'phone_required';
  if (!normalizePhone(input.phone)) return 'phone_invalid';
  return null;
}

/** The email already signs in a different person (another IC), so it cannot be this person's login. */
export async function loginEmailTaken(env, email, icHash) {
  if (!email) return false;
  const user = await env.DB.prepare('SELECT id, ic_hash FROM users WHERE lower(email) = lower(?)').bind(email).first();
  if (!user) return false;
  const sameIc = icHash ? await env.DB.prepare('SELECT id FROM users WHERE ic_hash = ?').bind(icHash).first() : null;
  if (sameIc) return false; // the IC login is reused, the email is not needed
  return Boolean(user.ic_hash && user.ic_hash !== icHash);
}

/** Proof that an admin knows a person from another school: matching IC, email or phone. */
export async function knowsPerson(env, person, input) {
  const icOk = input.ic && person.ic_hash && (await hashIc(env, input.ic)) === person.ic_hash;
  const emailOk = input.email && String(person.email || '').toLowerCase() === String(input.email).trim().toLowerCase();
  const phoneOk = input.phone && person.phone_norm && normalizePhone(input.phone) === person.phone_norm;
  return Boolean(icOk || emailOk || phoneOk);
}

const WHO = { parent: ['Ibu bapa', 'Parent'], teacher: ['Asatizah', 'Asatizah'] };

export function message(code, kind = 'parent') {
  const [bm, en] = WHO[kind] || WHO.parent;
  const m = {
    not_found: `${bm} tidak dijumpai. / ${en} not found.`,
    inactive: `Akaun ${bm.toLowerCase()} ini tidak aktif. Hubungi Pentadbir Super. / This ${en.toLowerCase()} account is inactive. Contact the Super Admin.`,
    ic_invalid: 'No. IC / Pasport tidak sah (5–20 huruf atau angka). / Invalid IC / Passport No. (5–20 letters or digits).',
    ic_required: 'No. IC / Pasport diperlukan. / IC / Passport No. is required.',
    name_required: 'Nama diperlukan. / Name is required.',
    email_required: 'E-mel diperlukan. / Email is required.',
    email_invalid: 'E-mel tidak sah. / Invalid email.',
    phone_required: 'No. telefon diperlukan. / Phone is required.',
    phone_invalid: 'No. telefon tidak sah. / Invalid phone number.',
    login_email_taken:
      'E-mel ini sudah digunakan untuk log masuk orang lain. Gunakan e-mel lain. / This email already signs in another person. Use a different email.',
    reason_required:
      'Nyatakan sebab (sekurang-kurangnya 5 aksara) untuk mencipta rekod baharu walaupun e-mel atau telefon sudah wujud. / Give a reason (at least 5 characters) for creating a new record when the email or phone already exists.',
    duplicate_contact:
      'E-mel atau telefon ini sudah digunakan oleh ibu bapa atau asatizah lain. Gunakan rekod sedia ada atau cipta juga dengan sebab. / This email or phone is already used by another parent or asatizah. Use the existing record or create anyway with a reason.',
    already_member: 'Asatizah ini sudah berdaftar di sekolah ini. / This asatizah is already registered at this school.',
  };
  return m[code] || 'Ralat. / Error.';
}

/** Response for a plan that cannot proceed, or null. */
export function planFailure(plan, kind = 'parent') {
  if (plan.conflict) {
    return json({ error: message('duplicate_contact', kind), code: 'duplicate_contact', matches: plan.conflict }, 409);
  }
  if (plan.error) return bad(message(plan.error, kind), plan.status || 400, { code: plan.error, matches: plan.matches });
  return null;
}

async function isAdminUser(env, userId) {
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM user_roles WHERE user_id = ? AND role IN ('super_admin','school_admin') LIMIT 1",
  )
    .bind(userId)
    .first();
  return Boolean(row);
}

/** Welcome email text. It states the login ID (email, or the masked IC) and never the password. */
export function welcomeMessage({ email, icMasked, appUrl, initial }) {
  if (!initial) {
    return {
      subject: 'Akaun MDUIK dicipta / MDUIK account created',
      body: `Akaun MDUIK anda telah dicipta. ID log masuk: ${email}. Di ${appUrl}, pilih "Lupa kata laluan" untuk menetapkan kata laluan.\nYour MDUIK account has been created. Login ID: ${email}. At ${appUrl}, choose "Forgot password" to set your password.`,
    };
  }
  const id = icMasked ? ` atau No. IC / Pasport anda (${icMasked})` : '';
  const idEn = icMasked ? ` or your IC / Passport No. (${icMasked})` : '';
  return {
    subject: 'Akaun MDUIK dicipta / MDUIK account created',
    body:
      `Akaun MDUIK anda telah dicipta.\nID log masuk: ${email}${id}.\nKata laluan pertama ialah No. IC / Pasport anda tanpa ruang atau tanda sempang. Anda perlu menukarnya semasa log masuk pertama.\nLog masuk di ${appUrl}.\n\n` +
      `Your MDUIK account has been created.\nLogin ID: ${email}${idEn}.\nYour first password is your IC / Passport No. without spaces or hyphens. You must change it when you first sign in.\nSign in at ${appUrl}.`,
  };
}

/**
 * Give a parent or teacher a login with a role at the school. One login per
 * person: an existing login with the same IC hash (or the same email with no
 * other IC) is reused. A new login signs in with the email or the IC / Passport
 * No., starts with the IC as its password and must change it on first login.
 */
export async function ensureLogin(env, { kind, person, schoolId, appUrl = '' }) {
  const db = env.DB;
  let userId = person.user_id || null;
  let created = false;
  if (!userId) {
    let user = person.ic_hash ? await db.prepare('SELECT * FROM users WHERE ic_hash = ?').bind(person.ic_hash).first() : null;
    if (!user && person.email) {
      const byEmail = await db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(person.email).first();
      if (byEmail) {
        if (byEmail.ic_hash && byEmail.ic_hash !== person.ic_hash) return { userId: null, created: false, error: 'login_email_taken' };
        if (kind === 'parent' && byEmail.parent_id && byEmail.parent_id !== person.id) {
          return { userId: null, created: false, error: 'login_email_taken' };
        }
        user = byEmail;
        // The IC becomes a second login ID, except on admin logins (they keep email login only).
        if (!byEmail.ic_hash && person.ic_hash && !(await isAdminUser(env, byEmail.id))) {
          await db.prepare('UPDATE users SET ic_hash = ?, ic_enc = ?, ic_masked = ? WHERE id = ? AND ic_hash IS NULL')
            .bind(person.ic_hash, person.ic_enc || null, person.ic_masked || null, byEmail.id)
            .run();
        }
      }
    }
    if (user) {
      userId = user.id;
    } else {
      if (!person.email) return { userId: null, created: false, error: 'email_required' };
      userId = id('usr');
      const initial = Boolean(person.ic_hash);
      let passwordHash = INITIAL_ID_PASSWORD;
      if (!initial) {
        // Older records without an IC get a random password and use "Forgot password".
        const random = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
        passwordHash = await hashPassword(random);
      }
      await db.prepare(
        `INSERT INTO users (id, email, full_name, ic_hash, ic_enc, ic_masked, phone, password_hash, must_change_password, language, status, parent_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,'bm','active',?,?)`,
      )
        .bind(
          userId,
          person.email,
          person.full_name,
          person.ic_hash || null,
          person.ic_enc || null,
          person.ic_masked || null,
          person.phone || '',
          passwordHash,
          initial ? 1 : 0,
          kind === 'parent' ? person.id : null,
          nowIso(),
        )
        .run();
      created = true;
    }
    const link =
      kind === 'parent'
        ? [
            db.prepare('UPDATE users SET parent_id = ? WHERE id = ? AND parent_id IS NULL').bind(person.id, userId),
            db.prepare('UPDATE parents SET user_id = ? WHERE id = ?').bind(userId, person.id),
          ]
        : [db.prepare('UPDATE teachers SET user_id = ? WHERE id = ?').bind(userId, person.id)];
    await db.batch(link);
  }
  const role = kind === 'parent' ? 'parent' : 'teacher';
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,?,?,'active')")
      .bind(id('url'), userId, schoolId, role, nowIso()),
    db.prepare("UPDATE user_roles SET status = 'active', ended_at = NULL WHERE user_id = ? AND school_id = ? AND role = ?")
      .bind(userId, schoolId, role),
  ]);
  if (created) {
    const msg = welcomeMessage({ email: person.email, icMasked: person.ic_masked, appUrl, initial: Boolean(person.ic_hash) });
    await notify(env, { schoolId, userId, email: person.email, name: person.full_name, type: 'account_created', ...msg, language: 'bm' });
  }
  return { userId, created };
}
