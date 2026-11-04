import { normalizePhone } from './parents.js';

/**
 * schema.sql only creates missing tables, so columns added to existing tables
 * are applied here once per isolate. Every step is safe to repeat.
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
  await db.batch([
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_parents_ic ON parents(ic_hash) WHERE ic_hash IS NOT NULL'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_parents_email ON parents(lower(email))'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents(phone_norm)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_parent_students_school ON parent_students(school_id, parent_id)'),
    db.prepare(
      'UPDATE parent_students SET school_id = (SELECT s.school_id FROM students s WHERE s.id = parent_students.student_id) WHERE school_id IS NULL',
    ),
  ]);
  for (let i = 0; i < 50; i++) {
    const { results } = await db
      .prepare("SELECT id, phone FROM parents WHERE phone_norm IS NULL AND phone IS NOT NULL AND phone != '' LIMIT 200")
      .all();
    if (!results.length) break;
    await db.batch(
      results.map((r) => db.prepare('UPDATE parents SET phone_norm = ? WHERE id = ?').bind(normalizePhone(r.phone) || '', r.id)),
    );
  }
}
