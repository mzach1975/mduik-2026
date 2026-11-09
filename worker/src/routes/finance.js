import { Hono } from 'hono';
import { authMiddleware, requireRoles } from '../lib/auth.js';
import { id, nowIso, today, readJson, bad, json, pageParams, pagingMeta, parseMoney, toCsv, toExcel, downloadHeaders, yearOf, monthOf } from '../lib/util.js';
import { audit, auditView } from '../lib/audit.js';
import { notifyParentsOfStudent, subjectFor } from '../lib/notify.js';
import {
  recordPayment,
  generateMonthlyInvoices,
  generateRegistrationInvoices,
  agingReport,
  studentBalance,
  refreshInvoice,
  dueDateFor,
  reversePayment,
} from '../lib/finance.js';
import { buildReceiptPdf, buildReportPdf, buildStatementPdf } from '../lib/pdf.js';

const finance = new Hono();
finance.use('*', authMiddleware);

const staff = requireRoles('school_admin', 'bursar');

function moneyOut(cents) {
  return Number(cents || 0) / 100;
}

function invoiceOut(row) {
  return { ...row, outstanding: row.amount_cents - row.paid_cents - row.credited_cents - row.waived_cents };
}

/* ----------------------------- Invoices ----------------------------- */
finance.get('/invoices', staff, async (c) => {
  const auth = c.get('auth');
  const { page, pageSize, offset } = pageParams(c);
  const where = ['i.school_id = ?'];
  const binds = [auth.activeSchool];
  if (c.req.query('status')) {
    where.push('i.status = ?');
    binds.push(c.req.query('status'));
  }
  if (c.req.query('type')) {
    where.push('i.type = ?');
    binds.push(c.req.query('type'));
  }
  if (c.req.query('studentId')) {
    where.push('i.student_id = ?');
    binds.push(c.req.query('studentId'));
  }
  if (c.req.query('q')) {
    where.push('(i.number LIKE ? OR s.full_name LIKE ?)');
    binds.push(`%${c.req.query('q')}%`, `%${c.req.query('q')}%`);
  }
  if (c.req.query('overdue') === '1') {
    where.push("i.due_date < ? AND i.status IN ('unpaid','partial')");
    binds.push(today());
  }
  const w = where.join(' AND ');
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM invoices i JOIN students s ON s.id = i.student_id WHERE ${w}`,
  )
    .bind(...binds)
    .first();
  const { results } = await c.env.DB.prepare(
    `SELECT i.*, s.full_name AS student_name FROM invoices i JOIN students s ON s.id = i.student_id
     WHERE ${w} ORDER BY i.issue_date DESC, i.number DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return json({ invoices: results.map(invoiceOut), ...pagingMeta(count?.n || 0, page, pageSize) });
});

finance.get('/invoices/:id', staff, async (c) => {
  const auth = c.get('auth');
  const invoice = await c.env.DB.prepare(
    'SELECT i.*, s.full_name AS student_name FROM invoices i JOIN students s ON s.id = i.student_id WHERE i.id = ? AND i.school_id = ?',
  )
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!invoice) return bad('Invois tidak dijumpai. / Invoice not found.', 404);
  const lines = await c.env.DB.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').bind(invoice.id).all();
  const allocations = await c.env.DB.prepare(
    `SELECT pa.*, p.paid_at, p.method, p.bank_ref, r.number AS receipt_number
     FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id LEFT JOIN receipts r ON r.id = p.receipt_id
     WHERE pa.invoice_id = ? ORDER BY p.paid_at`,
  )
    .bind(invoice.id)
    .all();
  return json({ invoice: invoiceOut(invoice), lines: lines.results, allocations: allocations.results });
});

/* ------------------------------ Payments ----------------------------- */
const MAX_AMOUNT_CENTS = 100000000; // RM 1,000,000

