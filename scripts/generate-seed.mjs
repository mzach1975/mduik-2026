// Generates seed.sql with PBKDF2 password hashes and AES-GCM encrypted ICs
// that match the Worker's runtime crypto. Run: node scripts/generate-seed.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2Sync, randomBytes, createCipheriv, createHash } from 'node:crypto';

const vars = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const IC_KEY = vars.IC_KEY;
const IC_PEPPER = vars.IC_PEPPER;

function hashPassword(password) {
  const salt = randomBytes(16);
  const bits = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return `pbkdf2$100000$${salt.toString('base64')}$${bits.toString('base64')}`;
}

function encryptIc(ic) {
  const digits = String(ic).replace(/\D/g, '');
  const key = createHash('sha256').update(IC_KEY).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, enc, tag]);
  return {
    enc: combined.toString('base64'),
    hash: createHash('sha256').update(`${IC_PEPPER}${digits}`).digest('hex'),
    masked: `******-**-${digits.slice(-4)}`,
  };
}

const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const out = [];
const ins = (table, obj) => {
  out.push(`INSERT INTO ${table} (${Object.keys(obj).join(', ')}) VALUES (${Object.values(obj).map(q).join(', ')});`);
};

const NOW = '2026-11-02T08:00:00.000Z';
const YEAR = 2026;
const PWD = 'Mduik@2026';
const SUPER_PWD = 'Admin@12345';

out.push('-- MDUIK demo seed data (generated). Do not run twice without resetting the schema.');
out.push('PRAGMA foreign_keys = OFF;');

/* ------------------------------- Schools ------------------------------- */
const schools = [
  {
    id: 'sch_tahfiz',
    name: 'MDUIK Tahfiz Kuala Lumpur',
    short_name: 'MDUIK KL',
    slug: 'mduik-tahfiz-kl',
    category: 'tahfiz',
    state: 'W.P. Kuala Lumpur',
    address: 'No. 12, Jalan Ilmu, Taman Ilmu, 50480 Kuala Lumpur',
    phone: '+603-6201 8890',
    email: 'info@mduik-tahfiz.edu.my',
    monthly_due_day: 7,
    reg_gen_month: 1,
    reg_gen_day: 2,
    reg_due_month: 1,
    reg_due_day: 31,
    monthly_fee_cents: 18000,
    registration_fee_cents: 25000,
    bank_name: 'Bank Islam Malaysia Berhad',
    bank_account: '1402 8010 2345 67',
    invoice_prefix: 'INV',
    receipt_prefix: 'RCP',
    code: 'TAH',
  },
  {
    id: 'sch_islam',
    name: 'MDUIK Pengajian Islam Shah Alam',
    short_name: 'MDUIK SA',
    slug: 'mduik-pengajian-islam-sa',
    category: 'islamic_studies',
    state: 'Selangor',
    address: 'Lot 8, Jalan Pendidikan, Seksyen 14, 40000 Shah Alam, Selangor',
    phone: '+603-5510 2233',
    email: 'info@mduik-sa.edu.my',
    monthly_due_day: 10,
    reg_gen_month: 1,
    reg_gen_day: 2,
    reg_due_month: 1,
    reg_due_day: 31,
    monthly_fee_cents: 15000,
    registration_fee_cents: 20000,
    bank_name: 'Bank Muamalat Malaysia Berhad',
    bank_account: '0301 0022 3344 55',
    invoice_prefix: 'INV',
    receipt_prefix: 'RCP',
    code: 'ISL',
  },
];
for (const s of schools) {
  ins('schools', {
    id: s.id,
    name: s.name,
    short_name: s.short_name,
    slug: s.slug,
    category: s.category,
    state: s.state,
    address: s.address,
    phone: s.phone,
    email: s.email,
    logo_url: '',
    monthly_due_day: s.monthly_due_day,
    reg_gen_month: s.reg_gen_month,
    reg_gen_day: s.reg_gen_day,
    reg_due_month: s.reg_due_month,
    reg_due_day: s.reg_due_day,
    monthly_fee_cents: s.monthly_fee_cents,
    registration_fee_cents: s.registration_fee_cents,
    bank_name: s.bank_name,
    bank_account: s.bank_account,
    payment_instructions_bm:
      'Sila buat pindahan bank ke akaun sekolah di atas dan muat naik bukti pembayaran melalui portal ibu bapa. Sertakan nama pelajar sebagai rujukan.',
    payment_instructions_en:
      'Please bank transfer to the school account above and upload proof of payment through the parent portal. Include the student name as reference.',
    invoice_prefix: s.invoice_prefix,
    receipt_prefix: s.receipt_prefix,
    status: 'active',
    created_at: NOW,
  });
}

/* ------------------------------- Fee plans ----------------------------- */
const plans = [
  { id: 'fee_tahfiz_std', school: 'sch_tahfiz', name: 'Tahfiz Standard', monthly: 18000, reg: 25000 },
  { id: 'fee_tahfiz_hifz', school: 'sch_tahfiz', name: 'Tahfiz Hifz', monthly: 22000, reg: 25000 },
  { id: 'fee_islam_std', school: 'sch_islam', name: 'Pengajian Islam Standard', monthly: 15000, reg: 20000 },
];
for (const p of plans) {
  ins('fee_plans', {
    id: p.id,
    school_id: p.school,
    name: p.name,
    monthly_fee_cents: p.monthly,
    registration_fee_cents: p.reg,
    active: 1,
    created_at: NOW,
  });
}

