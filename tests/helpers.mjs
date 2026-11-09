// Test harness: runs the real Worker against an in-memory SQLite database
// exposed through a minimal D1-compatible API.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.js';
import { signToken, SESSION_COOKIE } from '../worker/src/lib/auth.js';

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params.map(clean));
  }
  async first(col) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return null;
    return col ? row[col] : { ...row };
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })), success: true };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
  }
}

const NOW = '2026-01-01T00:00:00.000Z';

export async function setup() {
  const DB = new D1();
  DB.db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { DB, JWT_SECRET: 'test-secret', IC_PEPPER: 'test-pepper', APP_URL: 'http://test' };
  const sql = (q, ...p) => DB.db.prepare(q).run(...p.map(clean));
  for (const [sid, name] of [
    ['sch_a', 'Sekolah A'],
    ['sch_b', 'Sekolah B'],
  ]) {
    sql(
      "INSERT INTO schools (id, name, category, monthly_fee_cents, registration_fee_cents, status, created_at) VALUES (?,?,'tahfiz',10000,20000,'active',?)",
      sid,
      name,
      NOW,
    );
  }
  const users = {};
  for (const [key, school, role] of [
    ['super', null, 'super_admin'],
    ['adminA', 'sch_a', 'school_admin'],
    ['adminB', 'sch_b', 'school_admin'],
  ]) {
    const uid = `usr_${key}`;
    sql("INSERT INTO users (id, email, full_name, password_hash, status, created_at) VALUES (?,?,?,'x','active',?)", uid, `${key}@test`, key, NOW);
    sql("INSERT INTO user_roles (id, user_id, school_id, role, started_at, status) VALUES (?,?,?,?,?,'active')", `url_${key}`, uid, school, role, NOW);
    users[key] = { id: uid, school };
  }

  async function call(who, method, path, body) {
    const u = typeof who === 'string' ? users[who] : who;
    const token = await signToken(env, { sub: u.id, sch: u.school || null });
    const init = { method, headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await worker.fetch(new Request(`http://test/api${path}`, init), env, { waitUntil() {} });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  /** A request with an explicit cookie (or none), returning the session cookie the Worker set. */
  async function raw(method, path, body, cookie) {
    const init = { method, headers: {} };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await worker.fetch(new Request(`http://test/api${path}`, init), env, { waitUntil() {} });
    const data = await res.json().catch(() => null);
    const set = res.headers.get('set-cookie') || '';
    const m = set.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`));
    return { status: res.status, data, cookie: m && m[1] ? `${SESSION_COOKIE}=${m[1]}` : null };
  }

  /** A parent/teacher login used directly in a test, with the first-login password change already done. */
  function asUser(userId, school) {
    DB.db.prepare('UPDATE users SET must_change_password = 0 WHERE id = ?').run(userId);
    return { id: userId, school };
  }

  let appSeq = 0;
  /** An accepted application ready for the registration form. */
  function acceptedApplication(schoolId, { studentName = 'Pelajar', parentName = 'Ibu Bapa', parentEmail = '', parentPhone = '' } = {}) {
    const appId = `app_${++appSeq}`;
    sql(
      `INSERT INTO applications (id, school_id, reference, category, student_name, parent_name, parent_email, parent_phone, status, submitted_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,'accepted',?,?)`,
      appId,
      schoolId,
      `REF-${appSeq}`,
      'tahfiz',
      studentName,
      parentName,
      parentEmail,
      parentPhone,
      NOW,
      NOW,
    );
    return appId;
  }

  const one = (q, ...p) => DB.db.prepare(q).get(...p.map(clean));
  const many = (q, ...p) => DB.db.prepare(q).all(...p.map(clean));
  return { env, DB, users, call, raw, asUser, sql, one, many, acceptedApplication };
}