/** Whole cents between 1 and RM 1,000,000, from amountCents or a ringgit amount. */
function readAmount(body) {
  const raw = body.amountCents !== undefined && body.amountCents !== null && body.amountCents !== '' ? body.amountCents : null;
  const value = raw !== null ? (typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN) : parseMoney(body.amount);
  return Number.isInteger(value) && value > 0 && value <= MAX_AMOUNT_CENTS ? value : null;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

finance.post('/payments', staff, async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (typeof body.studentId !== 'string' || !body.studentId) return bad('Pelajar diperlukan. / A student is required.');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(body.studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Pelajar tidak dijumpai. / Student not found.', 404);
  const amountCents = readAmount(body);
  if (!amountCents) return bad('Jumlah bayaran tidak sah (RM 0.01 hingga RM 1,000,000). / Invalid payment amount (RM 0.01 to RM 1,000,000).');
  const paidAt = body.paidAt ? body.paidAt : today();
  if (!validDate(paidAt)) return bad('Tarikh bayaran tidak sah. / Invalid payment date.');
  if (paidAt > today()) return bad('Tarikh bayaran tidak boleh pada masa hadapan. / Payment date cannot be in the future.');
  if (body.recoveryInvoiceId !== undefined && body.recoveryInvoiceId !== null && typeof body.recoveryInvoiceId !== 'string') {
    return bad('Invois pemulihan tidak sah. / Invalid recovery invoice.');
  }
  if (!['cash', 'bank'].includes(body.method)) return bad('Kaedah bayaran tidak sah. / Invalid payment method.');
  if (body.method === 'bank' && !body.bankRef) return bad('Rujukan bank diperlukan untuk pindahan. / Bank reference is required for bank transfers.');
  try {
    const result = await recordPayment(c.env, {
      schoolId: auth.activeSchool,
      studentId: student.id,
      amountCents,
      method: body.method,
      bankRef: body.bankRef || '',
      paidAt,
      notes: body.notes || '',
      proofKey: body.proofKey || null,
      recordedBy: auth.user.id,
      recoveryInvoiceId: body.recoveryInvoiceId || null,
    });
    await audit(c, body.recoveryInvoiceId ? 'record_recovery' : 'record_payment', 'payment', result.payment.id, {
      after: { amountCents, method: body.method, studentId: student.id, receipt: result.receipt.number },
    });
    return json(
      {
        payment: result.payment,
        receipt: result.receipt,
        allocations: result.allocations.map((a) => ({ number: a.invoice.number, amount_cents: a.amount_cents, due_date: a.invoice.due_date })),
        credit: result.credit,
      },
      201,
    );
  } catch (err) {
    console.error('record payment failed', err?.stack || err);
    return bad(err.message === 'Student not found' ? 'Pelajar tidak dijumpai. / Student not found.' : 'Bayaran gagal direkodkan. / Payment could not be recorded.', err.message === 'Student not found' ? 404 : 500);
  }
});

finance.get('/payments', staff, async (c) => {
  const auth = c.get('auth');
  const { page, pageSize, offset } = pageParams(c);
  const where = ['p.school_id = ?'];
  const binds = [auth.activeSchool];
  if (c.req.query('studentId')) {
    where.push('p.student_id = ?');
    binds.push(c.req.query('studentId'));
  }
  if (c.req.query('from')) {
    where.push('p.paid_at >= ?');
    binds.push(c.req.query('from'));
  }
  if (c.req.query('to')) {
    where.push('p.paid_at <= ?');
    binds.push(c.req.query('to'));
  }
  const w = where.join(' AND ');
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM payments p WHERE ${w}`).bind(...binds).first();
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, s.full_name AS student_name, r.number AS receipt_number, r.id AS receipt_id, r.status AS receipt_status, u.full_name AS recorded_by_name
     FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN receipts r ON r.id = p.receipt_id
     LEFT JOIN users u ON u.id = p.recorded_by WHERE ${w} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return json({ payments: results, ...pagingMeta(count?.n || 0, page, pageSize) });
});

/* ------------------------------ Receipts ----------------------------- */
finance.get('/receipts', staff, async (c) => {
  const auth = c.get('auth');
  const { page, pageSize, offset } = pageParams(c);
  const where = ['r.school_id = ?'];
  const binds = [auth.activeSchool];
  if (c.req.query('status')) {
    where.push('r.status = ?');
    binds.push(c.req.query('status'));
  }
  if (c.req.query('q')) {
    where.push('(r.number LIKE ? OR s.full_name LIKE ?)');
    binds.push(`%${c.req.query('q')}%`, `%${c.req.query('q')}%`);
  }
  const w = where.join(' AND ');
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN students s ON s.id = p.student_id WHERE ${w}`,
  )
    .bind(...binds)
    .first();
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, p.method, p.bank_ref, p.student_id, s.full_name AS student_name
     FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN students s ON s.id = p.student_id
     WHERE ${w} ORDER BY r.issued_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return json({ receipts: results, ...pagingMeta(count?.n || 0, page, pageSize) });
});

