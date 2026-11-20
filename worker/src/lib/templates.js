// Global email notification templates (CR-PR 2026-11-20 CR-1/CR-2).
// Defaults live here. A row in `email_templates` overrides a default (text
// and/or on/off); deleting the row restores the default. Every email is sent
// in both languages: subject "BM / EN", body BM then EN.

const nl = (...lines) => lines.join('\n');

/**
 * key → { name, vars, locked?, subject_bm, subject_en, body_bm, body_en }.
 * `locked` templates (account and password emails) can be edited but not
 * switched off, so nobody is locked out.
 */
export const TEMPLATES = {
  account_welcome: {
    name: 'Akaun ibu bapa / asatizah dicipta / Parent or asatizah account created',
    vars: ['name', 'email', 'ic_masked', 'app_url'],
    locked: true,
    subject_bm: 'Akaun MDUIK dicipta',
    subject_en: 'MDUIK account created',
    body_bm: nl(
      'Akaun MDUIK anda telah dicipta.',
      'ID log masuk: {{email}} atau No. IC / Pasport anda ({{ic_masked}}).',
      'Kata laluan pertama ialah No. IC / Pasport anda tanpa ruang atau tanda sempang. Anda perlu menukarnya semasa log masuk pertama.',
      'Log masuk di {{app_url}}.',
    ),
    body_en: nl(
      'Your MDUIK account has been created.',
      'Login ID: {{email}} or your IC / Passport No. ({{ic_masked}}).',
      'Your first password is your IC / Passport No. without spaces or hyphens. You must change it when you first sign in.',
      'Sign in at {{app_url}}.',
    ),
  },
  account_welcome_no_ic: {
    name: 'Akaun dicipta tanpa IC / Account created without IC',
    vars: ['name', 'email', 'app_url'],
    locked: true,
    subject_bm: 'Akaun MDUIK dicipta',
    subject_en: 'MDUIK account created',
    body_bm: 'Akaun MDUIK anda telah dicipta. ID log masuk: {{email}}. Di {{app_url}}, pilih "Lupa kata laluan" untuk menetapkan kata laluan.',
    body_en: 'Your MDUIK account has been created. Login ID: {{email}}. At {{app_url}}, choose "Forgot password" to set your password.',
  },
  account_created: {
    name: 'Akaun pengguna dicipta / User account created',
    vars: ['name', 'email', 'app_url'],
    locked: true,
    subject_bm: 'Akaun MDUIK dicipta',
    subject_en: 'MDUIK account created',
    body_bm: 'Akaun anda telah dicipta. Log masuk di {{app_url}} dengan e-mel ini.',
    body_en: 'Your account has been created. Sign in at {{app_url}} with this email.',
  },
  school_admin_created: {
    name: 'Akaun Pentadbir Madrasah dicipta / Madrasah Admin account created',
    vars: ['name', 'madrasah', 'app_url'],
    locked: true,
    subject_bm: 'Akaun Pentadbir Madrasah',
    subject_en: 'Madrasah Admin account',
    body_bm: 'Akaun anda untuk {{madrasah}} telah dicipta. Log masuk di {{app_url}}.',
    body_en: 'Your account for {{madrasah}} has been created. Sign in at {{app_url}}.',
  },
  password_reset: {
    name: 'Tetapan semula kata laluan / Password reset',
    vars: ['link'],
    locked: true,
    subject_bm: 'Tetapan semula kata laluan',
    subject_en: 'Password reset',
    body_bm: 'Klik pautan ini untuk menetapkan semula kata laluan anda (sah 1 jam): {{link}}',
    body_en: 'Click this link to reset your password (valid 1 hour): {{link}}',
  },
  application_received_parent: {
    name: 'Permohonan diterima (ibu bapa) / Application received (parent)',
    vars: ['parent_name', 'student_name', 'madrasah', 'reference', 'status_url'],
    subject_bm: 'Permohonan diterima',
    subject_en: 'Application received — {{reference}}',
    body_bm: nl(
      'Assalamualaikum {{parent_name}},',
      'Terima kasih. Permohonan {{student_name}} ke {{madrasah}} telah diterima dan akan diproses.',
      'Nombor rujukan: {{reference}}',
      'Pihak madrasah akan menghubungi anda tentang langkah seterusnya, seperti temuduga. Semak status pada bila-bila masa di {{status_url}} dengan nombor rujukan dan alamat e-mel ini.',
    ),
    body_en: nl(
      'Dear {{parent_name}},',
      'Thank you. The application for {{student_name}} to {{madrasah}} has been received and will be processed.',
      'Reference number: {{reference}}',
      'The madrasah will contact you about the next step, such as an interview. You can check the status any time on {{status_url}} with your reference number and this email address.',
    ),
  },
  application_received_admin: {
    name: 'Permohonan baharu (pentadbir) / New application (admin)',
    vars: ['madrasah', 'reference', 'student_name', 'parent_name', 'status', 'link'],
    subject_bm: 'Permohonan baharu perlu tindakan',
    subject_en: 'New application needs your attention — {{reference}}',
    body_bm: nl(
      'Permohonan baharu diterima untuk {{madrasah}} dan memerlukan perhatian anda.',
      'Rujukan: {{reference}} · Pelajar: {{student_name}} · Ibu bapa: {{parent_name}} · Status: {{status}}',
      '{{link}}',
    ),
    body_en: nl(
      'A new application for {{madrasah}} has been received and needs your attention.',
      'Reference: {{reference}} · Student: {{student_name}} · Parent: {{parent_name}} · Status: {{status}}',
      '{{link}}',
    ),
  },
  interview_scheduled: {
    name: 'Temuduga dijadualkan (ibu bapa) / Interview scheduled (parent)',
    vars: ['reference', 'student_name', 'when', 'location'],
    subject_bm: 'Temuduga dijadualkan',
    subject_en: 'Interview scheduled — {{reference}}',
    body_bm: 'Temuduga untuk permohonan {{reference}} dijadualkan pada {{when}}. Lokasi: {{location}}.',
    body_en: 'Your interview for application {{reference}} is scheduled on {{when}}. Location: {{location}}.',
  },
  interview_assigned: {
    name: 'Temuduga ditugaskan (asatizah) / Interview assigned (asatizah)',
    vars: ['student_name', 'reference', 'when'],
    subject_bm: 'Temuduga ditugaskan',
    subject_en: 'Interview assigned — {{student_name}}',
    body_bm: 'Anda ditugaskan untuk menilai temuduga {{student_name}} ({{reference}}) pada {{when}}.',
    body_en: 'You are assigned to assess the interview of {{student_name}} ({{reference}}) on {{when}}.',
  },
  below_pass_mark: {
    name: 'Calon bawah markah lulus / Applicant below pass mark',
    vars: ['final_mark', 'student_name', 'reference'],
    subject_bm: 'Calon bawah markah lulus',
    subject_en: 'Applicant below pass mark — {{final_mark}}',
    body_bm: 'Markah akhir {{final_mark}}/100 untuk {{student_name}} ({{reference}}) berada di bawah markah lulus 40. Jawatankuasa perlu menimbang.',
    body_en: 'Final mark {{final_mark}}/100 for {{student_name}} ({{reference}}) is below the pass mark of 40. Committee review required.',
  },
  decision: {
    name: 'Keputusan permohonan / Application decision',
    vars: ['reference', 'student_name', 'decision_bm', 'decision_en', 'reason'],
    subject_bm: 'Keputusan permohonan',
    subject_en: 'Application decision — {{reference}}',
    body_bm: 'Keputusan telah direkodkan untuk permohonan {{reference}}: {{decision_bm}}. Sebab: {{reason}}.',
    body_en: 'A decision has been recorded for application {{reference}}: {{decision_en}}. Reason: {{reason}}.',
  },
  waiting_offer: {
    name: 'Tawaran senarai menunggu / Waiting list offer',
    vars: ['reference', 'student_name', 'deadline'],
    subject_bm: 'Tawaran senarai menunggu',
    subject_en: 'Waiting list offer — {{reference}}',
    body_bm: 'Tawaran tempat untuk {{student_name}}. Sila jawab sebelum {{deadline}} (7 hari kalendar). Jika tiada jawapan, tawaran akan luput.',
    body_en: 'A place is offered to {{student_name}}. Please respond by {{deadline}} (7 calendar days). If we do not hear from you, the offer will lapse.',
  },
  offer_response: {
    name: 'Jawapan tawaran (pentadbir) / Offer response (admin)',
    vars: ['reference', 'student_name', 'response_bm', 'response_en'],
    subject_bm: 'Jawapan tawaran',
    subject_en: 'Offer response — {{reference}}',
    body_bm: 'Pemohon {{student_name}} telah {{response_bm}} tawaran.',
    body_en: 'Applicant {{student_name}} has {{response_en}} the offer.',
  },
  offer_lapsed: {
    name: 'Tawaran luput (pentadbir) / Offer lapsed (admin)',
    vars: ['reference', 'student_name'],
    subject_bm: 'Tawaran luput',
    subject_en: 'Offer lapsed — {{reference}}',
    body_bm: 'Tawaran kepada {{student_name}} telah luput tanpa jawapan. Anda boleh menawarkan tempat kepada pemohon seterusnya.',
    body_en: 'The offer to {{student_name}} lapsed without a response. You may offer the place to the next applicant.',
  },
  arrears_registration: {
    name: 'Pendaftaran dengan tunggakan / Registration with arrears',
    vars: ['student_name', 'amount'],
    subject_bm: 'Pendaftaran dengan tunggakan',
    subject_en: 'Registration with arrears — {{student_name}}',
    body_bm: '{{student_name}} didaftarkan semula dengan tunggakan RM {{amount}}. Pendaftaran tidak disekat.',
    body_en: '{{student_name}} is being registered again with arrears of RM {{amount}}. Registration is not blocked.',
  },
  invoice_monthly: {
    name: 'Invois bulanan / Monthly invoice',
    vars: ['invoice_no', 'amount', 'student_name', 'due_date', 'month'],
    subject_bm: 'Invois baharu',
    subject_en: 'New invoice — {{month}}',
    body_bm: 'Invois {{invoice_no}} sebanyak RM {{amount}} telah dikeluarkan untuk {{student_name}}. Tarikh akhir: {{due_date}}.',
    body_en: 'Invoice {{invoice_no}} for RM {{amount}} has been issued for {{student_name}}. Due date: {{due_date}}.',
  },
  invoice_registration: {
    name: 'Invois yuran pendaftaran / Registration fee invoice',
    vars: ['invoice_no', 'amount', 'student_name', 'due_date', 'year'],
    subject_bm: 'Invois baharu',
    subject_en: 'New invoice — {{year}}',
    body_bm: 'Yuran pendaftaran {{year}} sebanyak RM {{amount}} telah dikenakan untuk {{student_name}}. Tarikh akhir: {{due_date}}.',
    body_en: 'The {{year}} registration fee of RM {{amount}} has been charged for {{student_name}}. Due date: {{due_date}}.',
  },
  payment_received: {
    name: 'Bayaran diterima / Payment received',
    vars: ['amount', 'student_name', 'receipt_no'],
    subject_bm: 'Bayaran diterima',
    subject_en: 'Payment received — {{receipt_no}}',
    body_bm: 'Bayaran RM {{amount}} telah diterima untuk {{student_name}}. Resit {{receipt_no}} boleh dimuat turun dari portal ibu bapa.',
    body_en: 'A payment of RM {{amount}} has been received for {{student_name}}. Receipt {{receipt_no}} is available in the parent portal.',
  },
  arrears_reminder_1: {
    name: 'Peringatan tunggakan (hari 3) / Arrears reminder (day 3)',
    vars: ['invoice_no', 'amount', 'due_date', 'student_name'],
    subject_bm: 'Peringatan tunggakan',
    subject_en: 'Arrears reminder — {{invoice_no}}',
    body_bm: 'Peringatan mesra: invois {{invoice_no}} sebanyak RM {{amount}} telah melepasi tarikh akhir {{due_date}}. Sila buat bayaran.',
    body_en: 'Friendly reminder: invoice {{invoice_no}} for RM {{amount}} is past its due date of {{due_date}}. Please make payment.',
  },
  arrears_reminder_2: {
    name: 'Peringatan tunggakan (hari 14) / Arrears reminder (day 14)',
    vars: ['invoice_no', 'amount', 'due_date', 'student_name'],
    subject_bm: 'Peringatan tunggakan',
    subject_en: 'Arrears reminder — {{invoice_no}}',
    body_bm: 'Notis kedua: invois {{invoice_no}} sebanyak RM {{amount}} masih belum dibayar (tarikh akhir {{due_date}}). Sila hubungi pihak madrasah.',
    body_en: 'Second notice: invoice {{invoice_no}} for RM {{amount}} remains unpaid (due {{due_date}}). Please contact the madrasah.',
  },
  arrears_review: {
    name: 'Notis rasmi menunggu semakan (bursar) / Formal notice awaiting review (bursar)',
    vars: ['invoice_no', 'student_name'],
    subject_bm: 'Semakan notis rasmi',
    subject_en: 'Formal notice review — {{invoice_no}}',
    body_bm: 'Notis formal untuk invois {{invoice_no}} ({{student_name}}) menunggu semakan Bursar sebelum dihantar.',
    body_en: 'Formal notice for invoice {{invoice_no}} ({{student_name}}) is awaiting Bursar review before sending.',
  },
  formal_notice: {
    name: 'Notis rasmi tunggakan / Formal arrears notice',
    vars: ['invoice_no', 'amount', 'due_date', 'student_name'],
    subject_bm: 'Notis rasmi',
    subject_en: 'Formal notice — {{invoice_no}}',
    body_bm: 'Notis rasmi: invois {{invoice_no}} sebanyak RM {{amount}} masih belum dibayar sejak {{due_date}}. Sila hubungi pihak madrasah segera.',
    body_en: 'Formal notice: invoice {{invoice_no}} for RM {{amount}} remains unpaid since {{due_date}}. Please contact the madrasah immediately.',
  },
  refund_approved: {
    name: 'Bayaran balik diluluskan / Refund approved',
    vars: ['amount', 'student_name'],
    subject_bm: 'Bayaran balik diluluskan',
    subject_en: 'Refund approved',
    body_bm: 'Bayaran balik RM {{amount}} untuk {{student_name}} telah diluluskan.',
    body_en: 'A refund of RM {{amount}} for {{student_name}} has been approved.',
  },
  fee_adjustment: {
    name: 'Pelarasan yuran diluluskan / Fee adjustment approved',
    vars: ['student_name', 'amount'],
    subject_bm: 'Pelarasan yuran diluluskan',
    subject_en: 'Fee adjustment approved',
    body_bm: 'Yuran bulanan untuk {{student_name}} telah diselaraskan kepada RM {{amount}} mulai invois akan datang.',
    body_en: 'The monthly fee for {{student_name}} has been adjusted to RM {{amount}} from future invoices.',
  },
  tracking_on: {
    name: 'Pemantauan yuran dihidupkan / Fee tracking on',
    vars: ['student_name', 'start_month'],
    subject_bm: 'Pemantauan yuran bulanan dihidupkan',
    subject_en: 'Monthly fee tracking switched on',
    body_bm: 'Pemantauan yuran bulanan untuk {{student_name}} telah dihidupkan. Invois bulanan pertama akan dijana pada 1 {{start_month}}.',
    body_en: 'Monthly fee tracking for {{student_name}} is switched on. The first monthly invoice will be generated on 1 {{start_month}}.',
  },
  tracking_off: {
    name: 'Pemantauan yuran dimatikan / Fee tracking off',
    vars: ['student_name'],
    subject_bm: 'Pemantauan yuran bulanan dimatikan',
    subject_en: 'Monthly fee tracking switched off',
    body_bm: 'Pemantauan yuran bulanan untuk {{student_name}} telah dimatikan. Tiada invois bulanan baharu akan dijana; invois sedia ada masih perlu dibayar.',
    body_en: 'Monthly fee tracking for {{student_name}} is switched off. No new monthly invoices will be generated; existing invoices remain payable.',
  },
};

