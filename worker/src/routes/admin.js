import { Hono } from 'hono';
import { authMiddleware, requireRoles, encryptIc, decryptIc, hashIc } from '../lib/auth.js';
import {
  id,
  nowIso,
  today,
  readJson,
  bad,
  json,
  parseCsv,
  parseMoney,
  toCsv,
  downloadHeaders,
  pageParams,
  pagingMeta,
  yearOf,
  monthOf,
  normalizeIc,
  validIc,
} from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { planParent, commitParent, linkParentToStudent, ensureParentLogin } from '../lib/parents.js';
import { findContactMatches, checkNewPerson, message, ensureLogin } from '../lib/people.js';
import { planTeacher, commitTeacher, addMembership } from '../lib/teachers.js';
import { flagRetentionRecords, runDaily, createInvoice, dueDateFor } from '../lib/finance.js';
import { notify } from '../lib/notify.js';

const admin = new Hono();
admin.use('*', authMiddleware);

/* --------------------------- Notifications --------------------------- */
admin.get('/notifications', async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(auth.user.id)
    .all();
  return json({ notifications: results });
});

admin.post('/notifications/:id/read', async (c) => {
  const auth = c.get('auth');
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?')
    .bind(nowIso(), c.req.param('id'), auth.user.id)
    .run();
  return json({ ok: true });
});

admin.post('/notifications/read-all', async (c) => {
  const auth = c.get('auth');
  await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .bind(nowIso(), auth.user.id)
    .run();
  return json({ ok: true });
});

admin.get('/notifications/outbox', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE school_id = ? ORDER BY created_at DESC LIMIT 200',
  )
    .bind(auth.activeSchool)
    .all();
  return json({ notifications: results });
});

/* ----------------------------- Announcements ------------------------- */
function superOnly(c) {
  const auth = c.get('auth');
  if (!auth?.isSuper) return bad('Hanya Super Admin boleh mengurus pengumuman. / Only a Super Admin can manage announcements.', 403);
  return null;
}

function cleanAnnouncement(input, existing = {}) {
  const pick = (key, fallback = '') => String(input[key] ?? existing[key] ?? fallback).trim();
  const titleBm = pick('title_bm').slice(0, 180);
  const titleEn = pick('title_en').slice(0, 180);
  const bodyBm = pick('body_bm').slice(0, 4000);
  const bodyEn = pick('body_en').slice(0, 4000);
  const category = ['general', 'admission', 'event', 'reminder'].includes(input.category)
    ? input.category
    : (existing.category || 'general');
  const status = ['draft', 'published', 'archived'].includes(input.status)
    ? input.status
    : (existing.status || 'draft');
  const startsAt = input.starts_at !== undefined
    ? (input.starts_at ? String(input.starts_at).slice(0, 10) : null)
    : (existing.starts_at || null);
  const endsAt = input.ends_at !== undefined
    ? (input.ends_at ? String(input.ends_at).slice(0, 10) : null)
    : (existing.ends_at || null);
  const linkUrl = input.link_url !== undefined ? (String(input.link_url).trim().slice(0, 500) || null) : (existing.link_url || null);
  const linkLabelBm = input.link_label_bm !== undefined
    ? String(input.link_label_bm).trim().slice(0, 80)
    : (existing.link_label_bm || '');
  const linkLabelEn = input.link_label_en !== undefined
    ? String(input.link_label_en).trim().slice(0, 80)
    : (existing.link_label_en || '');
  const isPinned = input.is_pinned === undefined ? Number(existing.is_pinned || 0) : (input.is_pinned ? 1 : 0);

  if (!titleBm) return { error: 'Tajuk Bahasa Melayu diperlukan. / Malay title is required.' };
  if (!bodyBm) return { error: 'Kandungan Bahasa Melayu diperlukan. / Malay body is required.' };
  if (startsAt && endsAt && endsAt < startsAt) return { error: 'Tarikh tamat mesti selepas tarikh mula. / End date must be after the start date.' };
  if (linkUrl && !/^(https?:\/\/|\/)/i.test(linkUrl)) return { error: 'Pautan mesti bermula dengan http(s):// atau /. / Link must start with http(s):// or /.' };

  return {
    value: {
      title_bm: titleBm,
      title_en: titleEn || null,
      body_bm: bodyBm,
      body_en: bodyEn || null,
      category,
      status,
      starts_at: startsAt,
      ends_at: endsAt,
      link_url: linkUrl,
      link_label_bm: linkLabelBm || null,
      link_label_en: linkLabelEn || null,
      is_pinned: isPinned,
    },
  };
}