/* -------------------------------- Users -------------------------------- */
const users = [
  { id: 'u_super', email: 'super@mduik.my', name: 'Dato’ Zakaria bin Alli', role: 'super_admin', school: null, password: SUPER_PWD, ic: '780203085512', phone: '019-200 1122' },
  { id: 'u_admin1', email: 'admin.tahfiz@mduik.my', name: 'Ustazah Nurul Huda binti Kamal', role: 'school_admin', school: 'sch_tahfiz', password: PWD, ic: '820304145533', phone: '013-410 5566' },
  { id: 'u_admin2', email: 'admin.islam@mduik.my', name: 'Ustaz Ahmad Firdaus bin Rahmat', role: 'school_admin', school: 'sch_islam', password: PWD, ic: '830506085544', phone: '012-770 8899' },
  { id: 'u_bursar1', email: 'bendahari@mduik.my', name: 'Puan Siti Mariam binti Osman', role: 'bursar', school: 'sch_tahfiz', password: PWD, ic: '860708105555', phone: '017-332 4455' },
  { id: 'u_guru1', email: 'guru1@mduik.my', name: 'Ustaz Hafiz bin Salleh', role: 'teacher', school: 'sch_tahfiz', password: PWD, ic: '880910145566', phone: '011-2233 4455' },
  { id: 'u_guru2', email: 'guru2@mduik.my', name: 'Ustazah Aminah binti Yusof', role: 'teacher', school: 'sch_tahfiz', password: PWD, ic: '891112085577', phone: '011-3344 5566' },
  { id: 'u_parent1', email: 'ibubapa@mduik.my', name: 'Encik Hassan bin Abdullah', role: 'parent', school: 'sch_tahfiz', password: PWD, ic: '850101145566', phone: '012-345 6789' },
];
for (const u of users) {
  const ic = encryptIc(u.ic);
  ins('users', {
    id: u.id,
    email: u.email,
    full_name: u.name,
    ic_hash: ic.hash,
    ic_enc: ic.enc,
    ic_masked: ic.masked,
    phone: u.phone,
    password_hash: hashPassword(u.password),
    language: u.role === 'parent' ? 'bm' : 'bm',
    status: 'active',
    parent_id: u.id === 'u_parent1' ? 'par1' : null,
    created_at: NOW,
  });
  ins('user_roles', {
    id: `url_${u.id}`,
    user_id: u.id,
    school_id: u.school,
    role: u.role,
    started_at: '2025-12-01',
    status: 'active',
  });
}
// Teacher and parent are members of both schools (context switching).
ins('user_roles', { id: 'url_guru1_s2', user_id: 'u_guru1', school_id: 'sch_islam', role: 'teacher', started_at: '2026-03-01', status: 'active' });
ins('user_roles', { id: 'url_parent_s2', user_id: 'u_parent1', school_id: 'sch_islam', role: 'parent', started_at: '2026-01-05', status: 'active' });

/* ------------------------------- Parents ------------------------------- */
const parents = [
  { id: 'par1', name: 'Encik Hassan bin Abdullah', email: 'ibubapa@mduik.my', phone: '012-345 6789', user: 'u_parent1', address: 'No. 8, Jalan Seri Damai, 50480 Kuala Lumpur' },
  { id: 'par2', name: 'Puan Rahimah binti Salleh', email: 'rahimah@example.my', phone: '013-222 3344', user: null, address: 'Jalan Ampang, Kuala Lumpur' },
  { id: 'par3', name: 'Encik Omar bin Yusof', email: 'omar@example.my', phone: '012-888 7766', user: null, address: 'Setapak, Kuala Lumpur' },
  { id: 'par4', name: 'Encik Yusof bin Ahmad', email: 'yusof@example.my', phone: '019-777 6655', user: null, address: 'Gombak, Selangor' },
  { id: 'par5', name: 'Puan Salmah binti Isa', email: 'salmah@example.my', phone: '017-555 4433', user: null, address: 'Shah Alam, Selangor' },
  { id: 'par6', name: 'Encik Azhar bin Kamal', email: 'azhar@example.my', phone: '016-444 3322', user: null, address: 'Klang, Selangor' },
];
for (const p of parents) {
  ins('parents', {
    id: p.id,
    full_name: p.name,
    email: p.email,
    phone: p.phone,
    ic_masked: null,
    address: p.address,
    user_id: p.user,
    created_at: NOW,
  });
}

/* ------------------------------ Teachers ------------------------------- */
const teachers = [
  { id: 'tch_guru1_s1', school: 'sch_tahfiz', user: 'u_guru1', name: 'Ustaz Hafiz bin Salleh', email: 'guru1@mduik.my', phone: '011-2233 4455' },
  { id: 'tch_guru1_s2', school: 'sch_islam', user: 'u_guru1', name: 'Ustaz Hafiz bin Salleh', email: 'guru1@mduik.my', phone: '011-2233 4455' },
  { id: 'tch_guru2_s1', school: 'sch_tahfiz', user: 'u_guru2', name: 'Ustazah Aminah binti Yusof', email: 'guru2@mduik.my', phone: '011-3344 5566' },
  { id: 'tch_guru3_s1', school: 'sch_tahfiz', user: null, name: 'Ustaz Kamarul bin Azman', email: 'kamarul@mduik.my', phone: '013-998 8776' },
];
for (const t of teachers) {
  ins('teachers', {
    id: t.id,
    school_id: t.school,
    user_id: t.user,
    full_name: t.name,
    email: t.email,
    phone: t.phone,
    ic_masked: '******-**-7788',
    status: 'active',
    created_at: NOW,
  });
}

