import { id, nowIso } from './util.js';
import { getTemplate, renderTemplate } from './templates.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * Create a portal notification and attempt transactional email through the
 * Cloudflare Email Service binding when configured. With `template` the
 * subject and body come from the global email template (lib/templates.js) and
 * `vars`; the type defaults to the template key. A template switched off stores the portal notification but sends no
 * email (email_status 'disabled').
 */
export async function notify(env, {
  schoolId = null,
  userId = null,
  email = null,
  name = '',
  type,
  subject,
  body,
  language = 'bm',
  channel = 'portal',
  html = null,
  template = null,
  vars = {},
}) {
  let emailOn = true;
  if (template) {
    const tpl = await getTemplate(env.DB, template);
    if (tpl) {
      ({ subject, body } = renderTemplate(tpl, { name, ...vars }));
      emailOn = tpl.enabled;
    }
  }
  const nid = id('ntf');
  await env.DB.prepare(
    `INSERT INTO notifications
      (id, school_id, user_id, recipient_email, recipient_name, type, subject, body, language, channel, email_status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(nid, schoolId, userId, email, name, type || template, subject, body, language, channel, email ? (emailOn ? 'queued' : 'disabled') : 'portal_only', nowIso())
    .run();

  if (email && emailOn && env.EMAIL) {
    try {
      await env.EMAIL.send({
        to: email,
        from: env.MAIL_FROM || 'no_reply@mduik.org',
        subject,
        text: body,
        html: html || `<div style="font-family:Arial,sans-serif;line-height:1.6">${body
          .split('\n')
          .map((l) => `<p>${escapeHtml(l)}</p>`)
          .join('')}</div>`,
      });
      await env.DB.prepare("UPDATE notifications SET email_status = 'sent' WHERE id = ?").bind(nid).run();
    } catch (err) {
      console.error('email send failed', err?.message || err);
      await env.DB.prepare("UPDATE notifications SET email_status = 'failed' WHERE id = ?").bind(nid).run();
    }
  }
  return nid;
}

/** Send a notification to every active user holding one of the given roles in a school. */
export async function notifyRoles(env, schoolId, roles, payload) {
  const placeholders = roles.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT u.id, u.email, u.full_name, u.language
     FROM users u JOIN user_roles ur ON ur.user_id = u.id
     WHERE ur.school_id = ? AND ur.role IN (${placeholders}) AND ur.status = 'active' AND u.status = 'active'`,
  )
    .bind(schoolId, ...roles)
    .all();
  for (const u of results) {
    await notify(env, {
      schoolId,
      userId: u.id,
      email: u.email,
      name: u.full_name,
      language: u.language || 'bm',
      ...payload,
    });
  }
}

export async function notifyParentsOfStudent(env, studentId, payload) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.full_name, p.email, p.user_id, u.language, u.email AS user_email
     FROM parents p
     JOIN parent_students ps ON ps.parent_id = p.id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE ps.student_id = ?`,
  )
    .bind(studentId)
    .all();
  for (const p of results) {
    await notify(env, {
      schoolId: payload.schoolId,
      userId: p.user_id,
      email: p.user_email || p.email,
      name: p.full_name,
      language: p.language || 'bm',
      ...payload,
    });
  }
  return results.length;
}