admin.get('/announcements', (c) => {
  const denied = superOnly(c);
  if (denied) return denied;
  return c.env.DB.prepare('SELECT * FROM announcements ORDER BY is_pinned DESC, created_at DESC')
    .all()
    .then(({ results }) => json({ announcements: results }));
});

admin.post('/announcements', async (c) => {
  const denied = superOnly(c);
  if (denied) return denied;
  const auth = c.get('auth');
  const body = await readJson(c);
  const cleaned = cleanAnnouncement(body);
  if (cleaned.error) return bad(cleaned.error);
  const announcementId = id('ann');
  const now = nowIso();
  const a = cleaned.value;
  await c.env.DB.prepare(
    `INSERT INTO announcements (id, title_bm, title_en, body_bm, body_en, category, status, link_url,
      link_label_bm, link_label_en, starts_at, ends_at, is_pinned, created_by, updated_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      announcementId, a.title_bm, a.title_en, a.body_bm, a.body_en, a.category, a.status, a.link_url,
      a.link_label_bm, a.link_label_en, a.starts_at, a.ends_at, a.is_pinned, auth.user.id, auth.user.id, now, now,
    )
    .run();
  await audit(c, 'create', 'announcement', announcementId, { after: a });
  return json({ id: announcementId }, 201);
});

admin.patch('/announcements/:id', async (c) => {
  const denied = superOnly(c);
  if (denied) return denied;
  const auth = c.get('auth');
  const existing = await c.env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(c.req.param('id')).first();
  if (!existing) return bad('Pengumuman tidak dijumpai. / Announcement not found.', 404);
  const body = await readJson(c);
  const cleaned = cleanAnnouncement(body, existing);
  if (cleaned.error) return bad(cleaned.error);
  const a = cleaned.value;
  await c.env.DB.prepare(
    `UPDATE announcements SET title_bm = ?, title_en = ?, body_bm = ?, body_en = ?, category = ?, status = ?,
      link_url = ?, link_label_bm = ?, link_label_en = ?, starts_at = ?, ends_at = ?, is_pinned = ?, updated_by = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      a.title_bm, a.title_en, a.body_bm, a.body_en, a.category, a.status, a.link_url, a.link_label_bm,
      a.link_label_en, a.starts_at, a.ends_at, a.is_pinned, auth.user.id, nowIso(), existing.id,
    )
    .run();
  await audit(c, 'update', 'announcement', existing.id, { before: existing, after: a });
  return json({ ok: true });
});

admin.delete('/announcements/:id', async (c) => {
  const denied = superOnly(c);
  if (denied) return denied;
  const existing = await c.env.DB.prepare('SELECT * FROM announcements WHERE id = ?').bind(c.req.param('id')).first();
  if (!existing) return bad('Pengumuman tidak dijumpai. / Announcement not found.', 404);
  await c.env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(existing.id).run();
  await audit(c, 'delete', 'announcement', existing.id, { before: existing });
  return json({ ok: true });
});

