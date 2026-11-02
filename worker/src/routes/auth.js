import { Hono } from 'hono';
import {
  hashPassword,
  verifyPassword,
  setSession,
  clearSession,
  publicUser,
  recordLoginAttempt,
  isLockedOut,
  hashIc,
  encryptIc,
  decryptIc,
  SESSION_COOKIE,
} from '../lib/auth.js';
import { getCookie } from 'hono/cookie';
import { resolveAuth } from '../lib/auth.js';
import { id, nowIso, readJson, bad, json, normalizeIc } from '../lib/util.js';
import { audit } from '../lib/audit.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  const body = await readJson(c);
  const identifier = String(body.identifier || '').trim();
  const password = String(body.password || '');
  if (!identifier || !password) return bad('Sila masukkan e-mel/IC dan kata laluan. / Enter email/IC and password.');
  const ip = c.req.header('cf-connecting-ip') || '';
  if (await isLockedOut(c.env, `${identifier}|ip|${ip}`)) {
    return bad('Akaun dikunci sementara kerana terlalu banyak percubaan. Cuba lagi dalam 15 minit. / Account temporarily locked. Try again in 15 minutes.', 429);
  }

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(identifier).first();
  if (!user && normalizeIc(identifier)) {
    const icHash = await hashIc(c.env, identifier);
    user = await c.env.DB.prepare('SELECT * FROM users WHERE ic_hash = ?').bind(icHash).first();
  }
  const ok = user ? await verifyPassword(password, user.password_hash) : false;
  await recordLoginAttempt(c.env, `${identifier}|ip|${ip}`, ip, ok);
  if (!ok) return bad('Maklumat log masuk tidak sah. / Invalid login details.', 401);
  if (user.status !== 'active') return bad('Akaun dinyahaktifkan. / Account deactivated.', 403);

  const { results: roles } = await c.env.DB.prepare(
    "SELECT * FROM user_roles WHERE user_id = ? AND status = 'active' AND ended_at IS NULL",
  )
    .bind(user.id)
    .all();
  let schoolId = body.schoolId || null;
  const schoolIds = roles.map((r) => r.school_id).filter(Boolean);
  if (!roles.some((r) => r.role === 'super_admin')) {
    if (!schoolId || !schoolIds.includes(schoolId)) schoolId = schoolIds[0] || null;
  }
  const token = await setSession(c, user, schoolId);
  await c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(nowIso(), user.id).run();
  await c.env.DB.prepare(
    'INSERT INTO audit_logs (id, school_id, actor_id, actor_name, actor_role, action, entity, entity_id, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(id('aud'), schoolId, user.id, user.full_name, roles[0]?.role || 'user', 'login', 'user', user.id, ip, nowIso())
    .run();
  const session = await resolveAuth(c.env, token);
  c.set('auth', session);
  return c.json({ user: publicUser(session) });
});

auth.post('/logout', async (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  c.set('auth', session);
  const unread = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
  )
    .bind(session.user.id)
    .first();
  return json({ user: publicUser(session), unread: unread?.n || 0 });
});

auth.post('/context', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  const body = await readJson(c);
  const schoolId = body.schoolId || null;
  if (!session.isSuper && !session.roles.some((r) => r.school_id === schoolId)) {
    return bad('Anda bukan ahli sekolah ini. / You are not a member of this school.', 403);
  }
  const token = await setSession(c, session.user, schoolId);
  const renewed = await resolveAuth(c.env, token);
  return c.json({ user: publicUser(renewed) });
});

auth.patch('/profile', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  c.set('auth', session);
  const body = await readJson(c);
  const allowed = {};
  if (body.language === 'bm' || body.language === 'en') allowed.language = body.language;
  if (body.fullName) allowed.full_name = String(body.fullName).slice(0, 120);
  if (body.phone !== undefined) allowed.phone = String(body.phone).slice(0, 40);
  if (!Object.keys(allowed).length) return bad('Tiada perubahan. / Nothing to update.');
  const sets = Object.keys(allowed).map((k) => `${k} = ?`).join(', ');
  const before = { full_name: session.user.full_name, language: session.user.language, phone: session.user.phone };
  await c.env.DB.prepare(`UPDATE users SET ${sets} WHERE id = ?`)
    .bind(...Object.values(allowed), session.user.id)
    .run();
  await audit(c, 'update', 'user_profile', session.user.id, { before, after: allowed });
  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user.id).first();
  return json({ user: { ...publicUser(session), language: updated.language, name: updated.full_name } });
});

auth.post('/change-password', async (c) => {
  const session = await resolveAuth(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return bad('Unauthorized', 401);
  c.set('auth', session);
  const body = await readJson(c);
  if (!(await verifyPassword(String(body.currentPassword || ''), session.user.password_hash))) {
    return bad('Kata laluan semasa tidak betul. / Current password is incorrect.', 400);
  }
  if (String(body.newPassword || '').length < 8) {
    return bad('Kata laluan baharu mestilah sekurang-kurangnya 8 aksara. / New password must be at least 8 characters.');
  }
  const hash = await hashPassword(body.newPassword);
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, session.user.id).run();
  await audit(c, 'change_password', 'user', session.user.id);
  return json({ ok: true });
});

auth.post('/forgot', async (c) => {
  const body = await readJson(c);
  const email = String(body.email || '').trim().toLowerCase();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(email).first();
  if (user) {
    const token = id('rst') + id();
    await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(
        `reset:${token}`,
        JSON.stringify({ userId: user.id, expires: Date.now() + 3600 * 1000 }),
      )
      .run();
    const appUrl = c.env.APP_URL || new URL(c.req.url).origin;
    const link = `${appUrl}/reset-password?token=${token}`;
    if (c.env.EMAIL) {
      try {
        await c.env.EMAIL.send({
          to: user.email,
          from: c.env.MAIL_FROM || 'no-reply@mduik.school',
          subject: 'Tetapan semula kata laluan / Password reset',
          text: `Klik pautan ini untuk menetapkan semula kata laluan anda (sah 1 jam): ${link}\n\nClick this link to reset your password (valid 1 hour): ${link}`,
        });
      } catch (err) {
        console.error('reset email failed', err?.message);
      }
    }
    return json({ ok: true, devLink: c.env.EMAIL ? undefined : link });
  }
  return json({ ok: true });
});

auth.post('/reset', async (c) => {
  const body = await readJson(c);
  const token = String(body.token || '');
  const row = await c.env.DB.prepare('SELECT * FROM settings WHERE key = ?').bind(`reset:${token}`).first();
  if (!row) return bad('Pautan tidak sah. / Invalid link.', 400);
  const data = JSON.parse(row.value);
  if (data.expires < Date.now()) return bad('Pautan telah tamat tempoh. / Link has expired.', 400);
  if (String(body.password || '').length < 8) return bad('Kata laluan mestilah sekurang-kurangnya 8 aksara. / Password must be at least 8 characters.');
  const hash = await hashPassword(body.password);
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hash, data.userId).run();
  await c.env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(`reset:${token}`).run();
  return json({ ok: true });
});

export default auth;