async function loadReceipt(c, receiptId) {
  const auth = c.get('auth');
  const receipt = await c.env.DB.prepare('SELECT * FROM receipts WHERE id = ? AND school_id = ?')
    .bind(receiptId, auth.activeSchool)
    .first();
  if (!receipt) return null;
  const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(receipt.payment_id).first();
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(payment.student_id).first();
  const parentLink = await c.env.DB.prepare(
    'SELECT p.* FROM parents p JOIN parent_students ps ON ps.parent_id = p.id WHERE ps.student_id = ? LIMIT 1',
  )
    .bind(student.id)
    .first();
  const allocations = await c.env.DB.prepare(
    `SELECT pa.amount_cents, i.number, i.type, i.period, i.due_date FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id WHERE pa.payment_id = ?`,
  )
    .bind(payment.id)
    .all();
  return {
    school: auth.school,
    receipt,
    payment,
    student,
    parent: parentLink,
    allocations: allocations.results,
    cancelled: receipt.status === 'cancelled',
  };
}

finance.get('/receipts/:id/pdf', staff, async (c) => {
  const data = await loadReceipt(c, c.req.param('id'));
  if (!data) return bad('Resit tidak dijumpai. / Receipt not found.', 404);
  await audit(c, 'export', 'receipt', data.receipt.id, { after: { format: 'pdf' } });
  const bytes = buildReceiptPdf(data);
  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${data.receipt.number.replace(/\//g, '-')}.pdf"`,
      'cache-control': 'no-store',
    },
  });
});

finance.post('/receipts/:id/cancel', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (!body.reason) return bad('Sebab pembatalan diperlukan. / A cancellation reason is required.');
  const receipt = await c.env.DB.prepare('SELECT * FROM receipts WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!receipt) return bad('Not found', 404);
  if (receipt.status === 'cancelled') return bad('Resit sudah dibatalkan. / Receipt already cancelled.');
  let reversal;
  try {
    reversal = await reversePayment(c.env, receipt.payment_id);
  } catch (err) {
    return bad(err.message, err.status || 400);
  }
  await c.env.DB.prepare("UPDATE receipts SET status = 'cancelled', cancel_reason = ?, cancelled_at = ? WHERE id = ?")
    .bind(body.reason, nowIso(), receipt.id)
    .run();
  await audit(c, 'cancel', 'receipt', receipt.id, {
    before: { status: 'issued' },
    after: { status: 'cancelled', reason: body.reason, reversedAllocations: reversal.allocations, creditVoided: reversal.creditVoided },
  });
  return json({ ok: true, ...reversal });
});

/* ------------------------------- Refunds ------------------------------ */
finance.get('/refunds', staff, async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    `SELECT rf.*, s.full_name AS student_name, u1.full_name AS requester_name, u2.full_name AS approver_name
     FROM refunds rf JOIN students s ON s.id = rf.student_id
     LEFT JOIN users u1 ON u1.id = rf.requested_by LEFT JOIN users u2 ON u2.id = rf.approved_by
     WHERE rf.school_id = ? ORDER BY rf.created_at DESC LIMIT 200`,
  )
    .bind(auth.activeSchool)
    .all();
  return json({ refunds: results });
});

finance.post('/refunds', staff, async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (typeof body.studentId !== 'string' || !body.studentId) return bad('Pelajar diperlukan. / A student is required.');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(body.studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Pelajar tidak dijumpai. / Student not found.', 404);
  if (!body.reason || String(body.reason).trim().length < 3) return bad('Sebab diperlukan. / Reason is required.');
  const amount = readAmount(body);
  if (!amount) return bad('Jumlah tidak sah. / Invalid amount.');
  const credit = await c.env.DB.prepare('SELECT * FROM credits WHERE student_id = ? AND school_id = ? AND remaining_cents > 0 ORDER BY created_at')
    .bind(student.id, auth.activeSchool)
    .first();
  if (!credit) return bad('Tiada kredit untuk dipulangkan. / No credit available to refund.');
  const available = await c.env.DB.prepare('SELECT COALESCE(SUM(remaining_cents),0) AS n FROM credits WHERE student_id = ? AND school_id = ?')
    .bind(student.id, auth.activeSchool)
    .first();
  if (amount > available.n) return bad('Jumlah melebihi kredit tersedia. / Amount exceeds available credit.');
  const refundId = id('ref');
  await c.env.DB.prepare(
    `INSERT INTO refunds (id, school_id, student_id, credit_id, amount_cents, reason, status, requested_by, created_at)
     VALUES (?,?,?,?,?,?,'pending',?,?)`,
  )
    .bind(refundId, auth.activeSchool, student.id, credit.id, amount, body.reason, auth.user.id, nowIso())
    .run();
  await audit(c, 'request', 'refund', refundId, { after: { studentId: student.id, amount } });
  return json({ id: refundId }, 201);
});

