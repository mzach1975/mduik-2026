import { Hono } from 'hono';
import { encryptIc, hashIc } from '../lib/auth.js';
import { id, nowIso, today, readJson, bad, json, yearOf, validIc } from '../lib/util.js';
import { nextNumber } from '../lib/finance.js';
import { notify, notifyRoles, subjectFor } from '../lib/notify.js';
import { auditSystem } from '../lib/audit.js';

const pub = new Hono();

pub.get('/schools', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, short_name, category, state, logo_url, monthly_fee_cents, registration_fee_cents,
      payment_instructions_bm, payment_instructions_en, bank_name, bank_account
     FROM schools WHERE status = 'active' ORDER BY name`,
  ).all();
  return json({ schools: results });
});

pub.get('/schools/:id', async (c) => {
  const school = await c.env.DB.prepare(
    `SELECT id, name, short_name, category, state, address, phone, email, logo_url, monthly_fee_cents,
      registration_fee_cents, payment_instructions_bm, payment_instructions_en, bank_name, bank_account
     FROM schools WHERE id = ? AND status = 'active'`,
  )
    .bind(c.req.param('id'))
    .first();
  if (!school) return bad('Sekolah tidak dijumpai. / School not found.', 404);
  return json({ school });
});

// Applicants must be at least 7 years old; there is no maximum age.
export const MIN_AGE = 7;

function calculateAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function schoolCode(school) {
  const parts = String(school.short_name || school.name || 'SCH')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const code = (parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'SCH').slice(0, 4);
  return code.padEnd(2, 'X');
}

pub.post('/applications', async (c) => {
  const body = await readJson(c);
  const required = ['schoolId', 'studentName', 'ic', 'dob', 'gender', 'parentName', 'parentEmail', 'parentPhone', 'reason', 'education'];
  const missing = required.filter((f) => !body[f] || String(body[f]).trim() === '');
  if (!body.consent) missing.push('consent');
  const school = await c.env.DB.prepare("SELECT * FROM schools WHERE id = ? AND status = 'active'").bind(body.schoolId).first();
  if (!school) return bad('Sekolah tidak dijumpai. / School not found.', 404);
  // The form no longer asks for a category: the school's category is used.
  const category = ['tahfiz', 'islamic_studies'].includes(school.category)
    ? school.category
    : ['tahfiz', 'islamic_studies'].includes(body.category) ? body.category : 'tahfiz';
  const age = calculateAge(body.dob);
  const ageEligible = age !== null && age >= MIN_AGE;
  // Student phone and email are not collected; contact goes to the parent.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.parentEmail || ''));
  if (body.ic && !validIc(body.ic)) {
    return bad('No. IC / Pasport tidak sah (5–20 huruf atau angka). / Invalid IC / Passport No. (5–20 letters or digits).', 400, { code: 'ic_invalid' });
  }
  const requested = Array.isArray(body.documents)
    ? [...new Set(body.documents.filter((d) => typeof d === 'string' && d.length <= 80))].slice(0, 10)
    : [];
  // Supporting documents are mandatory: at least one unclaimed upload.
  const documents = [];
  for (const docId of requested) {
    const doc = await c.env.DB.prepare("SELECT id FROM documents WHERE id = ? AND owner_type = 'application_draft' AND owner_id = 'draft'")
      .bind(docId)
      .first();
    if (doc) documents.push(docId);
  }
  if (!documents.length) {
    return bad(
      'Sila muat naik dokumen sokongan (Sijil Lahir / MyKad / MyKid / Pasport pelajar dan MyKad / Pasport ibu bapa). / Please upload the supporting documents (student’s Birth Cert / MyKad / MyKid / Passport and parents’ MyKad / Passport).',
      400,
      { code: 'documents_required' },
    );
  }
  const flags = {
    missingFields: missing,
    ageEligible,
    age,
    categorySelected: true,
    documentsUploaded: documents.length > 0,
    consent: !!body.consent,
    emailValid,
  };
  const incomplete = missing.length > 0 || !ageEligible || !emailValid;
  const ic = body.ic ? await encryptIc(c.env, body.ic) : { enc: null, hash: null, masked: null };
  const reference = await nextNumber(c.env, school.id, 'application', `APP-${schoolCode(school)}`, yearOf(today()));
  const appId = id('app');
  const status = incomplete ? 'incomplete' : 'submitted';
  await c.env.DB.prepare(
    `INSERT INTO applications (id, school_id, reference, category, student_name, ic_masked, ic_hash, ic_enc, dob, gender, address,
      education, reason, parent_name, parent_email, parent_phone, language, status, flags, documents, submitted_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      appId,
      school.id,
      reference,
      category,
      String(body.studentName).slice(0, 160),
      ic.masked,
      ic.hash,
      ic.enc,
      body.dob,
      body.gender,
      String(body.address || '').slice(0, 400),
      String(body.education || '').slice(0, 600),
      String(body.reason || '').slice(0, 1200),
      String(body.parentName).slice(0, 160),
      String(body.parentEmail).slice(0, 160),
      String(body.parentPhone).slice(0, 40),
      body.language === 'en' ? 'en' : 'bm',
      status,
      JSON.stringify(flags),
      JSON.stringify(documents),
      nowIso(),
      nowIso(),
    )
    .run();
  for (const docId of documents) {
    // Claim only unclaimed drafts, and tie them to the school so tenant checks apply.
    await c.env.DB.prepare(
      "UPDATE documents SET owner_id = ?, owner_type = 'application', school_id = ? WHERE id = ? AND owner_type = 'application_draft' AND owner_id = 'draft'",
    )
      .bind(appId, school.id, docId)
      .run();
  }
  const lang = body.language === 'en' ? 'en' : 'bm';
  await notify(c.env, {
    schoolId: school.id,
    email: body.parentEmail,
    name: body.parentName,
    type: 'application_received',
    subject: `${subjectFor('application_received', lang)} — ${reference}`,
    body:
      lang === 'en'
        ? [
            `Dear ${body.parentName},`,
            `Thank you. The application for ${body.studentName} to ${school.name} has been received and will be processed.`,
            `Reference number: ${reference}`,
            `The school will contact you about the next step, such as an interview. You can check the status any time on ${c.env.APP_URL || ''}/status with your reference number and this email address.`,
          ].join('\n')
        : [
            `Assalamualaikum ${body.parentName},`,
            `Terima kasih. Permohonan ${body.studentName} ke ${school.name} telah diterima dan akan diproses.`,
            `Nombor rujukan: ${reference}`,
            `Pihak sekolah akan menghubungi anda tentang langkah seterusnya, seperti temuduga. Semak status pada bila-bila masa di ${c.env.APP_URL || ''}/status dengan nombor rujukan dan alamat e-mel ini.`,
          ].join('\n'),
    language: lang,
  });
  const adminNotice = {
    type: 'application_received',
    subject: `Permohonan baharu perlu tindakan / New application needs your attention — ${reference}`,
    body: [
      `Permohonan baharu diterima untuk ${school.name} dan memerlukan perhatian anda.`,
      `Rujukan: ${reference} · Pelajar: ${body.studentName} · Ibu bapa: ${body.parentName} · Status: ${status}`,
      `A new application for ${school.name} has been received and needs your attention.`,
      `Reference: ${reference} · Student: ${body.studentName} · Parent: ${body.parentName} · Status: ${status}`,
      `${c.env.APP_URL || ''}/app/applications/${appId}`,
    ].join('\n'),
    language: 'bm',
  };
  await notifyRoles(c.env, school.id, ['school_admin'], adminNotice);
  // Also the school's own contact address, unless a School Admin already uses it.
  const schoolEmail = String(school.email || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolEmail)) {
    const isAdmin = await c.env.DB.prepare(
      `SELECT 1 AS ok FROM users u JOIN user_roles ur ON ur.user_id = u.id
       WHERE lower(u.email) = lower(?) AND ur.school_id = ? AND ur.role = 'school_admin' AND ur.status = 'active' AND u.status = 'active'`,
    )
      .bind(schoolEmail, school.id)
      .first();
    if (!isAdmin) await notify(c.env, { schoolId: school.id, email: schoolEmail, name: school.name, ...adminNotice });
  }
  await auditSystem(c.env, 'submit', 'application', appId, { reference, incomplete, schoolId: school.id }, school.id);
  return json({ reference, id: appId, status, flags }, 201);
});

