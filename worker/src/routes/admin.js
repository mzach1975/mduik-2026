import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../lib/auth.js';
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
} from '../lib/util.js';
import { audit } from '../lib/audit.js';
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
      await c.env.DB.prepare("UPDATE applications SET student_name = '[dipadam]', ic_masked = NULL, ic_hash = NULL, ic_enc = NULL, dob = NULL, address = NULL, phone = NULL, email = NULL, education = NULL, reason = '[dipadam]', parent_name = '[dipadam]', parent_email = NULL, parent_phone = NULL, documents = '[]' WHERE id = ?")
        .bind(rec.entity_id)
        .run();
    } else {
      await c.env.DB.prepare("UPDATE applications SET student_name = 'Pemohon ' || substr(reference, -5), parent_name = '[tanpa nama]', address = NULL, phone = NULL, email = NULL, parent_email = NULL, parent_phone = NULL WHERE id = ?")
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
const TEMPLATES = {
  students: ['full_name', 'ic', 'dob', 'gender', 'class_name', 'phone', 'email', 'address', 'parent_name', 'parent_email', 'parent_phone', 'monthly_fee', 'status'],
  parents: ['full_name', 'email', 'phone', 'address', 'student_name'],
  teachers: ['full_name', 'email', 'phone', 'ic'],
  'opening-balances': ['student_name', 'student_ic', 'amount', 'due_date', 'description'],
};

admin.get('/imports/templates/:type', (c) => {
  const cols = TEMPLATES[c.req.param('type')];
  if (!cols) return bad('Templat tidak dijumpai. / Template not found.', 404);
  return new Response(toCsv([], cols.map((k) => ({ key: k, label: k }))), {
    headers: downloadHeaders(`${c.req.param('type')}-template.csv`, 'text/csv; charset=utf-8'),
  });
});

function normaliseRow(type, row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k.toLowerCase().trim().replace(/\s+/g, '_')] = typeof v === 'string' ? v.trim() : v;
  return out;
}