finance.post('/refunds/:id/approve', staff, async (c) => {
  const auth = c.get('auth');
  const refund = await c.env.DB.prepare('SELECT * FROM refunds WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!refund) return bad('Not found', 404);
  if (refund.status !== 'pending') return bad('Permohonan sudah diproses. / Request already processed.');
  if (refund.requested_by === auth.user.id) {
    return bad('Pemohon tidak boleh meluluskan bayaran balik sendiri. / The requester cannot approve their own refund.', 403);
  }
  const available = await c.env.DB.prepare('SELECT COALESCE(SUM(remaining_cents),0) AS n FROM credits WHERE student_id = ? AND school_id = ?')
    .bind(refund.student_id, refund.school_id)
    .first();
  if (available.n < refund.amount_cents) return bad('Kredit tidak mencukupi. / Insufficient credit.');
  let toReduce = refund.amount_cents;
  const { results: credits } = await c.env.DB.prepare(
    'SELECT * FROM credits WHERE student_id = ? AND school_id = ? AND remaining_cents > 0 ORDER BY created_at',
  )
    .bind(refund.student_id, refund.school_id)
    .all();
  for (const cr of credits) {
    if (toReduce <= 0) break;
    const take = Math.min(cr.remaining_cents, toReduce);
    await c.env.DB.prepare('UPDATE credits SET remaining_cents = remaining_cents - ? WHERE id = ?').bind(take, cr.id).run();
    toReduce -= take;
  }
  await c.env.DB.prepare("UPDATE refunds SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?")
    .bind(auth.user.id, nowIso(), refund.id)
    .run();
  await audit(c, 'approve', 'refund', refund.id, { after: { amount: refund.amount_cents, approvedBy: auth.user.id } });
  await notifyParentsOfStudent(c.env, refund.student_id, {
    schoolId: auth.activeSchool,
    type: 'refund_approved',
    subject: 'Bayaran balik diluluskan / Refund approved',
    body: `Bayaran balik RM ${(refund.amount_cents / 100).toFixed(2)} telah diluluskan.\nA refund of RM ${(refund.amount_cents / 100).toFixed(2)} has been approved.`,
    language: 'bm',
  });
  return json({ ok: true });
});

finance.post('/refunds/:id/reject', staff, async (c) => {
  const auth = c.get('auth');
  const refund = await c.env.DB.prepare('SELECT * FROM refunds WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!refund) return bad('Not found', 404);
  if (refund.status !== 'pending') return bad('Permohonan sudah diproses. / Request already processed.');
  const body = await readJson(c);
  await c.env.DB.prepare("UPDATE refunds SET status = 'rejected', approved_by = ? WHERE id = ?").bind(auth.user.id, refund.id).run();
  await audit(c, 'reject', 'refund', refund.id, { after: { reason: body.reason || '' } });
  return json({ ok: true });
});

/* ------------------------------ Write-offs ----------------------------- */
finance.get('/write-offs', staff, async (c) => {
  const auth = c.get('auth');
  const { results } = await c.env.DB.prepare(
    `SELECT w.*, s.full_name AS student_name, u.full_name AS approver_name
     FROM write_offs w JOIN students s ON s.id = w.student_id LEFT JOIN users u ON u.id = w.approved_by
     WHERE w.school_id = ? ORDER BY w.created_at DESC LIMIT 200`,
  )
    .bind(auth.activeSchool)
    .all();
  return json({ writeOffs: results });
});

finance.post('/write-offs', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  if (!body.reason || String(body.reason).trim().length < 3) return bad('Sebab diperlukan. / A reason is required.');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(body.studentId, auth.activeSchool)
    .first();
  if (!student) return bad('Student not found', 404);
  const invoiceIds = Array.isArray(body.invoiceIds) ? body.invoiceIds : [];
  let invoices;
  if (invoiceIds.length) {
    const placeholders = invoiceIds.map(() => '?').join(',');
    invoices = await c.env.DB.prepare(
      `SELECT * FROM invoices WHERE id IN (${placeholders}) AND student_id = ? AND school_id = ? AND status IN ('unpaid','partial')`,
    )
      .bind(...invoiceIds, student.id, auth.activeSchool)
      .all();
  } else {
    invoices = await c.env.DB.prepare(
      "SELECT * FROM invoices WHERE student_id = ? AND school_id = ? AND status IN ('unpaid','partial')",
    )
      .bind(student.id, auth.activeSchool)
      .all();
  }
  if (!invoices.results.length) return bad('Tiada invois tertunggak untuk dihapus kira. / No outstanding invoices to write off.');
  let total = 0;
  const touched = [];
  for (const inv of invoices.results) {
    const outstanding = inv.amount_cents - inv.paid_cents - inv.credited_cents - inv.waived_cents;
    if (outstanding <= 0) continue;
    await c.env.DB.prepare('UPDATE invoices SET waived_cents = waived_cents + ?, status = ? WHERE id = ?')
      .bind(outstanding, 'waived', inv.id)
      .run();
    total += outstanding;
    touched.push(inv.id);
  }
  const writeOffId = id('wof');
  await c.env.DB.prepare(
    'INSERT INTO write_offs (id, school_id, student_id, amount_cents, reason, invoice_ids, approved_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(writeOffId, auth.activeSchool, student.id, total, body.reason, JSON.stringify(touched), auth.user.id, nowIso())
    .run();
  await audit(c, 'write_off', 'student', student.id, {
    after: { writeOffId, amountCents: total, reason: body.reason, invoices: touched },
  });
  return json({ id: writeOffId, amountCents: total, invoices: touched.length }, 201);
});

/* ------------------------------- Arrears ------------------------------ */
finance.get('/arrears', staff, async (c) => {
  const auth = c.get('auth');
  const { rows, buckets } = await agingReport(c.env, auth.activeSchool, c.req.query('asOf') || today());
  return json({ rows: rows.map(invoiceOut), buckets });
});

finance.get('/reminders', staff, async (c) => {
  const auth = c.get('auth');
  const status = c.req.query('status');
  const { results } = await c.env.DB.prepare(
    `SELECT rm.*, s.full_name AS student_name, i.number AS invoice_number, i.amount_cents,
       (i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents) AS outstanding
     FROM reminders rm JOIN students s ON s.id = rm.student_id JOIN invoices i ON i.id = rm.invoice_id
     WHERE rm.school_id = ? ${status ? 'AND rm.status = ?' : ''} ORDER BY rm.created_at DESC LIMIT 200`,
  )
    .bind(auth.activeSchool, ...(status ? [status] : []))
    .all();
  return json({ reminders: results });
});

finance.post('/reminders/:id/release', requireRoles('school_admin', 'bursar'), async (c) => {
  const auth = c.get('auth');
  const reminder = await c.env.DB.prepare(
    `SELECT rm.*, i.number AS invoice_number, i.due_date, i.amount_cents, i.paid_cents, i.credited_cents, i.waived_cents, s.full_name AS student_name
     FROM reminders rm JOIN invoices i ON i.id = rm.invoice_id JOIN students s ON s.id = rm.student_id
     WHERE rm.id = ? AND rm.school_id = ?`,
  )
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!reminder) return bad('Not found', 404);
  if (reminder.status !== 'pending_review') return bad('Peringatan sudah dilepaskan. / Reminder already released.');
  const outstanding = reminder.amount_cents - reminder.paid_cents - reminder.credited_cents - reminder.waived_cents;
  await c.env.DB.prepare("UPDATE reminders SET status = 'sent', released_by = ? WHERE id = ?").bind(auth.user.id, reminder.id).run();
  await notifyParentsOfStudent(c.env, reminder.student_id, {
    schoolId: auth.activeSchool,
    type: 'arrears_reminder',
    subject: `Notis rasmi / Formal notice — ${reminder.invoice_number}`,
    body: `Notis rasmi: invois ${reminder.invoice_number} sebanyak RM ${(outstanding / 100).toFixed(2)} masih belum dibayar sejak ${reminder.due_date}. Sila hubungi pihak sekolah segera.\nFormal notice: invoice ${reminder.invoice_number} for RM ${(outstanding / 100).toFixed(2)} remains unpaid since ${reminder.due_date}. Please contact the school immediately.`,
    language: 'bm',
  });
  await audit(c, 'release', 'reminder', reminder.id, { after: { stage: reminder.stage } });
  return json({ ok: true });
});

/* ---------------------------- Summary / runs -------------------------- */
finance.get('/summary', staff, async (c) => {
  const auth = c.get('auth');
  const day = today();
  const month = monthOf(day);
  const collectedToday = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE school_id = ? AND paid_at = ? AND (receipt_id IS NULL OR receipt_id NOT IN (SELECT id FROM receipts WHERE status = 'cancelled'))",
  )
    .bind(auth.activeSchool, day)
    .first();
  const collectedMonth = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS n FROM payments WHERE school_id = ? AND substr(paid_at,1,7) = ? AND (receipt_id IS NULL OR receipt_id NOT IN (SELECT id FROM receipts WHERE status = 'cancelled'))",
  )
    .bind(auth.activeSchool, month)
    .first();
  const outstanding = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(amount_cents - paid_cents - credited_cents - waived_cents),0) AS n FROM invoices WHERE school_id = ? AND status IN ('unpaid','partial')",
  )
    .bind(auth.activeSchool)
    .first();
  const credits = await c.env.DB.prepare('SELECT COALESCE(SUM(remaining_cents),0) AS n FROM credits WHERE school_id = ?')
    .bind(auth.activeSchool)
    .first();
  const { buckets } = await agingReport(c.env, auth.activeSchool, day);
  const { results: latest } = await c.env.DB.prepare(
    `SELECT r.*, s.full_name AS student_name FROM receipts r JOIN payments p ON p.id = r.payment_id JOIN students s ON s.id = p.student_id
     WHERE r.school_id = ? ORDER BY r.issued_at DESC LIMIT 6`,
  )
    .bind(auth.activeSchool)
    .all();
  const pendingReminders = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM reminders WHERE school_id = ? AND status = 'pending_review'",
  )
    .bind(auth.activeSchool)
    .first();
  return json({
    collectedToday: collectedToday.n,
    collectedMonth: collectedMonth.n,
    outstanding: outstanding.n,
    credits: credits.n,
    buckets,
    latestReceipts: latest,
    pendingReminders: pendingReminders.n,
  });
});