export const TEXT_FIELDS = ['subject_bm', 'subject_en', 'body_bm', 'body_en'];

export function fill(text, vars = {}) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

/** Placeholders used in a text that the template does not offer. */
export function unknownVars(text, allowed) {
  const found = [...String(text || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((v) => !allowed.includes(v)))];
}

/** The effective template: the default merged with any stored override. */
export async function getTemplate(db, key) {
  const def = TEMPLATES[key];
  if (!def) return null;
  let row = null;
  try {
    row = await db.prepare('SELECT * FROM email_templates WHERE key = ?').bind(key).first();
  } catch {
    row = null; // table not created yet
  }
  const out = { key, ...def, enabled: true, customised: false, updated_at: null, updated_by: null };
  if (row) {
    for (const f of TEXT_FIELDS) if (row[f]) out[f] = row[f];
    out.enabled = def.locked ? true : row.enabled !== 0;
    out.customised = TEXT_FIELDS.some((f) => row[f]);
    out.updated_at = row.updated_at;
    out.updated_by = row.updated_by;
  }
  return out;
}

/** Subject "BM / EN" and body BM then EN, with placeholders filled. */
export function renderTemplate(tpl, vars = {}) {
  const sBm = fill(tpl.subject_bm, vars).trim();
  const sEn = fill(tpl.subject_en, vars).trim();
  const bBm = fill(tpl.body_bm, vars).trim();
  const bEn = fill(tpl.body_en, vars).trim();
  return {
    subject: [sBm, sEn].filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).join(' / '),
    body: [bBm, bEn].filter(Boolean).join('\n\n'),
  };
}

export const rm = (cents) => (Number(cents || 0) / 100).toFixed(2);
