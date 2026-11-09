import { Hono } from 'hono';
import { authMiddleware } from '../lib/auth.js';
import { json, bad, today, toCsv, toExcel, downloadHeaders, monthOf } from '../lib/util.js';
import { audit } from '../lib/audit.js';
import { agingReport, ADJUSTED_RATE_SQL, monthlyRate } from '../lib/finance.js';
import { buildReportPdf } from '../lib/pdf.js';

const reports = new Hono();
reports.use('*', authMiddleware);

const money = (c) => Number(c || 0) / 100;
const REPORT_ROLES = {
  'admissions-funnel': ['school_admin'],
  'interview-results': ['school_admin'],
  'registration-list': ['school_admin'],
  'student-records': ['school_admin', 'bursar'],
  'teacher-records': ['school_admin'],
  'fee-collection': ['school_admin', 'bursar'],
  'arrears-aging': ['school_admin', 'bursar'],
  'receipt-register': ['school_admin', 'bursar'],
  'refund-log': ['school_admin', 'bursar'],
  'teacher-assignments': ['school_admin'],
  'audit-log': ['school_admin'],
  'write-off-report': ['school_admin', 'bursar'],
  'state-consolidated': ['super_admin'],
};

reports.get('/', (c) => {
  const auth = c.get('auth');
  const list = Object.keys(REPORT_ROLES).filter((k) => auth.isSuper || REPORT_ROLES[k].includes(auth.roleInSchool));
  return json({ reports: list });
});

