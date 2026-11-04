import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { id, nowIso, normalizeIc, maskIc, bad, json, today } from './util.js';

const enc = new TextEncoder();
const decoder = new TextDecoder();

/* ------------------------------------------------------------------ */
/* Encoding helpers                                                    */
/* ------------------------------------------------------------------ */
export function bytesToB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function b64url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  return b64ToBytes(s + '='.repeat((4 - (s.length % 4)) % 4));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(value)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ */
/* Passwords (PBKDF2-SHA256)                                           */
/* ------------------------------------------------------------------ */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key,
    256,
  );
  return `pbkdf2$100000$${bytesToB64(salt)}$${bytesToB64(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iter, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'pbkdf2') return false;
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(saltB64), iterations: Number(iter) },
      key,
      256,
    );
    return timingSafeEqual(bytesToB64(bits), hashB64);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Field-level IC encryption (AES-256-GCM)                             */
/* ------------------------------------------------------------------ */
async function icKey(env) {
  const secret = env.IC_KEY || env.JWT_SECRET || 'mduik-development-ic-key';
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptIc(env, value) {
  const digits = normalizeIc(value);
  if (!digits) return { enc: null, hash: null, masked: null };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await icKey(env);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(digits));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return {
    enc: bytesToB64(combined),
    hash: await sha256Hex(`${env.IC_PEPPER || 'mduik'}${digits}`),
    masked: maskIc(digits),
  };
}

export async function decryptIc(env, value) {
  if (!value) return null;
  try {
    const raw = b64ToBytes(value);
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const key = await icKey(env);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return decoder.decode(plain);
  } catch {
    return null;
  }
}

export async function hashIc(env, value) {
  return sha256Hex(`${env.IC_PEPPER || 'mduik'}${normalizeIc(value)}`);
}

/* ------------------------------------------------------------------ */
/* JWT session                                                         */
/* ------------------------------------------------------------------ */
async function hmacKey(env) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(env.JWT_SECRET || 'mduik-development-jwt-secret-change-me'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signToken(env, payload, hours = 10) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    ...payload,
    jti: payload.jti || id('ses'),
    ims: Date.now(), // issue time in ms, used for session revocation
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + hours * 3600,
  };
  const h = b64url(enc.encode(JSON.stringify(header)));
  const p = b64url(enc.encode(JSON.stringify(body)));
  const key = await hmacKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyToken(env, token) {
  try {
    const [h, p, s] = String(token).split('.');
    if (!h || !p || !s) return null;
    const key = await hmacKey(env);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(s), enc.encode(`${h}.${p}`));
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(b64urlDecode(p)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'mduik_session';

export async function setSession(c, user, schoolId) {
  const token = await signToken(c.env, { sub: user.id, sch: schoolId || null });
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: 10 * 3600,
  });
  return token;
}

export function clearSession(c) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/* ------------------------------------------------------------------ */
/* Request auth                                                        */
/* ------------------------------------------------------------------ */
export async function resolveAuth(env, token) {
  if (!token) return null;
  const payload = await verifyToken(env, token);
  if (!payload?.sub) return null;
  const db = env.DB;
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first();
  if (!user || user.status !== 'active') return null;
  if (await isRevoked(env, payload)) return null;
  const { results: allRoles } = await db
    .prepare(
      `SELECT ur.id, ur.school_id, ur.role, s.name AS school_name, s.category, s.status AS school_status
       FROM user_roles ur LEFT JOIN schools s ON s.id = ur.school_id
       WHERE ur.user_id = ? AND ur.status = 'active' AND ur.ended_at IS NULL`,
    )
    .bind(user.id)
    .all();
  const isSuper = allRoles.some((r) => r.role === 'super_admin');
  // Roles at suspended or inactive schools give no access (super admin is unaffected).
  const roles = allRoles.filter((r) => !r.school_id || r.school_status === 'active' || isSuper);
  if (!isSuper && allRoles.length > 0 && roles.length === 0) return null;
  let activeSchool = payload.sch || null;
  if (!isSuper) {
    const schoolIds = [...new Set(roles.map((r) => r.school_id).filter(Boolean))];
    if (!activeSchool || !schoolIds.includes(activeSchool)) activeSchool = schoolIds[0] || null;
  }
  const parent = user.parent_id
    ? await db.prepare('SELECT * FROM parents WHERE id = ?').bind(user.parent_id).first()
    : null;
  const school = activeSchool ? await db.prepare('SELECT * FROM schools WHERE id = ?').bind(activeSchool).first() : null;
  if (!school) activeSchool = null;
  return {
    user,
    roles,
    isSuper,
    jti: payload.jti || null,
    activeSchool,
    school,
    parent,
    roleInSchool: roles.find((r) => r.school_id === activeSchool)?.role || (isSuper ? 'super_admin' : null),
  };
}

export async function authMiddleware(c, next) {
  const token = getCookie(c, SESSION_COOKIE);
  const auth = await resolveAuth(c.env, token);
  if (!auth) return bad('Sesi tamat. Sila log masuk semula. / Session expired. Please sign in.', 401);
  c.set('auth', auth);
  await next();
}

export function requireRoles(...allowed) {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!auth) return bad('Unauthorized', 401);
    if (auth.isSuper) return next();
    if (allowed.length && !allowed.includes(auth.roleInSchool)) {
      return bad('Anda tiada akses untuk tindakan ini. / You do not have access to this action.', 403);
    }
    return next();
  };
}

export function can(auth, capabilities) {
  if (!auth) return false;
  if (auth.isSuper) return true;
  const role = auth.roleInSchool;
  const map = {
    school_admin: ['*'],
    bursar: [
      'finance.read',
      'finance.write',
      'refund.request',
      'refund.approve',
      'adjustment.request',
      'records.read',
      'students.read',
      'reports.finance',
      'notifications.read',
    ],
    teacher: ['interview.view', 'interview.score', 'applications.read', 'notifications.read'],
    parent: ['portal'],
  };
  const caps = map[role] || [];
  return caps.includes('*') || capabilities.some((cap) => caps.includes(cap));
}

export async function recordLoginAttempt(env, identifier, ip, success) {
  await env.DB.prepare('INSERT INTO login_attempts (id, identifier, ip, success, created_at) VALUES (?,?,?,?,?)')
    .bind(id('la'), identifier, ip || '', success ? 1 : 0, nowIso())
    .run();
}

/**
 * Lockout: 5 failures for the same account from one IP, or 20 failures for the
 * same account from any IP, within 15 minutes. Identifiers are lower-cased by
 * the caller so case changes do not reset the counter.
 */
export async function isLockedOut(env, account, ip) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN ip = ? THEN 1 ELSE 0 END) AS from_ip
     FROM login_attempts WHERE identifier = ? AND success = 0 AND created_at > ?`,
  )
    .bind(ip || '', account, since)
    .first();
  return (row?.from_ip || 0) >= 5 || (row?.total || 0) >= 20;
}