finance.post('/run-monthly', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  const month = body.month || monthOf(today());
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2020 || Number(month.slice(0, 4)) > 2100) {
    return bad('Bulan tidak sah (YYYY-MM). / Invalid month (YYYY-MM).');
  }
  const result = await generateMonthlyInvoices(c.env, auth.activeSchool, month);
  await audit(c, 'generate', 'monthly_invoices', month, { after: { created: result.created.length } });
  return json({ created: result.created.length, month: result.month, dueDate: result.dueDate, skipped: result.skipped });
});

finance.post('/run-registration', requireRoles('school_admin'), async (c) => {
  const auth = c.get('auth');
  const body = await readJson(c);
  const year = Number(body.year || yearOf(today()));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return bad('Tahun tidak sah. / Invalid year.');
  const result = await generateRegistrationInvoices(c.env, auth.activeSchool, year);
  await audit(c, 'generate', 'registration_invoices', String(year), { after: { created: result.created.length } });
  return json({ created: result.created.length, year, dueDate: result.dueDate });
});

/* ------------------------------ Exports ------------------------------ */
const EXPORTS = {
  invoices: {
    title: 'Invoices',
    columns: [
      { label: 'Invoice', key: 'number' },
      { label: 'Student', key: 'student_name' },
      { label: 'Type', key: 'type' },
      { label: 'Period', key: 'period' },
      { label: 'Issue date', key: 'issue_date' },
      { label: 'Due date', key: 'due_date' },
      { label: 'Amount', value: (r) => moneyOut(r.amount_cents) },
      { label: 'Paid', value: (r) => moneyOut(r.paid_cents) },
      { label: 'Credited', value: (r) => moneyOut(r.credited_cents) },
      { label: 'Waived', value: (r) => moneyOut(r.waived_cents) },
      { label: 'Outstanding', value: (r) => moneyOut(r.amount_cents - r.paid_cents - r.credited_cents - r.waived_cents) },
      { label: 'Status', key: 'status' },
    ],
  },
  receipts: {
    title: 'Receipts',
    columns: [
      { label: 'Receipt', key: 'number' },
      { label: 'Date', key: 'issued_at' },
      { label: 'Student', key: 'student_name' },
      { label: 'Method', key: 'method' },
      { label: 'Bank ref', key: 'bank_ref' },
      { label: 'Amount', value: (r) => moneyOut(r.amount_cents) },
      { label: 'Status', key: 'status' },
      { label: 'Cancel reason', key: 'cancel_reason' },
    ],
  },
  refunds: {
    title: 'Refund log',
    columns: [
      { label: 'Date', key: 'created_at' },
      { label: 'Student', key: 'student_name' },
      { label: 'Amount', value: (r) => moneyOut(r.amount_cents) },
      { label: 'Reason', key: 'reason' },
      { label: 'Requested by', key: 'requester_name' },
      { label: 'Approved by', key: 'approver_name' },
      { label: 'Status', key: 'status' },
    ],
  },
  'write-offs': {
    title: 'Write-off report',
    columns: [
      { label: 'Date', key: 'created_at' },
      { label: 'Student', key: 'student_name' },
      { label: 'Amount', value: (r) => moneyOut(r.amount_cents) },
      { label: 'Recovered', value: (r) => moneyOut(r.recovered_cents) },
      { label: 'Reason', key: 'reason' },
      { label: 'Approver', key: 'approver_name' },
    ],
  },
};