reports.get('/:id', async (c) => {
  const auth = c.get('auth');
  const reportId = c.req.param('id');
  const allowed = REPORT_ROLES[reportId];
  if (!allowed) return bad('Laporan tidak dijumpai. / Report not found.', 404);
  if (!auth.isSuper && !allowed.includes(auth.roleInSchool)) return bad('Tiada akses. / No access.', 403);
  const schoolId = reportId === 'state-consolidated' ? null : auth.activeSchool;
  const db = c.env.DB;
  const from = c.req.query('from') || `${new Date().getUTCFullYear()}-01-01`;
  const to = c.req.query('to') || today();
  let def;

  if (reportId === 'admissions-funnel') {
    const { results } = await db.prepare(
      `SELECT status, COUNT(*) AS n FROM applications WHERE school_id = ? AND submitted_at BETWEEN ? AND ? GROUP BY status`,
    )
      .bind(schoolId, `${from}T00:00:00`, `${to}T23:59:59`)
      .all();
    const total = results.reduce((s, r) => s + r.n, 0);
    def = {
      title: 'Admissions funnel / Saluran kemasukan',
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'n', label: 'Applications' },
        { key: 'percent', label: '% of total', value: (r) => (total ? Math.round((r.n / total) * 100) : 0) },
      ],
      rows: results,
      summary: [{ label: 'Total applications', value: total }],
    };
  } else if (reportId === 'interview-results') {
    const { results } = await db.prepare(
      `SELECT a.reference, a.student_name, a.status, iv.scheduled_at,
        (SELECT GROUP_CONCAT(u.full_name, ', ') FROM scores sc JOIN users u ON u.id = sc.assessor_id WHERE sc.interview_id = iv.id) AS assessors,
        (SELECT AVG(sc.total) FROM scores sc WHERE sc.interview_id = iv.id) AS final_mark,
        (SELECT COUNT(*) FROM scores sc WHERE sc.interview_id = iv.id) AS scores_in
       FROM applications a JOIN interviews iv ON iv.application_id = a.id
       WHERE a.school_id = ? AND iv.scheduled_at BETWEEN ? AND ? ORDER BY final_mark DESC`,
    )
      .bind(schoolId, from, `${to}T23:59:59`)
      .all();
    def = {
      title: 'Interview results / Keputusan temuduga',
      columns: [
        { key: 'reference', label: 'Reference' },
        { key: 'student_name', label: 'Applicant' },
        { key: 'scheduled_at', label: 'Interview' },
        { key: 'assessors', label: 'Assessors' },
        { key: 'scores_in', label: 'Scores in' },
        { key: 'final_mark', label: 'Final mark', value: (r) => (r.final_mark === null ? '-' : Number(r.final_mark).toFixed(2)) },
        { key: 'status', label: 'Status' },
      ],
      rows: results,
      summary: [{ label: 'Interviews', value: results.length }],
    };
  } else if (reportId === 'registration-list') {
    const sql = `SELECT s.id, s.full_name, s.status, s.ic_masked, s.monthly_tracking, s.created_at,
        (SELECT p.full_name FROM parents p JOIN parent_students ps ON ps.parent_id = p.id WHERE ps.student_id = s.id LIMIT 1) AS parent_name,
        (SELECT p.phone FROM parents p JOIN parent_students ps ON ps.parent_id = p.id WHERE ps.student_id = s.id LIMIT 1) AS parent_phone
      FROM students s WHERE s.school_id = ? AND s.status IN ('active','withdrawn','graduated')
      ORDER BY s.full_name`;
    const { results } = await db.prepare(sql).bind(schoolId).all();
    def = {
      title: 'Registration list / Senarai pendaftaran',
      columns: [
        { key: 'full_name', label: 'Student' },
        { key: 'ic_masked', label: 'IC / Passport No.' },
        { key: 'parent_name', label: 'Parent' },
        { key: 'parent_phone', label: 'Phone' },
        { key: 'monthly_tracking', label: 'Tracking', value: (r) => (r.monthly_tracking ? 'On' : 'Off') },
        { key: 'status', label: 'Status' },
      ],
      rows: results,
      summary: [{ label: 'Students', value: results.length }],
    };
  } else if (reportId === 'student-records') {
    const school = await db.prepare('SELECT monthly_fee_cents FROM schools WHERE id = ?').bind(schoolId).first();
    const sql = `SELECT s.full_name, s.ic_masked, s.dob, s.gender, s.status,
        ${ADJUSTED_RATE_SQL} AS adjusted_rate, s.monthly_tracking, s.tracking_start,
        (SELECT COALESCE(SUM(i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents),0) FROM invoices i WHERE i.student_id = s.id AND i.status IN ('unpaid','partial')) AS outstanding
      FROM students s WHERE s.school_id = ? ORDER BY s.full_name`;
    const { results } = await db.prepare(sql).bind(schoolId).all();
    def = {
      title: 'Student records / Rekod pelajar',
      columns: [
        { key: 'full_name', label: 'Student' },
        { key: 'ic_masked', label: 'IC / Passport No.' },
        { key: 'gender', label: 'Gender' },
        { key: 'monthly_fee', label: 'Monthly fee (RM)', value: (r) => money(monthlyRate(r.adjusted_rate, school || {})) },
        { key: 'monthly_tracking', label: 'Tracking', value: (r) => (r.monthly_tracking ? 'On' : 'Off') },
        { key: 'outstanding', label: 'Outstanding (RM)', value: (r) => money(r.outstanding) },
        { key: 'status', label: 'Status' },
      ],
      rows: results,
      summary: [{ label: 'Students', value: results.length }],
    };
  } else if (reportId === 'teacher-records') {
    const { results } = await db.prepare(
      `SELECT t.full_name, t.ic_masked, t.email, t.phone, tm.status,
        (SELECT GROUP_CONCAT(s.name, ', ') FROM teacher_schools m JOIN schools s ON s.id = m.school_id WHERE m.teacher_id = t.id AND m.status = 'active') AS schools
       FROM teacher_schools tm JOIN teachers t ON t.id = tm.teacher_id WHERE tm.school_id = ? ORDER BY t.full_name`,
    )
      .bind(schoolId)
      .all();
    def = {
      title: 'Teacher records / Rekod guru',
      columns: [
        { key: 'full_name', label: 'Teacher' },
        { key: 'ic_masked', label: 'IC / Passport No.' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'schools', label: 'Schools' },
        { key: 'status', label: 'Status' },
      ],
      rows: results,
      summary: [{ label: 'Teachers', value: results.length }],
    };
  } else if (reportId === 'teacher-assignments') {
    const { results } = await db.prepare(
      `SELECT t.full_name, t.email, s.name AS school_name, 'teacher' AS role, tm.created_at AS started_at, tm.status
       FROM teacher_schools tm JOIN teachers t ON t.id = tm.teacher_id JOIN schools s ON s.id = tm.school_id
       WHERE tm.teacher_id IN (SELECT teacher_id FROM teacher_schools WHERE school_id = ?) ORDER BY t.full_name, s.name`,
    )
      .bind(schoolId)
      .all();
    def = {
      title: 'Teacher-school assignments / Penugasan guru',
      columns: [
        { key: 'full_name', label: 'Teacher' },
        { key: 'school_name', label: 'School' },
        { key: 'role', label: 'Role' },
        { key: 'started_at', label: 'Since' },
        { key: 'status', label: 'Status' },
      ],
      rows: results,
    };
  } else if (reportId === 'fee-collection') {
    const { results } = await db.prepare(
      `SELECT p.paid_at AS date, COALESCE(r.number, '-') AS receipt, s.full_name AS student_name, p.method, p.bank_ref,
        p.amount_cents, p.is_recovery, u.full_name AS recorded_by_name
       FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN receipts r ON r.id = p.receipt_id
       LEFT JOIN users u ON u.id = p.recorded_by
       WHERE p.school_id = ? AND p.paid_at BETWEEN ? AND ? AND (r.id IS NULL OR r.status != 'cancelled') ORDER BY p.paid_at`,
    )
      .bind(schoolId, from, to)
      .all();
    const total = results.reduce((s, r) => s + r.amount_cents, 0);
    def = {
      title: 'Fee collection / Kutipan yuran',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'receipt', label: 'Receipt' },
        { key: 'student_name', label: 'Student' },
        { key: 'method', label: 'Method' },
        { key: 'bank_ref', label: 'Bank ref' },
        { key: 'amount_cents', label: 'Amount (RM)', value: (r) => money(r.amount_cents) },
        { key: 'is_recovery', label: 'Recovery', value: (r) => (r.is_recovery ? 'Yes' : '') },
        { key: 'recorded_by_name', label: 'Recorded by' },
      ],
      rows: results,
      summary: [{ label: 'Total collected', value: `RM ${money(total).toFixed(2)}` }],
    };
  } else if (reportId === 'arrears-aging') {
    const { rows, buckets } = await agingReport(c.env, schoolId, to);
    def = {
      title: 'Arrears aging / Penuaan tunggakan',
      columns: [
        { key: 'student_name', label: 'Student' },
        { key: 'number', label: 'Invoice' },
        { key: 'type', label: 'Type' },
        { key: 'due_date', label: 'Original due' },
        { key: 'days_overdue', label: 'Days' },
        { key: 'outstanding', label: 'Outstanding (RM)', value: (r) => money(r.outstanding) },
        { key: 'bucket', label: 'Bucket' },
      ],
      rows,
      summary: [
        { label: 'Current', value: `RM ${money(buckets.current).toFixed(2)}` },
        { label: '1–30', value: `RM ${money(buckets.d1_30).toFixed(2)}` },
        { label: '31–60', value: `RM ${money(buckets.d31_60).toFixed(2)}` },
        { label: '61–90', value: `RM ${money(buckets.d61_90).toFixed(2)}` },
        { label: '> 90', value: `RM ${money(buckets.over90).toFixed(2)}` },
      ],
    };
  } else if (reportId === 'receipt-register') {
    const { results } = await db.prepare(
      `SELECT r.number, r.issued_at, r.amount_cents, r.status, r.cancel_reason, s.full_name AS student_name, p.method
       FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN students s ON s.id = p.student_id
       WHERE r.school_id = ? AND r.issued_at BETWEEN ? AND ? ORDER BY r.number`,
    )
      .bind(schoolId, from, `${to}T23:59:59`)
      .all();
    def = {
      title: 'Receipt register / Daftar resit',
      columns: [
        { key: 'number', label: 'Receipt' },
        { key: 'issued_at', label: 'Issued' },
        { key: 'student_name', label: 'Student' },
        { key: 'method', label: 'Method' },
        { key: 'amount_cents', label: 'Amount (RM)', value: (r) => money(r.amount_cents) },
        { key: 'status', label: 'Status' },
        { key: 'cancel_reason', label: 'Cancel reason' },
      ],
      rows: results,
      summary: [{ label: 'Receipts', value: results.length }],
    };
  } else if (reportId === 'refund-log') {
    const { results } = await db.prepare(
      `SELECT rf.created_at, s.full_name AS student_name, rf.amount_cents, rf.reason, rf.status,
        u1.full_name AS requester_name, u2.full_name AS approver_name, rf.approved_at
       FROM refunds rf JOIN students s ON s.id = rf.student_id
       LEFT JOIN users u1 ON u1.id = rf.requested_by LEFT JOIN users u2 ON u2.id = rf.approved_by
       WHERE rf.school_id = ? ORDER BY rf.created_at DESC`,
    )
      .bind(schoolId)
      .all();
    def = {
      title: 'Refund log / Log bayaran balik',
      columns: [
        { key: 'created_at', label: 'Requested' },
        { key: 'student_name', label: 'Student' },
        { key: 'amount_cents', label: 'Amount (RM)', value: (r) => money(r.amount_cents) },
        { key: 'reason', label: 'Reason' },
        { key: 'requester_name', label: 'Requested by' },
        { key: 'approver_name', label: 'Approved by' },
        { key: 'status', label: 'Status' },
      ],
      rows: results,
    };
  } else if (reportId === 'write-off-report') {
    const { results } = await db.prepare(
      `SELECT w.created_at, s.full_name AS student_name, w.amount_cents, w.recovered_cents, w.reason,
        u.full_name AS approver_name
       FROM write_offs w JOIN students s ON s.id = w.student_id LEFT JOIN users u ON u.id = w.approved_by
       WHERE w.school_id = ? ORDER BY w.created_at DESC`,
    )
      .bind(schoolId)
      .all();
    def = {
      title: 'Write-off report / Laporan hapus kira',
      columns: [
        { key: 'created_at', label: 'Date' },
        { key: 'student_name', label: 'Student' },
        { key: 'amount_cents', label: 'Written off (RM)', value: (r) => money(r.amount_cents) },
        { key: 'recovered_cents', label: 'Recovered (RM)', value: (r) => money(r.recovered_cents) },
        { key: 'reason', label: 'Reason' },
        { key: 'approver_name', label: 'Approved by' },
      ],
      rows: results,
    };
  } else if (reportId === 'audit-log') {
    const { results } = await db.prepare(
      `SELECT created_at, actor_name, actor_role, action, entity, entity_id, before_json, after_json
       FROM audit_logs WHERE school_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 5000`,
    )
      .bind(schoolId, from, `${to}T23:59:59`)
      .all();
    def = {
      title: 'Audit log / Log audit',
      columns: [
        { key: 'created_at', label: 'Time' },
        { key: 'actor_name', label: 'User' },
        { key: 'actor_role', label: 'Role' },
        { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Entity' },
        { key: 'entity_id', label: 'Record' },
        { key: 'before_json', label: 'Before' },
        { key: 'after_json', label: 'After' },
      ],
      rows: results,
    };
  } else if (reportId === 'state-consolidated') {
    const { results } = await db.prepare(
      `SELECT s.state, s.name AS school_name, s.category,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.status = 'active') AS students,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.monthly_tracking = 1) AS tracking_on,
        (SELECT COUNT(*) FROM teacher_schools tm WHERE tm.school_id = s.id AND tm.status = 'active') AS teachers,
        (SELECT COALESCE(SUM(p.amount_cents),0) FROM payments p WHERE p.school_id = s.id AND substr(p.paid_at,1,7) = ? AND (p.receipt_id IS NULL OR p.receipt_id NOT IN (SELECT id FROM receipts WHERE status = 'cancelled'))) AS collected_month,
        (SELECT COALESCE(SUM(i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents),0) FROM invoices i WHERE i.school_id = s.id AND i.status IN ('unpaid','partial')) AS outstanding
       FROM schools s ORDER BY s.state, s.name`,
    )
      .bind(monthOf(today()))
      .all();
    def = {
      title: 'State-level consolidated report / Laporan negeri',
      columns: [
        { key: 'state', label: 'State' },
        { key: 'school_name', label: 'School' },
        { key: 'students', label: 'Students' },
        { key: 'tracking_on', label: 'Tracking on' },
        { key: 'teachers', label: 'Teachers' },
        { key: 'collected_month', label: 'Collected (RM)', value: (r) => money(r.collected_month) },
        { key: 'outstanding', label: 'Outstanding (RM)', value: (r) => money(r.outstanding) },
      ],
      rows: results,
    };
  }

  const format = (c.req.query('format') || 'json').toLowerCase();
  await audit(c, 'view', 'report', reportId, { after: { format, from, to } });
  if (format === 'json') {
    // Functions do not survive JSON, so apply display formatting here. Money
    // columns stay in cents and are flagged for the page to format.
    const isMoney = (col) => /_cents$/.test(col.key) || col.key === 'outstanding' || /\(RM\)/i.test(col.label);
    const columns = def.columns.map(({ value, ...col }) => ({ ...col, money: isMoney(col) }));
    const rows = def.rows.map((row) => {
      const out = { ...row };
      for (const col of def.columns) if (col.value && !isMoney(col)) out[col.key] = col.value(row);
      return out;
    });
    return json({ report: reportId, ...def, columns, rows, from, to });
  }
  if (format === 'csv') {
    return new Response(toCsv(def.rows, def.columns), {
      headers: downloadHeaders(`${reportId}-${to}.csv`, 'text/csv; charset=utf-8'),
    });
  }
  if (format === 'xls' || format === 'excel') {
    return new Response(toExcel(def.rows, def.columns, def.title), {
      headers: downloadHeaders(`${reportId}-${to}.xls`, 'application/vnd.ms-excel; charset=utf-8'),
    });
  }
  if (format === 'pdf') {
    const columns = def.columns.map((col, i) => ({
      label: col.label,
      width: i === 0 ? 130 : 80,
      value: col.value || ((r) => r[col.key]),
    }));
    const bytes = buildReportPdf({
      school: auth.school,
      title: def.title,
      subtitle: `${from} — ${to}`,
      columns,
      rows: def.rows,
      summary: def.summary || [],
    });
    return new Response(bytes, { headers: downloadHeaders(`${reportId}-${to}.pdf`, 'application/pdf') });
  }
  return bad('Format tidak sah. / Invalid format.', 400);
});

export default reports;