/* ------------------------------------------------------------------ */
/* Session revocation                                                  */
/* ------------------------------------------------------------------ */
async function isRevoked(env, payload) {
  const row = await env.DB.prepare(
    'SELECT 1 AS hit FROM session_revocations WHERE (jti IS NOT NULL AND jti = ?) OR (user_id = ? AND not_before > ?) LIMIT 1',
  )
    .bind(payload.jti || '', payload.sub, payload.ims ?? (payload.iat || 0) * 1000)
    .first();
  return Boolean(row);
}

/** End one session (logout). */
export async function revokeSession(env, userId, jti) {
  if (!jti) return;
  await env.DB.prepare('INSERT INTO session_revocations (id, user_id, jti, created_at) VALUES (?,?,?,?)')
    .bind(id('rev'), userId, jti, nowIso())
    .run();
}

/** End every session of a user issued before now (password change, deactivation). */
export async function revokeAllSessions(env, userId) {
  await env.DB.prepare('INSERT INTO session_revocations (id, user_id, not_before, created_at) VALUES (?,?,?,?)')
    .bind(id('rev'), userId, Date.now(), nowIso())
    .run();
}

export function publicUser(auth) {
  return {
    id: auth.user.id,
    name: auth.user.full_name,
    email: auth.user.email,
    language: auth.user.language,
    isSuper: auth.isSuper,
    activeSchool: auth.activeSchool,
    role: auth.roleInSchool,
    schools: auth.roles
      .filter((r) => r.school_id)
      .map((r) => ({ id: r.school_id, name: r.school_name, role: r.role, category: r.category })),
    school: auth.school
      ? {
          id: auth.school.id,
          name: auth.school.name,
          category: auth.school.category,
          monthlyDueDay: auth.school.monthly_due_day,
          regDueDay: auth.school.reg_due_day,
          regDueMonth: auth.school.reg_due_month,
        }
      : null,
    parent: auth.parent ? { id: auth.parent.id, name: auth.parent.full_name } : null,
  };
}

export { hashIc as _hashIc, json as _json, today as _today };