/* ------------------------------ Audit log ---------------------------- */
admin.get('/audit-logs', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const { page, pageSize, offset } = pageParams(c);
  const where = [];
  const binds = [];
  if (!auth.isSuper) {
    where.push('school_id = ?');
    binds.push(auth.activeSchool);
  } else if (c.req.query('schoolId')) {
    where.push('school_id = ?');
    binds.push(c.req.query('schoolId'));
  }
  if (c.req.query('entity')) {
    where.push('entity = ?');
    binds.push(c.req.query('entity'));
  }
  if (c.req.query('action')) {
    where.push('action = ?');
    binds.push(c.req.query('action'));
  }
  if (c.req.query('from')) {
    where.push('created_at >= ?');
    binds.push(c.req.query('from'));
  }
  if (c.req.query('to')) {
    where.push('created_at <= ?');
    binds.push(`${c.req.query('to')}T23:59:59`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs ${w}`).bind(...binds).first();
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return json({ logs: results, ...pagingMeta(count?.n || 0, page, pageSize) });
});

/* ----------------------------- Retention ----------------------------- */
admin.get('/retention/config', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM retention_config ORDER BY data_type').all();
  return json({ config: results });
});

admin.get('/retention', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM retention_records WHERE school_id = ? ORDER BY flagged_at DESC LIMIT 300',
  )
    .bind(auth.activeSchool)
    .all();
  return json({ records: results });
});

admin.post('/retention/scan', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const n = await flagRetentionRecords(c.env, auth.activeSchool);
  await audit(c, 'scan', 'retention', null, { after: { flagged: n } });
  return json({ flagged: n });
});

admin.post('/retention/:id/approve', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  const rec = await c.env.DB.prepare('SELECT * FROM retention_records WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!rec) return bad('Not found', 404);
  if (rec.status !== 'pending') return bad('Rekod sudah diproses. / Record already processed.');
  const action = body.action === 'delete' ? 'delete' : 'anonymise';
  if (rec.entity === 'application') {
    if (action === 'delete') {
      await c.env.DB.prepare("UPDATE applications SET student_name = '[dipadam]', ic_masked = NULL, ic_hash = NULL, ic_enc = NULL, dob = NULL, address = NULL, education = NULL, reason = '[dipadam]', parent_name = '[dipadam]', parent_email = NULL, parent_phone = NULL, documents = '[]' WHERE id = ?")
        .bind(rec.entity_id)
        .run();
    } else {
      await c.env.DB.prepare("UPDATE applications SET student_name = 'Pemohon ' || substr(reference, -5), parent_name = '[tanpa nama]', address = NULL, parent_email = NULL, parent_phone = NULL WHERE id = ?")
        .bind(rec.entity_id)
        .run();
    }
  }
  await c.env.DB.prepare("UPDATE retention_records SET status = 'approved', action = ?, approved_by = ?, resolved_at = ? WHERE id = ?")
    .bind(action, auth.user.id, nowIso(), rec.id)
    .run();
  // The audit entry must not retain the deleted personal data (FR-RET-06).
  await audit(c, action === 'delete' ? 'retention_delete' : 'retention_anonymise', 'retention', rec.id, {
    after: { entity: rec.entity, action, approvedBy: auth.user.id },
  });
  return json({ ok: true });
});

admin.post('/retention/:id/dismiss', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  await c.env.DB.prepare("UPDATE retention_records SET status = 'dismissed', resolved_at = ? WHERE id = ? AND school_id = ?")
    .bind(nowIso(), c.req.param('id'), auth.activeSchool)
    .run();
  await audit(c, 'dismiss', 'retention', c.req.param('id'));
  return json({ ok: true });
});

/* ------------------------------ Imports ------------------------------ */
// No class, fee plan, student phone or student email columns. IC / Passport No.
// is mandatory for students, parents and teachers.
const TEMPLATES = {
  students: ['full_name', 'ic', 'dob', 'gender', 'address', 'parent_name', 'parent_ic', 'parent_email', 'parent_phone', 'status'],
  parents: ['full_name', 'ic', 'email', 'phone', 'address', 'student_ic'],
  teachers: ['full_name', 'ic', 'email', 'phone'],
  'opening-balances': ['student_name', 'student_ic', 'amount', 'due_date', 'description'],
};

admin.get('/imports/templates/:type', (c) => {
  const cols = TEMPLATES[c.req.param('type')];
  if (!cols) return bad('Templat tidak dijumpai. / Template not found.', 404);
  return new Response(toCsv([], cols.map((k) => ({ key: k, label: k }))), {
    headers: downloadHeaders(`${c.req.param('type')}-template.csv`, 'text/csv; charset=utf-8'),
  });
});

function normaliseRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.toLowerCase().trim().replace(/\s+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

const STUDENT_PARENT = { ic: 'parent_ic', name: 'parent_name', email: 'parent_email', phone: 'parent_phone' };
const PERSON_ROW = { ic: 'ic', name: 'full_name', email: 'email', phone: 'phone' };

/** Replace a raw IC in the row with its ciphertext and masked form, so the stored report holds no plain IC. */
async function sealIc(env, r, field) {
  const raw = r[field];
  delete r[field];
  if (!raw) return '';
  const ic = await encryptIc(env, raw);
  r[`${field}_enc`] = ic.enc;
  r[`${field}_masked`] = ic.masked;
  return raw;
}

async function openIc(env, r, field) {
  return r[`${field}_enc`] ? decryptIc(env, r[`${field}_enc`]) : null;
}

/** Existing parents/teachers with the same IC / Passport No., email or phone. */
async function personDuplicates(env, kind, raw, r, f) {
  const out = [];
  let icHash = '';
  if (validIc(raw)) {
    icHash = await hashIc(env, raw);
    const table = kind === 'teacher' ? 'teachers' : 'parents';
    const m = await env.DB.prepare(`SELECT id, full_name FROM ${table} WHERE ic_hash = ?`).bind(icHash).first();
    if (m) out.push({ kind, id: m.id, full_name: m.full_name, matchedOn: ['ic'] });
  }
  const contacts = await findContactMatches(env, { email: r[f.email], phone: r[f.phone], excludeIcHash: icHash });
  for (const d of contacts) out.push({ kind: d.kind, id: d.id, full_name: d.full_name, matchedOn: d.matchedOn });
  return out;
}

async function findSchoolStudent(env, schoolId, { ic, name }) {
  if (validIc(ic)) {
    const st = await env.DB.prepare('SELECT * FROM students WHERE school_id = ? AND ic_hash = ?').bind(schoolId, await hashIc(env, ic)).first();
    if (st) return st;
  }
  if (name) {
    return env.DB.prepare('SELECT * FROM students WHERE school_id = ? AND lower(full_name) = lower(?)').bind(schoolId, name).first();
  }
  return null;
}

/**
 * Dry run. Rows whose IC / Passport No., email or phone already exists are
 * flagged as possible duplicates; on confirm the admin chooses "use existing"
 * or "create anyway", so no row is created silently.
 */
async function validateImport(env, schoolId, type, rows) {
  const results = [];
  const seenEmail = new Set();
  const seenIc = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = normaliseRow(rows[i]);
    const errors = [];
    let duplicates = [];
    if (type === 'students') {
      if (!r.full_name) errors.push('Nama diperlukan / name required');
      const raw = await sealIc(env, r, 'ic');
      if (!raw) errors.push('No. IC / Pasport diperlukan / IC / Passport No. required');
      else if (!validIc(raw)) errors.push('No. IC / Pasport tidak sah / invalid IC / Passport No.');
      else {
        const key = normalizeIc(raw);
        if (seenIc.has(key)) errors.push('No. IC / Pasport berulang dalam fail / duplicate IC / Passport No. in file');
        seenIc.add(key);
        const st = await env.DB.prepare('SELECT id, full_name FROM students WHERE school_id = ? AND ic_hash = ?')
          .bind(schoolId, await hashIc(env, raw))
          .first();
        if (st) duplicates.push({ kind: 'student', id: st.id, full_name: st.full_name, matchedOn: ['ic'] });
      }
      if (r.parent_name || r.parent_ic || r.parent_email || r.parent_phone) {
        const praw = await sealIc(env, r, 'parent_ic');
        const problem = checkNewPerson({ name: r.parent_name, ic: praw, email: r.parent_email, phone: r.parent_phone });
        if (problem) errors.push(`Ibu bapa / Parent: ${message(problem)}`);
        else duplicates.push(...(await personDuplicates(env, 'parent', praw, r, STUDENT_PARENT)));
      }
    } else if (type === 'parents' || type === 'teachers') {
      const kind = type === 'parents' ? 'parent' : 'teacher';
      const raw = await sealIc(env, r, 'ic');
      const problem = checkNewPerson({ name: r.full_name, ic: raw, email: r.email, phone: r.phone });
      if (problem) errors.push(message(problem));
      const email = String(r.email || '').toLowerCase();
      if (email && seenEmail.has(email)) errors.push('E-mel berulang dalam fail / duplicate email in file');
      if (email) seenEmail.add(email);
      if (!problem) duplicates = await personDuplicates(env, kind, raw, r, PERSON_ROW);
      if (kind === 'parent' && (r.student_ic || r.student_name)) {
        const sraw = await sealIc(env, r, 'student_ic');
        const st = await findSchoolStudent(env, schoolId, { ic: sraw, name: r.student_name });
        if (!st) errors.push('Pelajar tidak dijumpai / student not found');
        else r.student_id = st.id;
      }
    } else if (type === 'opening-balances') {
      const sraw = await sealIc(env, r, 'student_ic');
      if (!r.student_name && !sraw) errors.push('Nama atau No. IC / Pasport pelajar diperlukan / student name or IC / Passport No. required');
      if (!r.amount || parseMoney(r.amount) <= 0) errors.push('Jumlah baki tidak sah / invalid balance amount');
      if (r.student_name || sraw) {
        const st = await findSchoolStudent(env, schoolId, { ic: sraw, name: r.student_name });
        if (!st) errors.push('Pelajar tidak dijumpai / student not found');
      }
    }
    results.push({ row: i + 2, data: r, errors, duplicates });
  }
  return results;
}

admin.get('/imports', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM import_batches WHERE school_id = ? ORDER BY created_at DESC LIMIT 50',
  )
    .bind(auth.activeSchool)
    .all();
  // report_json holds encrypted IC values for the confirm step; it never leaves the server.
  return json({ batches: results.map(({ report_json: _r, ...b }) => b) });
});

admin.post('/imports', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const contentType = c.req.header('content-type') || '';
  let type;
  let rows;
  let filename = 'upload.csv';
  let rawText = '';
  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    type = form.get('type');
    const file = form.get('file');
    if (!file || typeof file === 'string') return bad('Fail diperlukan. / File is required.');
    rawText = await file.text();
    filename = String(file.name || filename);
    rows = parseCsv(rawText);
  } else {
    const body = await readJson(c);
    type = body.type;
    rows = body.rows || parseCsv(body.csv || '');
    filename = body.filename || filename;
    rawText = body.csv || '';
  }
  if (!TEMPLATES[type]) return bad('Jenis import tidak sah. / Invalid import type.');
  if (!rows.length) return bad('Fail kosong. / The file is empty.');
  if (rows.length > 2000) return bad('Maksimum 2000 baris. / Maximum 2000 rows.');
  const validation = await validateImport(c.env, auth.activeSchool, type, rows);
  const ok = validation.filter((v) => !v.errors.length);
  const failed = validation.filter((v) => v.errors.length);
  const batchId = id('imp');
  const report = {
    type,
    total: rows.length,
    ok: ok.length,
    failed: failed.length,
    duplicates: ok.filter((v) => v.duplicates?.length).length,
    rows: validation,
    header: rows.length ? Object.keys(normaliseRow(rows[0])) : TEMPLATES[type],
  };
  let docId = null;
  if (rawText) {
    docId = id('doc');
    await c.env.DB.prepare(
      'INSERT INTO documents (id, school_id, owner_type, owner_id, filename, content_type, size, data_b64, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
      .bind(docId, auth.activeSchool, 'import_batch', batchId, filename, 'text/csv', rawText.length, btoa(unescape(encodeURIComponent(rawText))), nowIso())
      .run();
  }
  await c.env.DB.prepare(
    `INSERT INTO import_batches (id, school_id, type, filename, status, total_rows, ok_rows, error_rows, report_json, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(batchId, auth.activeSchool, type, filename, 'dry_run', rows.length, ok.length, failed.length, JSON.stringify(report), auth.user.id, nowIso())
    .run();
  await audit(c, 'dry_run', 'import', batchId, { after: { type, total: rows.length, ok: ok.length, failed: failed.length, duplicates: report.duplicates } });
  // The stored report keeps ciphertext for the confirm step; the client only sees masked values.
  const clientReport = {
    ...report,
    rows: report.rows.map((row) => ({
      ...row,
      data: Object.fromEntries(Object.entries(row.data).filter(([k]) => !k.endsWith('_enc'))),
    })),
  };
  return json({ batch: { id: batchId, type, filename, total: rows.length, ok: ok.length, failed: failed.length, duplicates: report.duplicates }, report: clientReport }, 201);
});

admin.post('/imports/:id/confirm', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const batch = await c.env.DB.prepare('SELECT * FROM import_batches WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!batch) return bad('Not found', 404);
  if (batch.status !== 'dry_run') return bad('Batch sudah diproses. / Batch already processed.');
  const report = JSON.parse(batch.report_json);
  const valid = report.rows.filter((r) => !r.errors.length);
  const body = await readJson(c);
  const dupRows = valid.filter((r) => r.duplicates?.length).length;
  const duplicateAction = ['link', 'create'].includes(body.duplicateAction) ? body.duplicateAction : null;
  const duplicateReason = String(body.duplicateReason || '').trim();
  if (dupRows && !duplicateAction) {
    return bad(
      `${dupRows} baris mungkin pendua (No. IC / Pasport, e-mel atau telefon sudah wujud). Pilih guna sedia ada atau cipta juga. / ${dupRows} rows are possible duplicates (IC / Passport No., email or phone already exists). Choose use existing or create anyway.`,
      409,
      { code: 'duplicate_contact', rows: dupRows },
    );
  }
  if (duplicateAction === 'create' && duplicateReason.length < 5) {
    return bad('Sebab diperlukan untuk cipta juga. / A reason is required to create anyway.', 400, { code: 'reason_required' });
  }
  const people = makePeopleImporter(c, auth.activeSchool, batch.id, duplicateAction, duplicateReason);
  const env = c.env;
  let inserted = 0;
  let linked = 0;
  let parentSkipped = 0;
  for (const item of valid) {
    const r = item.data;
    if (batch.type === 'students') {
      const ic = await encryptIc(env, await openIc(env, r, 'ic'));
      const existing = await env.DB.prepare('SELECT id FROM students WHERE school_id = ? AND ic_hash = ?').bind(auth.activeSchool, ic.hash).first();
      let studentId;
      if (existing && duplicateAction !== 'create') {
        studentId = existing.id;
        linked++;
      } else {
        studentId = id('std');
        await env.DB.prepare(
          `INSERT INTO students (id, school_id, full_name, ic_hash, ic_enc, ic_masked, dob, gender, address,
            monthly_fee_cents, monthly_tracking, status, import_batch_id, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?)`,
        )
          .bind(
            studentId,
            auth.activeSchool,
            r.full_name,
            ic.hash,
            ic.enc,
            ic.masked,
            r.dob || null,
            r.gender || null,
            r.address || '',
            ['active', 'withdrawn', 'graduated', 'applicant'].includes(r.status) ? r.status : 'active',
            batch.id,
            nowIso(),
          )
          .run();
        inserted++;
      }
      if (r.parent_ic_enc && !(await people.parent(r, STUDENT_PARENT, studentId))) parentSkipped++;
    } else if (batch.type === 'parents') {
      const parent = await people.parent(r, PERSON_ROW, r.student_id || null);
      if (!parent) parentSkipped++;
      else if (parent.created) inserted++;
      else linked++;
    } else if (batch.type === 'teachers') {
      const teacher = await people.teacher(r);
      if (!teacher) parentSkipped++;
      else if (teacher.created) inserted++;
      else linked++;
    } else if (batch.type === 'opening-balances') {
      const st = await findSchoolStudent(env, auth.activeSchool, { ic: await openIc(env, r, 'student_ic'), name: r.student_name });
      if (!st) continue;
      await createInvoice(env, {
        schoolId: auth.activeSchool,
        studentId: st.id,
        type: 'opening',
        period: `OPEN-${batch.id.slice(-8)}`,
        issueDate: today(),
        dueDate: r.due_date || today(),
        amountCents: parseMoney(r.amount),
        description: r.description || 'Baki permulaan / Opening balance',
      });
      inserted++;
    }
  }
  const summary = { imported: inserted, linked, parentSkipped, duplicateAction, duplicateReason: duplicateReason || null };
  await env.DB.prepare("UPDATE import_batches SET status = 'confirmed', report_json = ? WHERE id = ?")
    .bind(JSON.stringify({ ...report, ...summary }), batch.id)
    .run();
  await audit(c, 'confirm', 'import', batch.id, { after: summary });
  return json({ imported: inserted, linked, failed: report.failed, parentSkipped, skipped: parentSkipped });
});

/**
 * Creates or reuses import parents/teachers with the same rules as the forms,
 * and gives each a login. Rows in one file with the same IC / Passport No.
 * resolve to one record (the first row creates it, later rows match its IC).
 */
function makePeopleImporter(c, schoolId, batchId, duplicateAction, duplicateReason) {
  const env = c.env;
  const appUrl = env.APP_URL || new URL(c.req.url).origin;
  const inputOf = async (r, f) => ({
    ic: await openIc(env, r, f.ic),
    name: r[f.name],
    email: r[f.email],
    phone: r[f.phone],
    address: r.address,
    createAnyway: duplicateAction === 'create',
    duplicateReason,
  });
  return {
    async parent(r, f, studentId) {
      const input = await inputOf(r, f);
      let plan = await planParent(env, input, { schoolId });
      if (plan.conflict && duplicateAction === 'link') {
        const same = plan.conflict.find((m) => m.kind === 'parent');
        if (same) plan = await planParent(env, { parentId: same.id, email: input.email, phone: input.phone }, { schoolId });
      }
      if (plan.conflict || plan.error) return null;
      const parent = await commitParent(env, plan);
      if (studentId) await linkParentToStudent(env, parent.id, studentId, schoolId);
      await ensureParentLogin(env, parent, schoolId, { appUrl });
      if (plan.create) {
        await audit(c, 'create', 'parent', parent.id, {
          after: { via: 'import', batchId, duplicateReason: plan.create.duplicateReason, duplicateOf: plan.create.duplicateOf },
        });
      }
      return { ...parent, created: !!plan.create };
    },
    async teacher(r) {
      const input = await inputOf(r, PERSON_ROW);
      let plan = await planTeacher(env, input, { schoolId });
      if (plan.conflict && duplicateAction === 'link') {
        const same = plan.conflict.find((m) => m.kind === 'teacher');
        if (same) plan = await planTeacher(env, { teacherId: same.id, email: input.email, phone: input.phone }, { schoolId });
      }
      if (plan.conflict || plan.error) return null;
      const teacher = await commitTeacher(env, plan, schoolId);
      await addMembership(env, teacher.id, schoolId);
      await ensureLogin(env, { kind: 'teacher', person: teacher, schoolId, appUrl });
      await audit(c, plan.create ? 'create' : 'add_membership', 'teacher', teacher.id, {
        after: { via: 'import', batchId, schoolId, duplicateReason: plan.create?.duplicateReason || null },
      });
      return { ...teacher, created: !!plan.create };
    },
  };
}

/* ------------------------------ Backups ------------------------------ */
admin.get('/backups', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  if (!auth.isSuper) return bad('Hanya Super Admin. / Super Admin only.', 403);
  const { results } = await c.env.DB.prepare('SELECT * FROM backups ORDER BY created_at DESC LIMIT 50').all();
  return json({ backups: results });
});

admin.post('/backups', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  if (!auth.isSuper) return bad('Hanya Super Admin. / Super Admin only.', 403);
  const body = await readJson(c);
  const type = body.type === 'incremental' ? 'incremental' : 'full';
  const tables = ['schools', 'users', 'user_roles', 'students', 'parents', 'parent_students', 'teachers', 'teacher_schools', 'applications', 'interviews', 'scores', 'decisions', 'invoices', 'invoice_lines', 'payments', 'payment_allocations', 'credits', 'receipts', 'refunds', 'write_offs', 'fee_adjustments', 'notifications', 'audit_logs', 'import_batches', 'retention_records'];
  const dump = { generatedAt: nowIso(), type, tables: {} };
  for (const t of tables) {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${t} LIMIT 20000`).all();
    dump.tables[t] = results;
  }
  const payload = JSON.stringify(dump);
  const backupId = id('bak');
  let r2Key = null;
  if (c.env.BUCKET) {
    r2Key = `backups/${backupId}.json`;
    await c.env.BUCKET.put(r2Key, payload, { httpMetadata: { contentType: 'application/json' } });
  } else {
    await c.env.DB.prepare(
      'INSERT INTO documents (id, school_id, owner_type, owner_id, filename, content_type, size, data_b64, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
      .bind(backupId, null, 'backup', backupId, `${backupId}.json`, 'application/json', payload.length, btoa(unescape(encodeURIComponent(payload))), nowIso())
      .run();
  }
  await c.env.DB.prepare('INSERT INTO backups (id, type, status, size_bytes, r2_key, requested_by, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(backupId, type, 'completed', payload.length, r2Key, auth.user.id, nowIso())
    .run();
  await audit(c, 'backup', 'system', backupId, { after: { type, size: payload.length } });
  return json({ id: backupId, size: payload.length, type }, 201);
});

/* ----------------------------- Documents ----------------------------- */
const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function documentResponse(body, doc) {
  const safeName = String(doc.filename || 'file').replace(/[^\w. -]/g, '_');
  // Only PDF/images are shown inline; anything else (e.g. older HTML uploads) is
  // forced to download so it can never run as a page on the app's origin.
  const safe = DOCUMENT_TYPES.includes(doc.content_type);
  return new Response(body, {
    headers: {
      'content-type': safe ? doc.content_type : 'application/octet-stream',
      'content-disposition': `${safe ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'x-content-type-options': 'nosniff',
    },
  });
}