finance.get('/exports/:type', staff, async (c) => {
  const auth = c.get('auth');
  const type = c.req.param('type');
  const format = (c.req.query('format') || 'csv').toLowerCase();
  const def = EXPORTS[type];
  if (!def) return bad('Jenis eksport tidak sah. / Invalid export type.', 404);
  let rows;
  if (type === 'invoices') {
    rows = (await c.env.DB.prepare(
      'SELECT i.*, s.full_name AS student_name FROM invoices i JOIN students s ON s.id = i.student_id WHERE i.school_id = ? ORDER BY i.issue_date DESC',
    ).bind(auth.activeSchool).all()).results;
  } else if (type === 'receipts') {
    rows = (await c.env.DB.prepare(
      `SELECT r.*, p.method, p.bank_ref, s.full_name AS student_name FROM receipts r JOIN payments p ON p.id = r.payment_id
       JOIN students s ON s.id = p.student_id WHERE r.school_id = ? ORDER BY r.issued_at DESC`,
    ).bind(auth.activeSchool).all()).results;
  } else if (type === 'refunds') {
    rows = (await c.env.DB.prepare(
      `SELECT rf.*, s.full_name AS student_name, u1.full_name AS requester_name, u2.full_name AS approver_name
       FROM refunds rf JOIN students s ON s.id = rf.student_id LEFT JOIN users u1 ON u1.id = rf.requested_by
       LEFT JOIN users u2 ON u2.id = rf.approved_by WHERE rf.school_id = ? ORDER BY rf.created_at DESC`,
    ).bind(auth.activeSchool).all()).results;
  } else {
    rows = (await c.env.DB.prepare(
      `SELECT w.*, s.full_name AS student_name, u.full_name AS approver_name FROM write_offs w
       JOIN students s ON s.id = w.student_id LEFT JOIN users u ON u.id = w.approved_by WHERE w.school_id = ? ORDER BY w.created_at DESC`,
    ).bind(auth.activeSchool).all()).results;
  }
  await audit(c, 'export', type, null, { after: { format, rows: rows.length } });
  if (format === 'xls' || format === 'excel') {
    return new Response(toExcel(rows, def.columns, def.title), {
      headers: downloadHeaders(`${type}-${today()}.xls`, 'application/vnd.ms-excel; charset=utf-8'),
    });
  }
  if (format === 'pdf') {
    const columns = def.columns.map((col, i) => ({
      label: col.label,
      width: i === 0 ? 120 : 75,
      value: col.value || ((r) => r[col.key]),
    }));
    const bytes = buildReportPdf({
      school: auth.school,
      title: def.title,
      subtitle: `MDUIK • ${auth.school?.name || ''}`,
      columns,
      rows,
    });
    return new Response(bytes, { headers: downloadHeaders(`${type}-${today()}.pdf`, 'application/pdf') });
  }
  return new Response(toCsv(rows, def.columns), {
    headers: downloadHeaders(`${type}-${today()}.csv`, 'text/csv; charset=utf-8'),
  });
});

