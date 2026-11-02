-- MDUIK School Administration System - D1 schema
-- All school-owned records carry school_id. Dates are ISO-8601 (Gregorian).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('tahfiz','islamic_studies')),
  state TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  monthly_due_day INTEGER NOT NULL DEFAULT 1 CHECK (monthly_due_day BETWEEN 1 AND 28),
  reg_gen_month INTEGER NOT NULL DEFAULT 1,
  reg_gen_day INTEGER NOT NULL DEFAULT 1,
  reg_due_month INTEGER NOT NULL DEFAULT 1,
  reg_due_day INTEGER NOT NULL DEFAULT 31,
  monthly_fee_cents INTEGER NOT NULL DEFAULT 15000,
  registration_fee_cents INTEGER NOT NULL DEFAULT 20000,
  bank_name TEXT,
  bank_account TEXT,
  payment_instructions_bm TEXT,
  payment_instructions_en TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  receipt_prefix TEXT NOT NULL DEFAULT 'RCP',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);

CREATE TABLE IF NOT EXISTS fee_plans (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  monthly_fee_cents INTEGER NOT NULL,
  registration_fee_cents INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fee_plans_school ON fee_plans(school_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  ic_hash TEXT UNIQUE,
  ic_enc TEXT,
  ic_masked TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'bm',
  status TEXT NOT NULL DEFAULT 'active',
  parent_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  school_id TEXT REFERENCES schools(id),
  role TEXT NOT NULL CHECK (role IN ('super_admin','school_admin','bursar','teacher','parent')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (user_id, school_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  ip TEXT,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(identifier, created_at);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  full_name TEXT NOT NULL,
  ic_hash TEXT,
  ic_enc TEXT,
  ic_masked TEXT,
  dob TEXT,
  gender TEXT,
  class_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  fee_plan_id TEXT REFERENCES fee_plans(id),
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
  monthly_tracking INTEGER NOT NULL DEFAULT 0,
  tracking_start TEXT,
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('applicant','active','withdrawn','graduated')),
  application_id TEXT,
  import_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id, status);
CREATE INDEX IF NOT EXISTS idx_students_ic ON students(ic_hash);

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  ic_masked TEXT,
  address TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parents_user ON parents(user_id);

CREATE TABLE IF NOT EXISTS parent_students (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  relationship TEXT NOT NULL DEFAULT 'guardian',
  UNIQUE (parent_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON parent_students(student_id);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  user_id TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  ic_masked TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  student_name TEXT NOT NULL,
  ic_masked TEXT,
  ic_hash TEXT,
  ic_enc TEXT,
  dob TEXT,
  gender TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  education TEXT,
  reason TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  language TEXT NOT NULL DEFAULT 'bm',
  status TEXT NOT NULL DEFAULT 'submitted',
  flags TEXT,
  documents TEXT,
  offer_status TEXT,
  offer_deadline TEXT,
  submitted_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_applications_school ON applications(school_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_ref ON applications(reference);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  application_id TEXT NOT NULL REFERENCES applications(id),
  scheduled_at TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'in_person',
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interviews_school ON interviews(school_id, scheduled_at);

CREATE TABLE IF NOT EXISTS interview_assessors (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL REFERENCES interviews(id),
  assessor_id TEXT NOT NULL REFERENCES users(id),
  UNIQUE (interview_id, assessor_id)
);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL REFERENCES interviews(id),
  assessor_id TEXT NOT NULL REFERENCES users(id),
  marks TEXT NOT NULL,
  total REAL NOT NULL,
  submitted_at TEXT NOT NULL,
  UNIQUE (interview_id, assessor_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  application_id TEXT NOT NULL REFERENCES applications(id),
  decision TEXT NOT NULL CHECK (decision IN ('accepted','not_accepted','waiting_list')),
  reason TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('monthly','registration','opening','adjustment')),
  period TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  credited_cents INTEGER NOT NULL DEFAULT 0,
  waived_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  description TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (school_id, student_id, type, period),
  UNIQUE (school_id, number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_school ON invoices(school_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id, due_date);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','bank')),
  bank_ref TEXT,
  paid_at TEXT NOT NULL,
  proof_key TEXT,
  notes TEXT,
  receipt_id TEXT,
  is_recovery INTEGER NOT NULL DEFAULT 0,
  recorded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_school ON payments(school_id, paid_at);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  amount_cents INTEGER NOT NULL,
  remaining_cents INTEGER NOT NULL,
  source TEXT NOT NULL,
  payment_id TEXT,
  refund_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credits_student ON credits(student_id, remaining_cents);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  payment_id TEXT NOT NULL REFERENCES payments(id),
  number TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  cancel_reason TEXT,
  issued_at TEXT NOT NULL,
  cancelled_at TEXT,
  UNIQUE (school_id, number)
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  credit_id TEXT,
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS write_offs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  invoice_ids TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  recovered_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_adjustments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  old_rate_cents INTEGER NOT NULL,
  new_rate_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,
  approved_by TEXT,
  effective_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  stage INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  released_by TEXT,
  UNIQUE (invoice_id, stage, due_date)
);
CREATE INDEX IF NOT EXISTS idx_reminders_school ON reminders(school_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  school_id TEXT,
  user_id TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'bm',
  channel TEXT NOT NULL DEFAULT 'portal',
  read_at TEXT,
  email_status TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_school ON audit_logs(school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  type TEXT NOT NULL,
  filename TEXT,
  status TEXT NOT NULL DEFAULT 'dry_run',
  total_rows INTEGER NOT NULL DEFAULT 0,
  ok_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  report_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retention_config (
  id TEXT PRIMARY KEY,
  data_type TEXT NOT NULL UNIQUE,
  months INTEGER,
  description_bm TEXT,
  description_en TEXT
);

CREATE TABLE IF NOT EXISTS retention_records (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  label TEXT,
  flagged_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  action TEXT,
  approved_by TEXT,
  resolved_at TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS counters (
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  school_id TEXT,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  r2_key TEXT,
  data_b64 TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  size_bytes INTEGER,
  r2_key TEXT,
  requested_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