pub.get('/applications/status', async (c) => {
  const reference = String(c.req.query('reference') || '').trim();
  const contact = String(c.req.query('contact') || '').trim().toLowerCase();
  if (!reference || !contact) return bad('Nombor rujukan dan e-mel/nombor telefon diperlukan. / Reference and email/phone are required.');
  // Phone numbers match without spaces, hyphens, brackets or a leading +.
  const phone = contact.replace(/[\s\-()+]/g, '');
  const app = await c.env.DB.prepare(
    `SELECT a.*, s.name AS school_name, s.phone AS school_phone, s.email AS school_email
     FROM applications a JOIN schools s ON s.id = a.school_id
     WHERE upper(a.reference) = upper(?)
       AND (lower(a.parent_email) = ?
         OR (? <> '' AND replace(replace(replace(replace(replace(a.parent_phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?))`,
  )
    .bind(reference, contact, phone, phone)
    .first();
  if (!app) return bad('Tiada permohonan sepadan. / No matching application.', 404);
  const interview = await c.env.DB.prepare('SELECT scheduled_at, mode, location, status FROM interviews WHERE application_id = ? ORDER BY scheduled_at DESC LIMIT 1')
    .bind(app.id)
    .first();
  const decision = await c.env.DB.prepare('SELECT decision, reason, decided_at FROM decisions WHERE application_id = ? ORDER BY decided_at DESC LIMIT 1')
    .bind(app.id)
    .first();
  await auditSystem(c.env, 'status_check', 'application', app.id, { reference }, app.school_id);
  return json({
    application: {
      reference: app.reference,
      studentName: app.student_name,
      status: app.status,
      category: app.category,
      schoolName: app.school_name,
      schoolPhone: app.school_phone || null,
      schoolEmail: app.school_email || null,
      documentsCount: (() => {
        try {
          return JSON.parse(app.documents || '[]').length;
        } catch {
          return 0;
        }
      })(),
      submittedAt: app.submitted_at,
      offerStatus: app.offer_status,
      offerDeadline: app.offer_deadline,
      interview: interview || null,
      decision: decision ? { decision: decision.decision, reason: decision.reason, decidedAt: decision.decided_at } : null,
      flags: app.flags ? JSON.parse(app.flags) : null,
    },
  });
});

