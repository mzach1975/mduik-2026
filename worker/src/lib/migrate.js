import { normalizePhone } from './people.js';

/**
 * schema.sql only creates missing tables, so columns added to (or removed
 * from) existing tables are handled here once per isolate. Every step is safe
 * to repeat.
 */
const ready = new WeakMap();

export function ensureSchema(env) {
  let p = ready.get(env.DB);
  if (!p) {
    p = migrate(env).catch((err) => {
      ready.delete(env.DB);
      throw err;
    });
    ready.set(env.DB, p);
  }
  return p;
}

async function columns(db, table) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(results.map((r) => r.name));
}

async function tableExists(db, table) {
  return Boolean(await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).first());
}

async function addColumns(db, table, defs) {
  const have = await columns(db, table);
  for (const [name, def] of defs) {
    if (have.has(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`).run();
    } catch (err) {
      // Another isolate may have added it first.
      if (!/duplicate column/i.test(String(err?.message))) throw err;
    }
  }
}

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Copy the listed columns of every row into migration_backups, then drop them. */
async function backupAndDropColumns(db, migration, table, drop, prefix) {
  const have = await columns(db, table);
  const present = drop.filter((c) => have.has(c));
  if (!present.length) return;
  const obj = present.map((c) => `'${c}', ${c}`).join(', ');
  await db
    .prepare(
      `INSERT OR IGNORE INTO migration_backups (id, migration, table_name, row_id, data_json, created_at)
       SELECT '${prefix}' || id, ?, ?, id, json_object(${obj}), ${NOW_SQL} FROM ${table}`,
    )
    .bind(migration, table)
    .run();
  for (const col of present) {
    try {
      await db.prepare(`ALTER TABLE ${table} DROP COLUMN ${col}`).run();
    } catch (err) {
      if (!/no such column/i.test(String(err?.message))) throw err;
    }
  }
}

async function backfillPhoneNorm(db, table) {
  for (let i = 0; i < 50; i++) {
    const { results } = await db
      .prepare(`SELECT id, phone FROM ${table} WHERE phone_norm IS NULL AND phone IS NOT NULL AND phone != '' LIMIT 200`)
      .all();
    if (!results.length) break;
    await db.batch(
      results.map((r) => db.prepare(`UPDATE ${table} SET phone_norm = ? WHERE id = ?`).bind(normalizePhone(r.phone) || '', r.id)),
    );
  }
}

async function migrate(env) {
  const db = env.DB;
  await addColumns(db, 'parents', [
    ['ic_hash', 'TEXT'],
    ['ic_enc', 'TEXT'],
    ['phone_norm', 'TEXT'],
    ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ['duplicate_reason', 'TEXT'],
    ['updated_at', 'TEXT'],
  ]);
  await addColumns(db, 'parent_students', [['school_id', 'TEXT']]);
  await addColumns(db, 'users', [['must_change_password', 'INTEGER NOT NULL DEFAULT 0']]);
  await addColumns(db, 'teachers', [
    ['phone_norm', 'TEXT'],
    ['ic_hash', 'TEXT'],
    ['ic_enc', 'TEXT'],
    ['ic_masked', 'TEXT'],
    ['duplicate_reason', 'TEXT'],
  ]);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS teacher_schools (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id),
      school_id TEXT NOT NULL REFERENCES schools(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE (teacher_id, school_id))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS migration_backups (
      id TEXT PRIMARY KEY, migration TEXT NOT NULL, table_name TEXT NOT NULL, row_id TEXT,
      data_json TEXT NOT NULL, created_at TEXT NOT NULL)`),
  ]);
  // Indexes on columns added after the first release. Teachers and parents have
  // one record per IC / Passport No. (unique hash); students only warn on a
  // match, so their hash index (schema.sql) is not unique. Teachers are a small
  // table, so the contact indexes add little write cost.
  await db.batch([
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_parents_ic ON parents(ic_hash) WHERE ic_hash IS NOT NULL'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(lower(email))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents(phone_norm)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_parent_students_school ON parent_students(school_id, parent_id)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_ic ON teachers(ic_hash) WHERE ic_hash IS NOT NULL'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(lower(email))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_teachers_phone ON teachers(phone_norm)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_teacher_schools_school ON teacher_schools(school_id, status)'),
    db.prepare(
      'UPDATE parent_students SET school_id = (SELECT s.school_id FROM students s WHERE s.id = parent_students.student_id) WHERE school_id IS NULL',
    ),
  ]);
  await backfillPhoneNorm(db, 'parents');
  await migrateCr20261109(db);
}

/**
 * Change request 2026-11-09: remove fee plans and class, stop storing student
 * phone/email, one teacher record with school memberships, and the new masked
 * IC format. Every removed value is first copied into migration_backups.
 */
async function migrateCr20261109(db) {
  const CR = 'cr-2026-11-09';
  const marker = `migration:${CR}`;
  if (await db.prepare('SELECT 1 AS ok FROM settings WHERE key = ?').bind(marker).first()) return;

  // Each teacher row becomes the teacher's membership at its school.
  await db
    .prepare(
      `INSERT OR IGNORE INTO teacher_schools (id, teacher_id, school_id, status, created_at)
       SELECT 'tsm_' || id, id, school_id, status, created_at FROM teachers`,
    )
    .run();
  await backfillPhoneNorm(db, 'teachers');

  // Keep each student's current rate: a rate that differs from the school
  // default (from a fee plan or set by hand) becomes an approved adjustment,
  // because monthly invoices now use the adjusted rate or the school default.
  await db
    .prepare(
      `INSERT OR IGNORE INTO fee_adjustments (id, school_id, student_id, old_rate_cents, new_rate_cents, reason, status, effective_date, created_at)
       SELECT 'adj_cr_' || s.id, s.school_id, s.id, sc.monthly_fee_cents, s.monthly_fee_cents,
         'Kadar sedia ada dikekalkan apabila pelan yuran dibuang. / Existing rate kept when fee plans were removed.',
         'approved', date('now'), ${NOW_SQL}
       FROM students s JOIN schools sc ON sc.id = s.school_id
       WHERE s.monthly_fee_cents > 0 AND s.monthly_fee_cents != sc.monthly_fee_cents
         AND NOT EXISTS (SELECT 1 FROM fee_adjustments fa WHERE fa.student_id = s.id AND fa.status = 'approved')`,
    )
    .run();

  await backupAndDropColumns(db, CR, 'students', ['class_name', 'phone', 'email', 'fee_plan_id'], 'bk_std_');
  await backupAndDropColumns(db, CR, 'applications', ['phone', 'email'], 'bk_app_');
  if (await tableExists(db, 'fee_plans')) {
    const cols = [...(await columns(db, 'fee_plans'))];
    await db
      .prepare(
        `INSERT OR IGNORE INTO migration_backups (id, migration, table_name, row_id, data_json, created_at)
         SELECT 'bk_fp_' || id, ?, 'fee_plans', id, json_object(${cols.map((c) => `'${c}', ${c}`).join(', ')}), ${NOW_SQL} FROM fee_plans`,
      )
      .bind(CR)
      .run();
    await db.prepare('DROP TABLE IF EXISTS fee_plans').run();
  }

  // Masked display shows only the last four characters: ********1234.
  for (const table of ['students', 'parents', 'applications', 'users', 'teachers']) {
    await db
      .prepare(
        `UPDATE ${table} SET ic_masked = '********' || substr(replace(ic_masked, '-', ''), -4)
         WHERE ic_masked IS NOT NULL AND ic_masked != '' AND ic_masked NOT LIKE '********%'`,
      )
      .run();
  }
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'done')").bind(marker).run();
}