/* ------------------------------ Students ------------------------------- */
const students = [
  { id: 'st1', school: 'sch_tahfiz', name: 'Ahmad Zaki bin Hassan', ic: '150301145521', dob: '2015-03-01', gender: 'male', cls: 'Tahfiz 1', plan: 'fee_tahfiz_std', fee: 18000, tracking: 1, start: '2026-07', status: 'active', parent: 'par1', phone: '012-345 6789', email: 'ibubapa@mduik.my' },
  { id: 'st2', school: 'sch_tahfiz', name: 'Nur Aisyah binti Rahim', ic: '140512085522', dob: '2014-05-12', gender: 'female', cls: 'Tahfiz 1', plan: 'fee_tahfiz_std', fee: 18000, tracking: 1, start: '2026-07', status: 'active', parent: 'par2' },
  { id: 'st3', school: 'sch_tahfiz', name: 'Muhammad Faiz bin Omar', ic: '130822145523', dob: '2013-08-22', gender: 'male', cls: 'Tahfiz 2', plan: 'fee_tahfiz_hifz', fee: 22000, tracking: 1, start: '2026-06', status: 'active', parent: 'par3' },
  { id: 'st4', school: 'sch_tahfiz', name: 'Siti Khadijah binti Yusof', ic: '140119085524', dob: '2014-01-19', gender: 'female', cls: 'Tahfiz 2', plan: 'fee_tahfiz_std', fee: 18000, tracking: 0, start: null, status: 'active', parent: 'par4' },
  { id: 'st5', school: 'sch_tahfiz', name: 'Abdullah bin Ismail', ic: '120730145525', dob: '2012-07-30', gender: 'male', cls: 'Iqra 1', plan: 'fee_tahfiz_std', fee: 18000, tracking: 1, start: '2026-07', status: 'active', parent: 'par5' },
  { id: 'st6', school: 'sch_tahfiz', name: 'Aiman Hakim bin Roslan', ic: '131105145526', dob: '2013-11-05', gender: 'male', cls: 'Iqra 1', plan: 'fee_tahfiz_std', fee: 18000, tracking: 1, start: '2026-07', status: 'active', parent: 'par2' },
  { id: 'st7', school: 'sch_tahfiz', name: 'Nurul Iman binti Salleh', ic: '120215085527', dob: '2012-02-15', gender: 'female', cls: 'Tahfiz 3', plan: 'fee_tahfiz_hifz', fee: 22000, tracking: 1, start: '2026-07', status: 'active', parent: 'par2' },
  { id: 'st8', school: 'sch_tahfiz', name: 'Umar bin Abdul Rahman', ic: '140608145528', dob: '2014-06-08', gender: 'male', cls: 'Tahfiz 3', plan: 'fee_tahfiz_std', fee: 18000, tracking: 0, start: null, status: 'withdrawn', parent: 'par3' },
  { id: 'st9', school: 'sch_tahfiz', name: 'Khadijah binti Musa', ic: '100304085529', dob: '2010-03-04', gender: 'female', cls: 'Tahfiz 3', plan: 'fee_tahfiz_std', fee: 18000, tracking: 0, start: null, status: 'graduated', parent: 'par4' },
  { id: 'st10', school: 'sch_tahfiz', name: 'Harith bin Zulkifli', ic: '150910145530', dob: '2015-09-10', gender: 'male', cls: 'Iqra 2', plan: 'fee_tahfiz_std', fee: 18000, tracking: 0, start: null, status: 'active', parent: 'par6' },
  { id: 'st11', school: 'sch_islam', name: 'Muhammad Danial bin Hassan', ic: '120924145531', dob: '2012-09-24', gender: 'male', cls: 'Pengajian Islam 1', plan: 'fee_islam_std', fee: 15000, tracking: 1, start: '2026-07', status: 'active', parent: 'par1', phone: '012-345 6789', email: 'ibubapa@mduik.my' },
  { id: 'st12', school: 'sch_islam', name: 'Alya binti Rahman', ic: '131212085532', dob: '2013-12-12', gender: 'female', cls: 'Pengajian Islam 1', plan: 'fee_islam_std', fee: 15000, tracking: 1, start: '2026-07', status: 'active', parent: 'par5' },
  { id: 'st13', school: 'sch_islam', name: 'Amir bin Hamzah', ic: '121018145533', dob: '2012-10-18', gender: 'male', cls: 'Pengajian Islam 2', plan: 'fee_islam_std', fee: 15000, tracking: 1, start: '2026-06', status: 'active', parent: 'par6' },
  { id: 'st14', school: 'sch_islam', name: 'Husna binti Latif', ic: '140315085534', dob: '2014-03-15', gender: 'female', cls: 'Pengajian Islam 1', plan: 'fee_islam_std', fee: 15000, tracking: 0, start: null, status: 'active', parent: 'par5' },
  { id: 'st15', school: 'sch_islam', name: 'Zaid bin Nasir', ic: '130726145535', dob: '2013-07-26', gender: 'male', cls: 'Pengajian Islam 2', plan: 'fee_islam_std', fee: 15000, tracking: 1, start: '2026-07', status: 'active', parent: 'par3' },
  { id: 'st16', school: 'sch_islam', name: 'Maryam binti Isa', ic: '120503085536', dob: '2012-05-03', gender: 'female', cls: 'Pengajian Islam 2', plan: 'fee_islam_std', fee: 15000, tracking: 1, start: '2026-07', status: 'active', parent: 'par5' },
  { id: 'st17', school: 'sch_islam', name: 'Luqman bin Idris', ic: '140811145537', dob: '2014-08-11', gender: 'male', cls: 'Pengajian Islam 1', plan: 'fee_islam_std', fee: 15000, tracking: 1, start: '2026-07', status: 'withdrawn', parent: 'par6' },
];
for (const s of students) {
  const ic = encryptIc(s.ic);
  ins('students', {
    id: s.id,
    school_id: s.school,
    full_name: s.name,
    ic_hash: ic.hash,
    ic_enc: ic.enc,
    ic_masked: ic.masked,
    dob: s.dob,
    gender: s.gender,
    class_name: s.cls,
    address: 'Kuala Lumpur',
    phone: s.phone || '',
    email: s.email || '',
    fee_plan_id: s.plan,
    monthly_fee_cents: s.fee,
    monthly_tracking: s.tracking,
    tracking_start: s.start,
    reminders_enabled: 1,
    status: s.status,
    application_id: s.id === 'st4' ? 'app6' : null,
    created_at: '2026-01-05T02:00:00.000Z',
  });
  ins('parent_students', { id: `ps_${s.id}`, parent_id: s.parent, student_id: s.id, relationship: 'guardian' });
}