pub.post('/documents', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return bad('Fail diperlukan. / File is required.');
  if (file.size > 4 * 1024 * 1024) return bad('Saiz fail melebihi 4MB. / File exceeds 4MB.');
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) return bad('Jenis fail tidak dibenarkan. / File type not allowed.');
  const docId = id('doc');
  const buffer = await file.arrayBuffer();
  let r2Key = null;
  if (c.env.BUCKET) {
    r2Key = `uploads/${new Date().toISOString().slice(0, 7)}/${docId}-${String(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await c.env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: file.type } });
  }
  const dataB64 = c.env.BUCKET ? null : (() => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  })();
  await c.env.DB.prepare(
    'INSERT INTO documents (id, school_id, owner_type, owner_id, filename, content_type, size, r2_key, data_b64, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(docId, null, 'application_draft', 'draft', String(file.name).slice(0, 200), file.type, file.size, r2Key, dataB64, nowIso())
    .run();
  return json({ id: docId, filename: file.name, size: file.size }, 201);
});

pub.get('/announcements', async (c) => {
  const requested = Number.parseInt(c.req.query('limit') || '6', 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 20) : 6;
  const day = today();
  const { results } = await c.env.DB.prepare(
    `SELECT id, title_bm, title_en, body_bm, body_en, category, link_url, link_label_bm, link_label_en,
      starts_at, ends_at, is_pinned, created_at
     FROM announcements
     WHERE status = 'published'
       AND (starts_at IS NULL OR starts_at <= ?)
       AND (ends_at IS NULL OR ends_at >= ?)
     ORDER BY is_pinned DESC, COALESCE(starts_at, created_at) DESC
     LIMIT ?`,
  )
    .bind(day, day, limit)
    .all();
  return json({ announcements: results });
});

pub.get('/health', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM schools').first();
  return json({ ok: true, schools: row.n, time: nowIso(), r2: !!c.env.BUCKET, email: !!c.env.EMAIL });
});

export default pub;
