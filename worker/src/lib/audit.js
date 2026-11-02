import { id, nowIso } from './util.js';

/** Write an immutable audit entry. */
export async function audit(c, action, entity, entityId, options = {}) {
  const auth = c.get('auth');
  const schoolId = options.schoolId ?? auth?.activeSchool ?? null;
  const actor = options.actor || auth?.user;
  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_logs
        (id, school_id, actor_id, actor_name, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id('aud'),
        schoolId,
        actor?.id || null,
        actor?.full_name || options.actorName || 'system',
        auth?.roleInSchool || options.actorRole || 'system',
        action,
        entity,
        entityId || null,
        options.before ? JSON.stringify(options.before) : null,
        options.after ? JSON.stringify(options.after) : null,
        c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '',
        nowIso(),
      )
      .run();
  } catch (err) {
    console.error('audit failed', err);
  }
}

/** Record a view of child records (FR-AUD-05). */
export async function auditView(c, entity, entityId, label) {
  return audit(c, 'view', entity, entityId, { after: label ? { label } : undefined });
}

export async function auditSystem(env, action, entity, entityId, details = {}, schoolId = null) {
  await env.DB.prepare(
    `INSERT INTO audit_logs
      (id, school_id, actor_id, actor_name, actor_role, action, entity, entity_id, before_json, after_json, ip, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id('aud'),
      schoolId,
      null,
      details.actorName || 'system',
      'system',
      action,
      entity,
      entityId || null,
      null,
      Object.keys(details).length ? JSON.stringify(details) : null,
      '',
      nowIso(),
    )
    .run();
}