/* ----------------------------- Applications ---------------------------- */
const applications = [
  { id: 'app1', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00001', name: 'Amira binti Hassan', parent: 'par1', pname: 'Encik Hassan bin Abdullah', pemail: 'ibubapa@mduik.my', pphone: '012-345 6789', status: 'submitted', dob: '2016-04-12', gender: 'female', cat: 'tahfiz', flags: '{}', submitted: '2026-10-28T03:10:00.000Z' },
  { id: 'app2', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00002', name: 'Yusuf bin Rahim', parent: 'par2', pname: 'Puan Rahimah binti Salleh', pemail: 'rahimah@example.my', pphone: '013-222 3344', status: 'accepted', dob: '2013-02-19', gender: 'male', cat: 'tahfiz', flags: '{}', submitted: '2026-10-05T02:00:00.000Z' },
  { id: 'app3', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00003', name: 'Aisyah Humaira binti Kamal', parent: 'par6', pname: 'Encik Azhar bin Kamal', pemail: 'azhar@example.my', pphone: '016-444 3322', status: 'waiting_list', dob: '2012-11-30', gender: 'female', cat: 'tahfiz', flags: '{}', submitted: '2026-10-08T04:20:00.000Z', offer: 'offered', deadline: '2026-11-06' },
  { id: 'app4', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00004', name: 'Zulkarnain bin Hamid', parent: 'par3', pname: 'Encik Omar bin Yusof', pemail: 'omar@example.my', pphone: '012-888 7766', status: 'not_accepted', dob: '2011-07-07', gender: 'male', cat: 'tahfiz', flags: '{}', submitted: '2026-09-14T01:00:00.000Z' },
  { id: 'app5', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00005', name: 'Muhammad Adam bin Roslan', parent: 'par2', pname: 'Puan Rahimah binti Salleh', pemail: 'rahimah@example.my', pphone: '013-222 3344', status: 'interview', dob: '2014-06-21', gender: 'male', cat: 'tahfiz', flags: '{}', submitted: '2026-10-19T06:45:00.000Z' },
  { id: 'app6', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00006', name: 'Siti Khadijah binti Yusof', parent: 'par4', pname: 'Encik Yusof bin Ahmad', pemail: 'yusof@example.my', pphone: '019-777 6655', status: 'registered', dob: '2014-01-19', gender: 'female', cat: 'tahfiz', flags: '{}', submitted: '2026-01-03T02:30:00.000Z' },
  { id: 'app7', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00007', name: 'Ismail bin Musa', parent: 'par3', pname: 'Encik Omar bin Yusof', pemail: 'omar@example.my', pphone: '012-888 7766', status: 'incomplete', dob: '2015-12-01', gender: 'male', cat: 'tahfiz', flags: '{"missingFields":["consent"],"ageEligible":true,"age":10,"categorySelected":true,"documentsUploaded":false,"consent":false,"emailValid":true}', submitted: '2026-10-30T08:00:00.000Z' },
  { id: 'app8', school: 'sch_tahfiz', code: 'TAH', ref: 'APP-KL/2026/00008', name: 'Hana binti Salim', parent: 'par5', pname: 'Puan Salmah binti Isa', pemail: 'salmah@example.my', pphone: '017-555 4433', status: 'accepted', dob: '2012-03-17', gender: 'female', cat: 'tahfiz', flags: '{}', submitted: '2026-09-02T03:00:00.000Z' },
  { id: 'app9', school: 'sch_islam', code: 'ISL', ref: 'APP-SA/2026/00001', name: 'Rania binti Azhar', parent: 'par6', pname: 'Encik Azhar bin Kamal', pemail: 'azhar@example.my', pphone: '016-444 3322', status: 'submitted', dob: '2016-08-08', gender: 'female', cat: 'islamic_studies', flags: '{}', submitted: '2026-10-31T01:15:00.000Z' },
  { id: 'app10', school: 'sch_islam', code: 'ISL', ref: 'APP-SA/2026/00002', name: 'Idris bin Nasir', parent: 'par3', pname: 'Encik Omar bin Yusof', pemail: 'omar@example.my', pphone: '012-888 7766', status: 'interview', dob: '2013-05-05', gender: 'male', cat: 'islamic_studies', flags: '{}', submitted: '2026-10-22T05:00:00.000Z' },
];
for (const a of applications) {
  const ic = encryptIc(a.dob.replace(/-/g, '').slice(2) + '1455');
  ins('applications', {
    id: a.id,
    school_id: a.school,
    reference: a.ref,
    category: a.cat,
    student_name: a.name,
    ic_masked: ic.masked,
    ic_hash: ic.hash,
    ic_enc: ic.enc,
    dob: a.dob,
    gender: a.gender,
    address: 'Kuala Lumpur',
    phone: a.pphone,
    email: a.pemail,
    education: 'Sekolah rendah kebangsaan, tahun semasa.',
    reason: 'Ingin mendalami ilmu Al-Quran dan pendidikan Islam secara tersusun.',
    parent_name: a.pname,
    parent_email: a.pemail,
    parent_phone: a.pphone,
    language: 'bm',
    status: a.status,
    flags: a.flags,
    documents: '[]',
    offer_status: a.offer || null,
    offer_deadline: a.deadline || null,
    submitted_at: a.submitted,
    created_at: a.submitted,
  });
}

/* ------------------------------ Interviews ----------------------------- */
const interviews = [
  { id: 'itv1', app: 'app2', at: '2026-10-20T02:00:00.000Z', status: 'completed' },
  { id: 'itv2', app: 'app3', at: '2026-10-18T03:00:00.000Z', status: 'completed' },
  { id: 'itv3', app: 'app4', at: '2026-10-16T04:00:00.000Z', status: 'completed' },
  { id: 'itv4', app: 'app5', at: '2026-11-05T02:30:00.000Z', status: 'scheduled' },
  { id: 'itv5', app: 'app6', at: '2026-01-10T02:00:00.000Z', status: 'completed' },
  { id: 'itv6', app: 'app10', at: '2026-11-07T03:00:00.000Z', status: 'scheduled' },
];
for (const iv of interviews) {
  const app = applications.find((a) => a.id === iv.app);
  ins('interviews', {
    id: iv.id,
    school_id: app.school,
    application_id: iv.app,
    scheduled_at: iv.at,
    mode: 'in_person',
    location: 'Bilik Temuduga, MDUIK',
    status: iv.status,
    notes: '',
    created_by: app.school === 'sch_tahfiz' ? 'u_admin1' : 'u_admin2',
    created_at: NOW,
  });
  ins('interview_assessors', { id: `iva_${iv.id}_1`, interview_id: iv.id, assessor_id: 'u_guru1' });
  ins('interview_assessors', { id: `iva_${iv.id}_2`, interview_id: iv.id, assessor_id: 'u_guru2' });
}

function makeMarks(target) {
  const items = [
    ['s1_tajwid', 10], ['s1_makhraj', 10], ['s1_fluency', 5],
    ['s2_syahadah', 2], ['s2_islam', 10], ['s2_iman', 10],
    ['s3_prayer', 10], ['s3_subuh', 3],
    ['s4_eating', 5], ['s4_sleeping', 5],
    ['s5_read_jawi', 5], ['s5_write_jawi', 5], ['s5_memorise', 10],
    ['s6_hafazan', 10],
  ];
  const totalMax = items.reduce((s, i) => s + i[1], 0);
  const marks = {};
  let assigned = 0;
  items.forEach(([key, max], idx) => {
    if (idx === items.length - 1) {
      marks[key] = Math.max(0, Math.min(max, Math.round((target - assigned) * 2) / 2));
    } else {
      const share = Math.round(((max / totalMax) * target) * 2) / 2;
      marks[key] = Math.min(max, Math.max(0, share));
      assigned += marks[key];
    }
  });
  const total = Object.values(marks).reduce((s, v) => s + v, 0);
  return { marks, total: Math.round(total * 100) / 100 };
}

const scoreSets = [
  { itv: 'itv1', a1: 82, a2: 74 },
  { itv: 'itv2', a1: 60, a2: 50 },
  { itv: 'itv3', a1: 32, a2: 28 },
  { itv: 'itv5', a1: 70, a2: 66 },
];
for (const set of scoreSets) {
  for (const [idx, target] of [['1', set.a1], ['2', set.a2]]) {
    const { marks, total } = makeMarks(target);
    ins('scores', {
      id: `scr_${set.itv}_${idx}`,
      interview_id: set.itv,
      assessor_id: idx === '1' ? 'u_guru1' : 'u_guru2',
      marks: JSON.stringify(marks),
      total,
      submitted_at: '2026-10-20T06:00:00.000Z',
    });
  }
}

/* ------------------------------ Decisions ------------------------------ */
const decisions = [
  { id: 'dec1', app: 'app2', decision: 'accepted', reason: 'Markah temuduga baik dan memenuhi syarat umur.', by: 'u_admin1', at: '2026-10-22T02:00:00.000Z' },
  { id: 'dec2', app: 'app3', decision: 'waiting_list', reason: 'Markah lulus; menunggu kekosongan tempat.', by: 'u_admin1', at: '2026-10-21T02:00:00.000Z' },
  { id: 'dec3', app: 'app4', decision: 'not_accepted', reason: 'Markah di bawah markah lulus 40/100.', by: 'u_admin1', at: '2026-10-19T02:00:00.000Z' },
  { id: 'dec4', app: 'app6', decision: 'accepted', reason: 'Pendaftaran diterima untuk sesi semasa.', by: 'u_admin1', at: '2026-01-08T02:00:00.000Z' },
  { id: 'dec5', app: 'app8', decision: 'accepted', reason: 'Pencapaian Iqra’ yang baik.', by: 'u_admin1', at: '2026-09-05T02:00:00.000Z' },
];
for (const d of decisions) {
  const app = applications.find((a) => a.id === d.app);
  ins('decisions', {
    id: d.id,
    school_id: app.school,
    application_id: d.app,
    decision: d.decision,
    reason: d.reason,
    decided_by: d.by,
    decided_at: d.at,
  });
}

/* ------------------------------- Invoices ------------------------------ */
const invoiceRows = [];
const paymentRows = [];
const allocationRows = [];
const receiptRows = [];
const creditRows = [];
const writeOffRows = [];
const reminderRows = [];
let invSeq = { sch_tahfiz: 0, sch_islam: 0 };
let rcpSeq = { sch_tahfiz: 0, sch_islam: 0 };

function addInvoice({ student, type, period, issue, due, amount, status, paid = 0, credited = 0, waived = 0 }) {
  invSeq[student.school] += 1;
  const num = `INV/${YEAR}/${String(invSeq[student.school]).padStart(5, '0')}`;
  const invId = `inv_${student.id}_${type}_${period.replace(/[^0-9]/g, '')}`;
  invoiceRows.push({
    id: invId,
    school_id: student.school,
    student_id: student.id,
    number: num,
    type,
    period,
    issue_date: issue,
    due_date: due,
    amount_cents: amount,
    paid_cents: paid,
    credited_cents: credited,
    waived_cents: waived,
    status,
    description: type === 'registration' ? `Yuran pendaftaran ${period} / Registration fee ${period}` : `Yuran bulanan ${period} / Monthly fee ${period}`,
    created_at: `${issue}T01:00:00.000Z`,
  });
  return { id: invId, number: num };
}

function addPayment({ student, invoice, amount, paidAt, method = 'bank', bankRef, combined = null }) {
  rcpSeq[student.school] += 1;
  const payId = `pay_${student.id}_${invoice.id.replace(/[^a-z0-9]/gi, '').slice(-18)}_${rcpSeq[student.school]}`;
  const rcpId = `rcp_${student.id}_${rcpSeq[student.school]}`;
  const rcpNum = `RCP/${YEAR}/${String(rcpSeq[student.school]).padStart(5, '0')}`;
  paymentRows.push({
    id: payId,
    school_id: student.school,
    student_id: student.id,
    amount_cents: amount,
    method,
    bank_ref: bankRef || (method === 'bank' ? `TRX${Math.floor(100000 + Math.random() * 899999)}` : ''),
    paid_at: paidAt,
    proof_key: null,
    notes: '',
    receipt_id: rcpId,
    is_recovery: 0,
    recorded_by: student.school === 'sch_tahfiz' ? 'u_bursar1' : 'u_admin2',
    created_at: `${paidAt}T08:00:00.000Z`,
  });
  receiptRows.push({
    id: rcpId,
    school_id: student.school,
    payment_id: payId,
    number: rcpNum,
    amount_cents: amount,
    status: 'issued',
    cancel_reason: null,
    issued_at: `${paidAt}T08:00:00.000Z`,
    cancelled_at: null,
  });
  allocationRows.push({ id: `pal_${payId}_1`, payment_id: payId, invoice_id: invoice.id, amount_cents: combined ? combined : amount });
  return payId;
}

const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
const dueDayFor = (school) => (school === 'sch_tahfiz' ? 7 : 10);

for (const s of students) {
  const school = schools.find((x) => x.id === s.school);
  // Registration invoice for every student, once per calendar year.
  const regPaid = ['st1', 'st2', 'st5', 'st9', 'st11', 'st12', 'st13', 'st16'].includes(s.id);
  const reg = addInvoice({
    student: s,
    type: 'registration',
    period: String(YEAR),
    issue: '2026-01-02',
    due: '2026-01-31',
    amount: school.registration_fee_cents,
    status: regPaid ? 'paid' : 'unpaid',
    paid: regPaid ? school.registration_fee_cents : 0,
  });
  if (regPaid) addPayment({ student: s, invoice: reg, amount: school.registration_fee_cents, paidAt: '2026-01-15', method: s.id === 'st5' ? 'cash' : 'bank' });

  if (!s.tracking || s.status !== 'active') continue;
  for (const m of months) {
    const due = `${m}-${String(dueDayFor(s.school)).padStart(2, '0')}`;
    const amount = s.fee;
    let status = 'unpaid';
    let paid = 0;
    let waived = 0;
    if (['st1', 'st5', 'st11', 'st13', 'st16'].includes(s.id)) {
      status = 'paid';
      paid = amount;
    } else if (s.id === 'st2') {
      if (m === '2026-08') { status = 'paid'; paid = amount; }
      else if (m === '2026-09') { status = 'partial'; paid = 9000; }
    } else if (s.id === 'st12') {
      if (m === '2026-08' || m === '2026-09') { status = 'paid'; paid = amount; }
    } else if (s.id === 'st6') {
      if (m === '2026-08' || m === '2026-09') { status = 'paid'; paid = amount; }
    } else if (s.id === 'st17') {
      status = 'unpaid';
    }
    const inv = addInvoice({ student: s, type: 'monthly', period: m, issue: `${m}-01`, due, amount, status, paid, waived });
    if (paid > 0) {
      addPayment({ student: s, invoice: inv, amount: paid, paidAt: `${m}-05`, method: s.id === 'st5' ? 'cash' : 'bank' });
    }
  }
  if (s.id === 'st3') {
    reminderRows.push({
      id: 'rem_1',
      school_id: 'sch_tahfiz',
      student_id: 'st3',
      invoice_id: 'inv_st3_monthly_202608',
      stage: 60,
      status: 'pending_review',
      due_date: '2026-08-07',
      created_at: '2026-10-06T01:00:00.000Z',
    });
  }
  if (s.id === 'st7') {
    reminderRows.push({
      id: 'rem_2',
      school_id: 'sch_tahfiz',
      student_id: 'st7',
      invoice_id: 'inv_st7_monthly_202610',
      stage: 14,
      status: 'sent',
      due_date: '2026-10-07',
      created_at: '2026-10-21T01:00:00.000Z',
    });
  }
}

// Withdrawn student: one outstanding invoice written off by the School Admin.
const st8 = students.find((s) => s.id === 'st8');
const st8inv = addInvoice({
  student: st8,
  type: 'monthly',
  period: '2026-09',
  issue: '2026-09-01',
  due: '2026-09-07',
  amount: 18000,
  status: 'waived',
  waived: 18000,
});
writeOffRows.push({
  id: 'wof_1',
  school_id: 'sch_tahfiz',
  student_id: 'st8',
  amount_cents: 18000,
  reason: 'Pelajar menarik diri; baki dihapus kira oleh pentadbir.',
  invoice_ids: JSON.stringify([st8inv.id]),
  approved_by: 'u_admin1',
  recovered_cents: 0,
  created_at: '2026-10-02T03:00:00.000Z',
});

// Credit and refund demo (st2 overpaid RM 50).
creditRows.push({
  id: 'crd_1',
  school_id: 'sch_tahfiz',
  student_id: 'st2',
  amount_cents: 5000,
  remaining_cents: 5000,
  source: 'overpayment',
  payment_id: null,
  refund_id: null,
  created_at: '2026-10-20T03:00:00.000Z',
});

for (const r of invoiceRows) ins('invoices', r);
for (const p of paymentRows) ins('payments', p);
for (const a of allocationRows) ins('payment_allocations', a);
for (const r of receiptRows) ins('receipts', r);
for (const c of creditRows) ins('credits', c);
for (const w of writeOffRows) ins('write_offs', w);
for (const rm of reminderRows) ins('reminders', rm);

// Refund request pending approval by a second person.
ins('refunds', {
  id: 'ref_1',
  school_id: 'sch_tahfiz',
  student_id: 'st2',
  credit_id: 'crd_1',
  amount_cents: 5000,
  reason: 'Lebihan bayaran yuran September - dipulangkan kepada ibu bapa.',
  status: 'pending',
  requested_by: 'u_bursar1',
  approved_by: null,
  approved_at: null,
  created_at: '2026-10-28T02:00:00.000Z',
});

// Fee adjustment pending.
ins('fee_adjustments', {
  id: 'adj_1',
  school_id: 'sch_tahfiz',
  student_id: 'st6',
  old_rate_cents: 18000,
  new_rate_cents: 15000,
  reason: 'Permohonan ibu bapa selepas mesyuarat sekolah; pendapatan keluarga terjejas.',
  status: 'pending',
  requested_by: 'u_bursar1',
  approved_by: null,
  effective_date: null,
  created_at: '2026-10-29T02:00:00.000Z',
});

/* ---------------------------- Notifications ---------------------------- */
const notifications = [
  { id: 'ntf_1', school: 'sch_tahfiz', user: 'u_parent1', email: 'ibubapa@mduik.my', name: 'Encik Hassan bin Abdullah', type: 'invoice_issued', subject: 'Invois baharu — 2026-11', body: 'Invois INV/2026/00061 sebanyak RM 180.00 telah dikeluarkan untuk Ahmad Zaki bin Hassan. Tarikh akhir: 2026-11-07.', read: null },
  { id: 'ntf_2', school: 'sch_tahfiz', user: 'u_parent1', email: 'ibubapa@mduik.my', name: 'Encik Hassan bin Abdullah', type: 'payment_received', subject: 'Bayaran diterima — RCP/2026/00021', body: 'Bayaran RM 180.00 telah diterima. Resit boleh dimuat turun dari portal ibu bapa.', read: '2026-10-08T02:00:00.000Z' },
  { id: 'ntf_3', school: 'sch_tahfiz', user: 'u_admin1', email: 'admin.tahfiz@mduik.my', name: 'Ustazah Nurul Huda binti Kamal', type: 'arrears_registration', subject: 'Pendaftaran dengan tunggakan', body: 'Pelajar dengan tunggakan didaftarkan semula. Pendaftaran tidak disekat.', read: null },
  { id: 'ntf_4', school: 'sch_tahfiz', user: 'u_bursar1', email: 'bendahari@mduik.my', name: 'Puan Siti Mariam binti Osman', type: 'arrears_reminder_review', subject: 'Semakan notis rasmi — INV/2026/00017', body: 'Notis formal menunggu semakan Bursar sebelum dihantar.', read: null },
  { id: 'ntf_5', school: 'sch_islam', user: 'u_parent1', email: 'ibubapa@mduik.my', name: 'Encik Hassan bin Abdullah', type: 'invoice_issued', subject: 'Invois baharu — 2026-11', body: 'Invois baharu telah dikeluarkan untuk Muhammad Danial bin Hassan.', read: null },
];
for (const n of notifications) {
  ins('notifications', {
    id: n.id,
    school_id: n.school,
    user_id: n.user,
    recipient_email: n.email,
    recipient_name: n.name,
    type: n.type,
    subject: n.subject,
    body: n.body,
    language: 'bm',
    channel: 'portal',
    read_at: n.read,
    email_status: 'sent',
    created_at: '2026-10-30T02:00:00.000Z',
  });
}

/* ------------------------------ Retention ------------------------------ */
const retention = [
  { id: 'ret_1', type: 'rejected_application', months: 12, bm: 'Permohonan ditolak: 12 bulan selepas keputusan', en: 'Rejected applications: 12 months after decision' },
  { id: 'ret_2', type: 'graduated_student', months: null, bm: 'Pelajar graduan: disimpan sebagai alumni (tiada pemadaman)', en: 'Graduated students: retained as alumni (no deletion)' },
  { id: 'ret_3', type: 'financial_record', months: null, bm: 'Rekod kewangan: sehingga baki dijelaskan atau dihapus kira', en: 'Financial records: until settled or written off' },
  { id: 'ret_4', type: 'audit_log', months: 12, bm: 'Log audit: 1 tahun', en: 'Audit log: 1 year' },
  { id: 'ret_5', type: 'withdrawn_student', months: null, bm: 'Pelajar berhenti: ditanda, bukan dipadam', en: 'Withdrawn students: marked, not deleted' },
];
for (const r of retention) {
  ins('retention_config', { id: r.id, data_type: r.type, months: r.months, description_bm: r.bm, description_en: r.en });
}

/* ------------------------------- Counters ------------------------------ */
for (const s of schools) {
  ins('counters', { school_id: s.id, name: `invoice:${YEAR}`, value: invSeq[s.id] });
  ins('counters', { school_id: s.id, name: `receipt:${YEAR}`, value: rcpSeq[s.id] });
  ins('counters', { school_id: s.id, name: `application:${YEAR}`, value: applications.filter((a) => a.school === s.id).length });
}

/* ------------------------------ Audit logs ----------------------------- */
const auditRows = [
  ['aud_seed_1', 'sch_tahfiz', 'u_admin1', 'Ustazah Nurul Huda binti Kamal', 'school_admin', 'create', 'invoice', 'inv_st1_monthly_202611', null, '{"type":"monthly","period":"2026-11"}'],
  ['aud_seed_2', 'sch_tahfiz', 'u_bursar1', 'Puan Siti Mariam binti Osman', 'bursar', 'record_payment', 'payment', 'pay_st1_1', null, '{"amount":180}'],
  ['aud_seed_3', 'sch_tahfiz', 'u_admin1', 'Ustazah Nurul Huda binti Kamal', 'school_admin', 'tracking_toggle', 'student', 'st2', '{"monthly_tracking":0}', '{"monthly_tracking":1}'],
  ['aud_seed_4', 'sch_tahfiz', 'u_admin1', 'Ustazah Nurul Huda binti Kamal', 'school_admin', 'write_off', 'student', 'st8', null, '{"amountCents":18000}'],
  ['aud_seed_5', 'sch_tahfiz', 'u_guru1', 'Ustaz Hafiz bin Salleh', 'teacher', 'score', 'interview', 'itv1', null, '{"total":82}'],
];
for (const [id_, school, actor, name, role, action, entity, entityId, before, after] of auditRows) {
  ins('audit_logs', {
    id: id_,
    school_id: school,
    actor_id: actor,
    actor_name: name,
    actor_role: role,
    action,
    entity,
    entity_id: entityId,
    before_json: before,
    after_json: after,
    ip: '127.0.0.1',
    created_at: '2026-10-30T02:30:00.000Z',
  });
}

out.push('PRAGMA foreign_keys = ON;');
writeFileSync(new URL('../seed.sql', import.meta.url), out.join('\n') + '\n');
console.log(`seed.sql written: ${out.length} statements, invoices=${invoiceRows.length}, payments=${paymentRows.length}, receipts=${receiptRows.length}`);