admin.post('/documents', requireRoles('school_admin', 'bursar'), async (c) => {
  const auth = c.get('auth');
  if (!auth.activeSchool) return bad('Pilih sekolah dahulu. / Select a school first.');
  let form;
  try {
    form = await c.req.formData();
  } catch {
    return bad('Muat naik tidak sah. / Invalid upload.');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return bad('Fail diperlukan. / File is required.');
  if (file.size > 4 * 1024 * 1024) return bad('Saiz fail melebihi 4MB. / File exceeds 4MB.');
  if (!DOCUMENT_TYPES.includes(file.type)) return bad('Jenis fail tidak dibenarkan. / File type not allowed.');
  const buffer = await file.arrayBuffer();
  const docId = id('doc');
  let r2Key = null;
  if (c.env.BUCKET) {
    r2Key = `documents/${auth.activeSchool || 'system'}/${docId}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await c.env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  }
  let dataB64 = null;
  if (!c.env.BUCKET) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    dataB64 = btoa(binary);
  }
  await c.env.DB.prepare(
    'INSERT INTO documents (id, school_id, owner_type, owner_id, filename, content_type, size, r2_key, data_b64, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      docId,
      auth.activeSchool,
      form.get('ownerType') || 'general',
      form.get('ownerId') || '',
      String(file.name).slice(0, 200),
      file.type || 'application/octet-stream',
      file.size,
      r2Key,
      dataB64,
      nowIso(),
    )
    .run();
  await audit(c, 'upload', 'document', docId, { after: { filename: file.name, size: file.size } });
  return json({ id: docId, filename: file.name, size: file.size }, 201);
});

admin.get('/documents/:id', requireRoles('school_admin', 'bursar'), async (c) => {
  const auth = c.get('auth');
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(c.req.param('id')).first();
  if (!doc) return bad('Fail tidak dijumpai. / File not found.', 404);
  // Files without a school (unclaimed public uploads, backups) are super admin only.
  if (!auth.isSuper && (!doc.school_id || doc.school_id !== auth.activeSchool)) return bad('Forbidden', 403);
  if (doc.r2_key && c.env.BUCKET) {
    const obj = await c.env.BUCKET.get(doc.r2_key);
    if (!obj) return bad('Fail tidak dijumpai. / File not found.', 404);
    return documentResponse(obj.body, doc);
  }
  if (doc.data_b64) {
    const binary = atob(doc.data_b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return documentResponse(bytes, doc);
  }
  return bad('Fail tidak tersedia. / File unavailable.', 404);
});

admin.get('/documents', requireRoles('school_admin', 'bursar'), async (c) => {
  const auth = c.get('auth');
  const ownerType = c.req.query('ownerType');
  const ownerId = c.req.query('ownerId');
  const { results } = await c.env.DB.prepare(
    'SELECT id, owner_type, owner_id, filename, content_type, size, created_at FROM documents WHERE school_id = ? AND owner_type = ? AND owner_id = ? ORDER BY created_at DESC',
  )
    .bind(auth.activeSchool, ownerType || '', ownerId || '')
    .all();
  return json({ documents: results });
});

/* ------------------------------- Lookups ----------------------------- */
admin.get('/lookups', async (c) => {
  const auth = c.get('auth');
  const empty = { teachers: [], parents: [], students: [] };
  if (!auth.activeSchool) return json(empty);
  const role = auth.isSuper ? 'super_admin' : auth.roleInSchool;
  if (!['super_admin', 'school_admin', 'bursar', 'teacher'].includes(role)) return json(empty);
  const teachers = await c.env.DB.prepare(
    `SELECT t.id, t.full_name, t.user_id FROM teacher_schools tm JOIN teachers t ON t.id = tm.teacher_id
     WHERE tm.school_id = ? AND tm.status = 'active' ORDER BY t.full_name`,
  ).bind(auth.activeSchool).all();
  if (role === 'teacher') return json({ ...empty, teachers: teachers.results });
  const parents = await c.env.DB.prepare(
    `SELECT DISTINCT p.id, p.full_name, p.email, p.phone FROM parents p JOIN parent_students ps ON ps.parent_id = p.id
     JOIN students s ON s.id = ps.student_id WHERE s.school_id = ? ORDER BY p.full_name LIMIT 500`,
  ).bind(auth.activeSchool).all();
  const students = await c.env.DB.prepare(
    "SELECT id, full_name, ic_masked, status FROM students WHERE school_id = ? AND status = 'active' ORDER BY full_name LIMIT 500",
  ).bind(auth.activeSchool).all();
  return json({
    teachers: teachers.results,
    parents: parents.results,
    students: students.results,
  });
});

/* ---------------------------- Scheduled jobs ------------------------- */
admin.post('/admin/run-jobs', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const summary = await runDaily(c.env);
  const lapsed = await lapseOffers(c.env);
  await audit(c, 'run_jobs', 'system', null, { after: { ...summary, lapsed } });
  return json({ ...summary, lapsed });
});

export async function lapseOffers(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM applications WHERE offer_status = 'offered' AND offer_deadline < ?",
  )
    .bind(today())
    .all();
  for (const app of results) {
    await env.DB.prepare("UPDATE applications SET offer_status = 'lapsed' WHERE id = ?").bind(app.id).run();
    const { results: admins } = await env.DB.prepare(
      `SELECT u.id, u.email, u.full_name, u.language FROM users u JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.school_id = ? AND ur.role = 'school_admin' AND ur.status = 'active'`,
    )
      .bind(app.school_id)
      .all();
    for (const a of admins) {
      await notify(env, {
        schoolId: app.school_id,
        userId: a.id,
        email: a.email,
        name: a.full_name,
        type: 'offer_lapsed',
        subject: `Tawaran luput / Offer lapsed — ${app.reference}`,
        body: `Tawaran kepada ${app.student_name} telah luput tanpa jawapan. Anda boleh menawarkan tempat kepada pemohon seterusnya.\nThe offer to ${app.student_name} lapsed without a response. You may offer the place to the next applicant.`,
        language: a.language || 'bm',
      });
    }
  }
  return results.length;
}

export default admin;