finance.get('/ledger', staff, async (c) => {
  const auth = c.get('auth');
  const from = c.req.query('from') || `${yearOf(today())}-01-01`;
  const to = c.req.query('to') || today();
  const format = (c.req.query('format') || 'json').toLowerCase();
  const { results: invoices } = await c.env.DB.prepare(
    `SELECT i.issue_date AS date, i.number AS ref, 'Invoice' AS kind, i.type, i.period,
       s.full_name AS student_name, i.amount_cents AS debit, 0 AS credit
     FROM invoices i JOIN students s ON s.id = i.student_id
     WHERE i.school_id = ? AND i.issue_date BETWEEN ? AND ? AND i.status != 'draft'`,
  )
    .bind(auth.activeSchool, from, to)
    .all();
  const { results: payments } = await c.env.DB.prepare(
    `SELECT p.paid_at AS date, COALESCE(r.number, p.id) AS ref, 'Payment' AS kind, p.method AS type, '' AS period,
       s.full_name AS student_name, 0 AS debit, p.amount_cents AS credit
     FROM payments p JOIN students s ON s.id = p.student_id LEFT JOIN receipts r ON r.id = p.receipt_id
     WHERE p.school_id = ? AND p.paid_at BETWEEN ? AND ? AND (r.id IS NULL OR r.status != 'cancelled')`,
  )
    .bind(auth.activeSchool, from, to)
    .all();
  const rows = [...invoices, ...payments].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let balance = 0;
  const withBalance = rows.map((r) => {
    balance += r.debit - r.credit;
    return { ...r, balance };
  });
  if (format === 'csv' || format === 'xls' || format === 'pdf') {
    const columns = [
      { label: 'Date', key: 'date' },
      { label: 'Reference', key: 'ref' },
      { label: 'Kind', key: 'kind' },
      { label: 'Type', key: 'type' },
      { label: 'Student', key: 'student_name' },
      { label: 'Debit (RM)', value: (r) => moneyOut(r.debit) },
      { label: 'Credit (RM)', value: (r) => moneyOut(r.credit) },
      { label: 'Balance (RM)', value: (r) => moneyOut(r.balance) },
    ];
    await audit(c, 'export', 'ledger', null, { after: { from, to, format } });
    if (format === 'xls') {
      return new Response(toExcel(withBalance, columns, 'Ledger'), {
        headers: downloadHeaders(`ledger-${from}-${to}.xls`, 'application/vnd.ms-excel; charset=utf-8'),
      });
    }
    if (format === 'pdf') {
      const bytes = buildReportPdf({
        school: auth.school,
        title: 'General Ledger / Lejar Am',
        subtitle: `${from} — ${to}`,
        columns: columns.map((cc, i) => ({ label: cc.label, width: i === 0 ? 80 : 85, value: cc.value || ((r) => r[cc.key]) })),
        rows: withBalance,
      });
      return new Response(bytes, { headers: downloadHeaders(`ledger-${from}-${to}.pdf`, 'application/pdf') });
    }
    return new Response(toCsv(withBalance, columns), {
      headers: downloadHeaders(`ledger-${from}-${to}.csv`, 'text/csv; charset=utf-8'),
    });
  }
  const totals = withBalance.reduce((acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }), { debit: 0, credit: 0 });
  return json({ rows: withBalance, totals, from, to });
});

finance.get('/students/:id/statement.pdf', staff, async (c) => {
  const auth = c.get('auth');
  const student = await c.env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(c.req.param('id'), auth.activeSchool)
    .first();
  if (!student) return bad('Not found', 404);
  const invoices = await c.env.DB.prepare('SELECT * FROM invoices WHERE student_id = ? ORDER BY due_date').bind(student.id).all();
  const bal = await studentBalance(c.env, student.id);
  const bytes = buildStatementPdf({
    school: auth.school,
    student,
    invoices: invoices.results,
    summary: [
      { label: 'Tertunggak / Outstanding', value: `RM ${(bal.outstanding / 100).toFixed(2)}` },
      { label: 'Kredit / Credit', value: `RM ${(bal.credit / 100).toFixed(2)}` },
    ],
  });
  await audit(c, 'export', 'statement', student.id, { after: { format: 'pdf' } });
  return new Response(bytes, { headers: downloadHeaders(`statement-${student.id}.pdf`, 'application/pdf') });
});

export default finance;