async function validateImport(env, schoolId, type, rows) {
  const results = [];
  const seenEmail = new Set();
  for (let i = 0; i < rows.length; i++) {
    const r = normaliseRow(type, rows[i]);
    const errors = [];
    if (type === 'students') {
      if (!r.full_name) errors.push('Nama diperlukan / name required');
      if (r.ic) {
        const { hashIc } = await import('../lib/auth.js');
        const h = await hashIc(env, r.ic);
        const dup = await env.DB.prepare('SELECT id FROM students WHERE school_id = ? AND ic_hash = ?').bind(schoolId, h).first();
        if (dup) errors.push('IC sudah wujud / duplicate IC');
      }
      if (r.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.parent_email)) errors.push('E-mel ibu bapa tidak sah / invalid parent email');
      if (r.monthly_fee && Number.isNaN(Number(String(r.monthly_fee).replace(/[^0-9.]/g, '')))) errors.push('Yuran tidak sah / invalid fee');
    } else if (type === 'parents') {
      if (!r.full_name) errors.push('Nama diperlukan / name required');
      if (!r.email && !r.phone) errors.push('E-mel atau telefon diperlukan / email or phone required');
      if (r.email && seenEmail.has(r.email.toLowerCase())) errors.push('E-mel berulang dalam fail / duplicate email in file');
      if (r.email) seenEmail.add(r.email.toLowerCase());
    } else if (type === 'teachers') {
      if (!r.full_name) errors.push('Nama diperlukan / name required');
      if (!r.email) errors.push('E-mel diperlukan / email required');
      if (r.email) {
        const dup = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(r.email).first();
        if (dup) errors.push('E-mel sudah digunakan / email already used');
      }
    } else if (type === 'opening-balances') {
      if (!r.student_name && !r.student_ic) errors.push('Nama atau IC pelajar diperlukan / student name or IC required');
      if (!r.amount || parseMoney(r.amount) <= 0) errors.push('Jumlah baki tidak sah / invalid balance amount');
      if (r.student_name) {
        const st = await env.DB.prepare('SELECT id FROM students WHERE school_id = ? AND lower(full_name) = lower(?)')
          .bind(schoolId, r.student_name)
          .first();
        if (!st) errors.push('Pelajar tidak dijumpai / student not found');
      }
    }
    results.push({ row: i + 2, data: r, errors });
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
  return json({ batches: results });
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
    rows: validation,
    header: rows.length ? Object.keys(normaliseRow(type, rows[0])) : TEMPLATES[type],
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
  await audit(c, 'dry_run', 'import', batchId, { after: { type, total: rows.length, ok: ok.length, failed: failed.length } });
  return json({ batch: { id: batchId, type, filename, total: rows.length, ok: ok.length, failed: failed.length }, report }, 201);
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
  let inserted = 0;
  const plan = await c.env.DB.prepare('SELECT * FROM fee_plans WHERE school_id = ? AND active = 1 ORDER BY created_at LIMIT 1')
    .bind(auth.activeSchool)
    .first();
  for (const item of valid) {
    const r = item.data;
    if (batch.type === 'students') {
      const existing = r.ic
        ? await c.env.DB.prepare('SELECT id FROM students WHERE school_id = ? AND ic_hash IS NOT NULL AND full_name = ?')
            .bind(auth.activeSchool, r.full_name)
            .first()
        : null;
      if (existing) continue;
      const studentId = id('std');
      const fee = r.monthly_fee ? parseMoney(r.monthly_fee) : plan?.monthly_fee_cents || auth.school.monthly_fee_cents;
      const { encryptIc } = await import('../lib/auth.js');
      const ic = r.ic ? await encryptIc(c.env, r.ic) : { enc: null, hash: null, masked: null };
      await c.env.DB.prepare(
        `INSERT INTO students (id, school_id, full_name, ic_hash, ic_enc, ic_masked, dob, gender, class_name, address, phone, email,
          fee_plan_id, monthly_fee_cents, monthly_tracking, status, import_batch_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
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
          r.class_name || '',
          r.address || '',
          r.phone || '',
          r.email || '',
          plan?.id || null,
          fee,
          r.status || 'active',
          batch.id,
          nowIso(),
        )
        .run();
      if (r.parent_name) {
        let parent = r.parent_email
          ? await c.env.DB.prepare('SELECT * FROM parents WHERE lower(email) = lower(?)').bind(r.parent_email).first()
          : null;
        if (!parent) {
          const parentId = id('par');
          await c.env.DB.prepare('INSERT INTO parents (id, full_name, email, phone, address, created_at) VALUES (?,?,?,?,?,?)')
            .bind(parentId, r.parent_name, r.parent_email || '', r.parent_phone || '', r.address || '', nowIso())
            .run();
          parent = { id: parentId };
        }
        await c.env.DB.prepare("INSERT OR IGNORE INTO parent_students (id, parent_id, student_id, relationship) VALUES (?,?,?,'guardian')")
          .bind(id('ps'), parent.id, studentId)
          .run();
      }
      inserted++;
    } else if (batch.type === 'parents') {
      const existing = r.email
        ? await c.env.DB.prepare('SELECT id FROM parents WHERE lower(email) = lower(?)').bind(r.email).first()
        : null;
      if (existing) continue;
      const parentId = id('par');
      await c.env.DB.prepare('INSERT INTO parents (id, full_name, email, phone, address, created_at) VALUES (?,?,?,?,?,?)')
        .bind(parentId, r.full_name, r.email || '', r.phone || '', r.address || '', nowIso())
        .run();
      if (r.student_name) {
        const st = await c.env.DB.prepare('SELECT id FROM students WHERE school_id = ? AND lower(full_name) = lower(?)')
          .bind(auth.activeSchool, r.student_name)
          .first();
        if (st) {
          await c.env.DB.prepare("INSERT OR IGNORE INTO parent_students (id, parent_id, student_id, relationship) VALUES (?,?,?,'guardian')")
            .bind(id('ps'), parentId, st.id)
            .run();
        }
      }
      inserted++;
    } else if (batch.type === 'teachers') {
      const teacherId = id('tch');
      await c.env.DB.prepare(
        'INSERT INTO teachers (id, school_id, full_name, email, phone, status, created_at) VALUES (?,?,?,?,?,?,?)',
      )
        .bind(teacherId, auth.activeSchool, r.full_name, r.email || '', r.phone || '', 'active', nowIso())
        .run();
      inserted++;
    } else if (batch.type === 'opening-balances') {
      let st = null;
      if (r.student_ic) {
        const { hashIc } = await import('../lib/auth.js');
        const h = await hashIc(c.env, r.student_ic);
        st = await c.env.DB.prepare('SELECT * FROM students WHERE school_id = ? AND ic_hash = ?').bind(auth.activeSchool, h).first();
      }
      if (!st && r.student_name) {
        st = await c.env.DB.prepare('SELECT * FROM students WHERE school_id = ? AND lower(full_name) = lower(?)')
          .bind(auth.activeSchool, r.student_name)
          .first();
      }
      if (!st) continue;
      const amount = parseMoney(r.amount);
      const due = r.due_date || today();
      await createInvoice(c.env, {
        schoolId: auth.activeSchool,
        studentId: st.id,
        type: 'opening',
        period: `OPEN-${batch.id.slice(-8)}`,
        issueDate: today(),
        dueDate: due,
        amountCents: amount,
        description: r.description || 'Baki permulaan / Opening balance',
      });
      inserted++;
    }
  }
  await c.env.DB.prepare("UPDATE import_batches SET status = 'confirmed', report_json = ? WHERE id = ?")
    .bind(JSON.stringify({ ...report, imported: inserted }), batch.id)
    .run();
  await audit(c, 'confirm', 'import', batch.id, { after: { imported: inserted } });
  return json({ imported: inserted, failed: report.failed });
});

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
  const tables = ['schools', 'fee_plans', 'users', 'user_roles', 'students', 'parents', 'parent_students', 'teachers', 'applications', 'interviews', 'scores', 'decisions', 'invoices', 'invoice_lines', 'payments', 'payment_allocations', 'credits', 'receipts', 'refunds', 'write_offs', 'fee_adjustments', 'notifications', 'audit_logs', 'import_batches', 'retention_records'];
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
  const empty = { teachers: [], parents: [], students: [], feePlans: [], classes: [] };
  if (!auth.activeSchool) return json(empty);
  const role = auth.isSuper ? 'super_admin' : auth.roleInSchool;
  if (!['super_admin', 'school_admin', 'bursar', 'teacher'].includes(role)) return json(empty);
  if (role === 'teacher') {
    const { results } = await c.env.DB.prepare(
      "SELECT t.id, t.full_name, t.user_id FROM teachers t WHERE t.school_id = ? AND t.status = 'active' ORDER BY t.full_name",
    ).bind(auth.activeSchool).all();
    return json({ ...empty, teachers: results });
  }
  const teachers = await c.env.DB.prepare(
    "SELECT t.id, t.full_name, t.user_id FROM teachers t WHERE t.school_id = ? AND t.status = 'active' ORDER BY t.full_name",
  ).bind(auth.activeSchool).all();
  const feePlans = await c.env.DB.prepare('SELECT * FROM fee_plans WHERE school_id = ? AND active = 1').bind(auth.activeSchool).all();
  const classes = await c.env.DB.prepare(
    "SELECT DISTINCT class_name FROM students WHERE school_id = ? AND class_name != '' ORDER BY class_name",
  ).bind(auth.activeSchool).all();
  const parents = await c.env.DB.prepare(
    `SELECT DISTINCT p.id, p.full_name, p.email, p.phone FROM parents p JOIN parent_students ps ON ps.parent_id = p.id
     JOIN students s ON s.id = ps.student_id WHERE s.school_id = ? ORDER BY p.full_name LIMIT 500`,
  ).bind(auth.activeSchool).all();
  const students = await c.env.DB.prepare(
    "SELECT id, full_name, class_name, status FROM students WHERE school_id = ? AND status = 'active' ORDER BY full_name LIMIT 500",
  ).bind(auth.activeSchool).all();
  return json({
    teachers: teachers.results,
    feePlans: feePlans.results,
    classes: classes.results.map((r) => r.class_name),
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
