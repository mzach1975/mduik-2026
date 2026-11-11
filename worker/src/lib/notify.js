import { id, nowIso } from './util.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * Create a portal notification and attempt transactional email through the
 * Cloudflare Email Service binding when configured.
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
}) {
  const nid = id('ntf');
  await env.DB.prepare(
    `INSERT INTO notifications
      (id, school_id, user_id, recipient_email, recipient_name, type, subject, body, language, channel, email_status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(nid, schoolId, userId, email, name, type, subject, body, language, channel, email ? 'queued' : 'portal_only', nowIso())
    .run();

  if (email && env.EMAIL) {
    try {
      await env.EMAIL.send({
        to: email,
        from: env.MAIL_FROM || 'no-reply@mduik.school',
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

const T = {
  bm: {
    application_received: 'Permohonan diterima',
    interview_scheduled: 'Temuduga dijadualkan',
    decision: 'Keputusan permohonan',
    waiting_offer: 'Tawaran senarai menunggu',
    invoice_issued: 'Invois baharu',
    payment_received: 'Bayaran diterima',
    receipt_issued: 'Resit dikeluarkan',
    arrears_reminder: 'Peringatan tunggakan',
    tracking_on: 'Pemantauan yuran bulanan dihidupkan',
    tracking_off: 'Pemantauan yuran bulanan dimatikan',
    registration: 'Pendaftaran pelajar',
  },
  en: {
    application_received: 'Application received',
    interview_scheduled: 'Interview scheduled',
    decision: 'Application decision',
    waiting_offer: 'Waiting list offer',
    invoice_issued: 'New invoice',
    payment_received: 'Payment received',
    receipt_issued: 'Receipt issued',
    arrears_reminder: 'Arrears reminder',
    tracking_on: 'Monthly fee tracking switched on',
    tracking_off: 'Monthly fee tracking switched off',
    registration: 'Student registration',
  },
};

export function subjectFor(type, lang = 'bm') {
  return (T[lang] || T.bm)[type] || (lang === 'en' ? 'Notification' : 'Pemberitahuan');
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
