import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { json, today, monthOf } from '../lib/util.js';
import { agingReport, studentBalance } from '../lib/finance.js';

const dashboard = new Hono();
dashboard.use('*', authMiddleware);

dashboard.get('/dashboard', async (c) => {
  const auth = c.get('auth');
  const db = c.env.DB;
  const role = auth.roleInSchool;
  const schoolId = auth.activeSchool;
  const day = today();
  const month = monthOf(day);

  if (auth.isSuper || role === 'super_admin') {
    const { results: schools } = await db.prepare(
      `SELECT s.id, s.name, s.category, s.state, s.status,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS students,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.monthly_tracking = 1) AS tracking_on,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id AND t.status = 'active') AS teachers,
        (SELECT COUNT(*) FROM applications a WHERE a.school_id = s.id) AS applications,
        (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.school_id = s.id AND substr(p.paid_at,1,7) = ?) AS collected_month,
        (SELECT COALESCE(SUM(i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents),0) FROM invoices i WHERE i.school_id = s.id AND i.status IN ('unpaid','partial')) AS outstanding
       FROM schools s ORDER BY s.name`,
    )
      .bind(month)
      .all();
    const totals = schools.reduce(
      (acc, s) => ({
        schools: acc.schools + 1,
        students: acc.students + s.students,
        applications: acc.applications + s.applications,
        collected: acc.collected + s.collected_month,
        outstanding: acc.outstanding + s.outstanding,
      }),
      { schools: 0, students: 0, applications: 0, collected: 0, outstanding: 0 },
    );
    const { results: states } = await db.prepare(
      `SELECT s.state, COUNT(DISTINCT st.id) AS students, COUNT(DISTINCT t.id) AS teachers
       FROM schools s LEFT JOIN students st ON st.school_id = s.id AND st.status = 'active'
       LEFT JOIN teachers t ON t.school_id = s.id AND t.status = 'active'
       GROUP BY s.state ORDER BY s.state`,
    ).all();
    const collectionRate = totals.collected + totals.outstanding > 0
      ? Math.round((totals.collected / (totals.collected + totals.outstanding)) * 100)
      : 0;
    return json({ role: 'super_admin', totals, schools, states, collectionRate, month });
  }

  if (!schoolId) return json({ role, empty: true });

  if (role === 'parent') {
    const { results: children } = await db.prepare(
      `SELECT s.id, s.full_name, s.class_name, s.status, sc.name AS school_name, sc.category,
        (SELECT COALESCE(SUM(i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents),0)
         FROM invoices i WHERE i.student_id = s.id AND i.status IN ('unpaid','partial')) AS outstanding,
        (SELECT COALESCE(SUM(cr.remaining_cents),0) FROM credits cr WHERE cr.student_id = s.id) AS credit,
        (SELECT MIN(i.due_date) FROM invoices i WHERE i.student_id = s.id AND i.status IN ('unpaid','partial')) AS next_due
       FROM parent_students ps JOIN students s ON s.id = ps.student_id JOIN schools sc ON sc.id = s.school_id
       WHERE ps.parent_id = ? ORDER BY s.full_name`,
    )
      .bind(auth.parent?.id || '')
      .all();
    const unread = await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .bind(auth.user.id)
      .first();
    return json({ role: 'parent', children, unread: unread.n, month });
  }

  if (role === 'teacher') {
    const { results: upcoming } = await db.prepare(
      `SELECT iv.id, iv.scheduled_at, iv.mode, iv.location, iv.status, a.reference, a.student_name, a.category,
        (SELECT COUNT(*) FROM scores sc WHERE sc.interview_id = iv.id AND sc.assessor_id = ?) AS my_score
       FROM interviews iv JOIN applications a ON a.id = iv.application_id
       WHERE iv.school_id = ? AND iv.id IN (SELECT interview_id FROM interview_assessors WHERE assessor_id = ?)
       ORDER BY iv.scheduled_at ASC LIMIT 20`,
    )
      .bind(auth.user.id, schoolId, auth.user.id)
      .all();
    const pending = upcoming.filter((i) => !i.my_score && i.status !== 'cancelled');
    return json({ role: 'teacher', upcoming, pendingScores: pending.length, month });
  }

  // School Admin and Bursar
  const { results: funnelRows } = await db.prepare(
    'SELECT status, COUNT(*) AS n FROM applications WHERE school_id = ? GROUP BY status',
  )
    .bind(schoolId)
    .all();
  const funnel = Object.fromEntries(funnelRows.map((r) => [r.status, r.n]));
  const counts = await db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM students WHERE school_id = ? AND status = 'active') AS active_students,
      (SELECT COUNT(*) FROM students WHERE school_id = ? AND monthly_tracking = 1) AS tracking_on,
      (SELECT COUNT(*) FROM students WHERE school_id = ? AND monthly_tracking = 0 AND status = 'active') AS tracking_off,
      (SELECT COUNT(*) FROM teachers WHERE school_id = ? AND status = 'active') AS teachers,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE school_id = ? AND substr(paid_at,1,7) = ?) AS collected_month,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE school_id = ? AND paid_at = ?) AS collected_today,
      (SELECT COALESCE(SUM(amount_cents - paid_cents - credited_cents - waived_cents),0) FROM invoices WHERE school_id = ? AND status IN ('unpaid','partial')) AS outstanding,
      (SELECT COUNT(*) FROM invoices WHERE school_id = ? AND status IN ('unpaid','partial')) AS open_invoices,
      (SELECT COUNT(*) FROM refunds WHERE school_id = ? AND status = 'pending') AS pending_refunds,
      (SELECT COUNT(*) FROM fee_adjustments WHERE school_id = ? AND status = 'pending') AS pending_adjustments,
      (SELECT COUNT(*) FROM reminders WHERE school_id = ? AND status = 'pending_review') AS pending_reminders`,
  )
    .bind(schoolId, schoolId, schoolId, schoolId, schoolId, month, schoolId, day, schoolId, schoolId, schoolId, schoolId, schoolId)
    .first();
  const { buckets } = await agingReport(c.env, schoolId, day);
  const { results: latestReceipts } = await db.prepare(
    `SELECT r.number, r.amount_cents, r.issued_at, s.full_name AS student_name
     FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN students s ON s.id = p.student_id
     WHERE r.school_id = ? ORDER BY r.issued_at DESC LIMIT 6`,
  )
    .bind(schoolId)
    .all();
  const { results: recentApps } = await db.prepare(
    'SELECT id, reference, student_name, status, submitted_at FROM applications WHERE school_id = ? ORDER BY submitted_at DESC LIMIT 6',
  )
    .bind(schoolId)
    .all();
  return json({
    role,
    counts,
    funnel,
    buckets,
    latestReceipts,
    recentApplications: recentApps,
    school: {
      name: auth.school?.name,
      monthlyDueDay: auth.school?.monthly_due_day,
      regDueDay: auth.school?.reg_due_day,
      regDueMonth: auth.school?.reg_due_month,
      category: auth.school?.category,
    },
    month,
    day,
  });
});

export default dashboard;
