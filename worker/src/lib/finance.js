import { id, nowIso, today, monthOf, yearOf, daysBetween, addMonths } from './util.js';
import { notifyParentsOfStudent, notifyRoles, subjectFor } from './notify.js';

/** Allocate the next sequential document number for a school. */
export async function nextNumber(env, schoolId, kind, prefix, year = new Date().getFullYear()) {
  const key = `${kind}:${year}`;
  const row = await env.DB.prepare(
    `INSERT INTO counters (school_id, name, value) VALUES (?, ?, 1)
     ON CONFLICT(school_id, name) DO UPDATE SET value = value + 1
     RETURNING value`,
  )
    .bind(schoolId, key)
    .first();
  return `${prefix}/${year}/${String(row.value).padStart(5, '0')}`;
}

export function invoiceStatus(inv) {
  const outstanding = inv.amount_cents - inv.paid_cents - inv.credited_cents - inv.waived_cents;
  if (inv.waived_cents >= inv.amount_cents) return 'waived';
  if (outstanding <= 0) return 'paid';
  if (inv.paid_cents + inv.credited_cents > 0) return 'partial';
  return 'unpaid';
}

export async function refreshInvoice(env, invoiceId) {
  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(invoiceId).first();
  if (!inv) return null;
  const status = invoiceStatus(inv);
  if (status !== inv.status) {
    await env.DB.prepare('UPDATE invoices SET status = ? WHERE id = ?').bind(status, invoiceId).run();
  }
  return { ...inv, status };
}

export function dueDateFor(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(Math.max(1, Number(day) || 1), last);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Apply available credit to an invoice (earliest credit first). Credit is held per school and only pays that school's invoices. */
export async function applyCreditsToInvoice(env, invoiceId) {
  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(invoiceId).first();
  if (!inv || inv.status === 'waived') return 0;
  let outstanding = inv.amount_cents - inv.paid_cents - inv.credited_cents - inv.waived_cents;
  if (outstanding <= 0) return 0;
  const { results: credits } = await env.DB.prepare(
    'SELECT * FROM credits WHERE student_id = ? AND school_id = ? AND remaining_cents > 0 ORDER BY created_at ASC',
  )
    .bind(inv.student_id, inv.school_id)
    .all();
  let applied = 0;
  for (const credit of credits) {
    if (outstanding <= 0) break;
    const take = Math.min(credit.remaining_cents, outstanding);
    await env.DB.prepare('UPDATE credits SET remaining_cents = remaining_cents - ? WHERE id = ?')
      .bind(take, credit.id)
      .run();
    await env.DB.prepare('UPDATE invoices SET credited_cents = credited_cents + ? WHERE id = ?')
      .bind(take, invoiceId)
      .run();
    outstanding -= take;
    applied += take;
  }
  if (applied) await refreshInvoice(env, invoiceId);
  return applied;
}

export async function createInvoice(env, {
  schoolId,
  studentId,
  type,
  period,
  issueDate = today(),
  dueDate,
  amountCents,
  description,
  lines = [],
}) {
  const existing = await env.DB.prepare(
    'SELECT * FROM invoices WHERE school_id = ? AND student_id = ? AND type = ? AND period = ?',
  )
    .bind(schoolId, studentId, type, period)
    .first();
  if (existing) return { invoice: existing, created: false };
  const school = await env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(schoolId).first();
  const number = await nextNumber(env, schoolId, 'invoice', school?.invoice_prefix || 'INV', yearOf(issueDate));
  const invoiceId = id('inv');
  await env.DB.prepare(
    `INSERT INTO invoices
      (id, school_id, student_id, number, type, period, issue_date, due_date, amount_cents, status, description, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      invoiceId,
      schoolId,
      studentId,
      number,
      type,
      period,
      issueDate,
      dueDate,
      amountCents,
      'unpaid',
      description || null,
      nowIso(),
    )
    .run();
  const lineRows = lines.length ? lines : [{ description: description || type, amount: amountCents }];
  for (const line of lineRows) {
    await env.DB.prepare('INSERT INTO invoice_lines (id, invoice_id, description, amount_cents) VALUES (?,?,?,?)')
      .bind(id('inl'), invoiceId, line.description, line.amount)
      .run();
  }
  await applyCreditsToInvoice(env, invoiceId);
  const invoice = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(invoiceId).first();
  return { invoice, created: true };
}

/** SQL for a student's latest approved adjusted monthly rate (NULL when none). `s` is the students alias. */
export const ADJUSTED_RATE_SQL = `(SELECT fa.new_rate_cents FROM fee_adjustments fa
  WHERE fa.student_id = s.id AND fa.school_id = s.school_id AND fa.status = 'approved'
  ORDER BY fa.effective_date DESC, fa.created_at DESC LIMIT 1)`;

/**
 * The monthly rate used for new invoices: the student's approved adjusted rate
 * if one exists, otherwise the school's default monthly fee at that moment.
 * Issued invoices keep their own amount (BR-08).
 */
export function monthlyRate(adjustedRate, school) {
  return adjustedRate === null || adjustedRate === undefined ? school.monthly_fee_cents : adjustedRate;
}

export async function studentMonthlyRate(env, studentId, school) {
  const row = await env.DB.prepare(`SELECT ${ADJUSTED_RATE_SQL} AS rate FROM students s WHERE s.id = ?`).bind(studentId).first();
  return monthlyRate(row?.rate, school);
}

/** Generate monthly invoices for one school. Idempotent per student/month. */
export async function generateMonthlyInvoices(env, schoolId, month = monthOf(today()), actorName = 'system') {
  const school = await env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(schoolId).first();
  if (!school) return { created: [], skipped: 0 };
  const [y, m] = month.split('-').map(Number);
  const dueDate = dueDateFor(y, m, school.monthly_due_day);
  const { results: students } = await env.DB.prepare(
    `SELECT s.*, ${ADJUSTED_RATE_SQL} AS adjusted_rate FROM students s WHERE s.school_id = ? AND s.status = 'active' AND s.monthly_tracking = 1
     AND (s.tracking_start IS NULL OR s.tracking_start <= ?)`,
  )
    .bind(schoolId, month)
    .all();
  const created = [];
  for (const student of students) {
    const amount = monthlyRate(student.adjusted_rate, school);
    const { invoice, created: isNew } = await createInvoice(env, {
      schoolId,
      studentId: student.id,
      type: 'monthly',
      period: month,
      issueDate: today(),
      dueDate,
      amountCents: amount,
      description: `Yuran bulanan ${month} / Monthly fee ${month}`,
      lines: [{ description: `Yuran bulanan / Monthly fee (${month})`, amount }],
    });
    if (isNew) {
      created.push(invoice);
      await notifyParentsOfStudent(env, student.id, {
        schoolId,
        type: 'invoice_issued',
        subject: subjectFor('invoice_issued', 'bm') + ` — ${month}`,
        body: `Invois ${invoice.number} sebanyak RM ${(amount / 100).toFixed(2)} telah dikeluarkan untuk ${student.full_name}. Tarikh akhir: ${dueDate}.\nInvoice ${invoice.number} for RM ${(amount / 100).toFixed(2)} has been issued for ${student.full_name}. Due date: ${dueDate}.`,
        language: 'bm',
      });
    }
  }
  return { created, skipped: students.length - created.length, month, dueDate };
}

/** Generate registration fee invoices once per student per calendar year. */
export async function generateRegistrationInvoices(env, schoolId, year = yearOf(today())) {
  const school = await env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(schoolId).first();
  if (!school) return { created: [] };
  const dueDate = dueDateFor(year, school.reg_due_month, school.reg_due_day);
  const { results: students } = await env.DB.prepare(
    "SELECT * FROM students WHERE school_id = ? AND status = 'active'",
  )
    .bind(schoolId)
    .all();
  const created = [];
  for (const student of students) {
    const amount = school.registration_fee_cents;
    const { invoice, created: isNew } = await createInvoice(env, {
      schoolId,
      studentId: student.id,
      type: 'registration',
      period: String(year),
      issueDate: today(),
      dueDate,
      amountCents: amount,
      description: `Yuran pendaftaran ${year} / Registration fee ${year}`,
    });
    if (isNew) {
      created.push(invoice);
      await notifyParentsOfStudent(env, student.id, {
        schoolId,
        type: 'invoice_issued',
        subject: subjectFor('invoice_issued', 'bm') + ` — ${year}`,
        body: `Yuran pendaftaran ${year} sebanyak RM ${(amount / 100).toFixed(2)} telah dikenakan. Tarikh akhir: ${dueDate}.\nThe ${year} registration fee of RM ${(amount / 100).toFixed(2)} has been charged. Due date: ${dueDate}.`,
        language: 'bm',
      });
    }
  }
  return { created, dueDate, year };
}

/** Register a payment and allocate it oldest-invoice-first. */
export async function recordPayment(env, {
  schoolId,
  studentId,
  amountCents,
  method,
  bankRef,
  paidAt,
  notes,
  proofKey,
  recordedBy,
  recoveryInvoiceId = null,
}) {
  const school = await env.DB.prepare('SELECT * FROM schools WHERE id = ?').bind(schoolId).first();
  const student = await env.DB.prepare('SELECT * FROM students WHERE id = ? AND school_id = ?')
    .bind(studentId, schoolId)
    .first();
  if (!student) throw new Error('Student not found');
  if (!amountCents || amountCents <= 0) throw new Error('Amount must be greater than zero');
  const paymentId = id('pay');
  const isRecovery = recoveryInvoiceId ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO payments
      (id, school_id, student_id, amount_cents, method, bank_ref, paid_at, proof_key, notes, is_recovery, recorded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      paymentId,
      schoolId,
      studentId,
      amountCents,
      method,
      bankRef || null,
      paidAt || today(),
      proofKey || null,
      notes || null,
      isRecovery,
      recordedBy || null,
      nowIso(),
    )
    .run();

  let remaining = amountCents;
  const allocations = [];

  if (recoveryInvoiceId) {
    const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ? AND school_id = ?')
      .bind(recoveryInvoiceId, schoolId)
      .first();
    if (inv) {
      const take = Math.min(remaining, inv.waived_cents);
      if (take > 0) {
        await env.DB.prepare('UPDATE invoices SET waived_cents = waived_cents - ?, paid_cents = paid_cents + ? WHERE id = ?')
          .bind(take, take, inv.id)
          .run();
        await env.DB.prepare('INSERT INTO payment_allocations (id, payment_id, invoice_id, amount_cents) VALUES (?,?,?,?)')
          .bind(id('pal'), paymentId, inv.id, take)
          .run();
        allocations.push({ invoice: inv, amount_cents: take });
        await env.DB.prepare(
          "UPDATE write_offs SET recovered_cents = recovered_cents + ? WHERE school_id = ? AND invoice_ids LIKE ?",
        )
          .bind(take, schoolId, `%${inv.id}%`)
          .run();
        remaining -= take;
        await refreshInvoice(env, inv.id);
      }
    }
  }

  const { results: invoices } = await env.DB.prepare(
    `SELECT * FROM invoices WHERE school_id = ? AND student_id = ? AND status IN ('unpaid','partial')
     ORDER BY due_date ASC, issue_date ASC`,
  )
    .bind(schoolId, studentId)
    .all();
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const outstanding = inv.amount_cents - inv.paid_cents - inv.credited_cents - inv.waived_cents;
    if (outstanding <= 0) continue;
    const take = Math.min(remaining, outstanding);
    await env.DB.prepare('UPDATE invoices SET paid_cents = paid_cents + ? WHERE id = ?').bind(take, inv.id).run();
    await env.DB.prepare('INSERT INTO payment_allocations (id, payment_id, invoice_id, amount_cents) VALUES (?,?,?,?)')
      .bind(id('pal'), paymentId, inv.id, take)
      .run();
    allocations.push({ invoice: inv, amount_cents: take });
    remaining -= take;
    await refreshInvoice(env, inv.id);
  }

  let credit = null;
  if (remaining > 0) {
    const creditId = id('crd');
    await env.DB.prepare(
      'INSERT INTO credits (id, school_id, student_id, amount_cents, remaining_cents, source, payment_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
      .bind(creditId, schoolId, studentId, remaining, remaining, 'overpayment', paymentId, nowIso())
      .run();
    credit = { id: creditId, amount_cents: remaining };
  }

  const receiptNumber = await nextNumber(env, schoolId, 'receipt', school?.receipt_prefix || 'RCP', yearOf(today()));
  const receiptId = id('rct');
  await env.DB.prepare(
    'INSERT INTO receipts (id, school_id, payment_id, number, amount_cents, status, issued_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(receiptId, schoolId, paymentId, receiptNumber, amountCents, 'issued', nowIso())
    .run();
  await env.DB.prepare('UPDATE payments SET receipt_id = ? WHERE id = ?').bind(receiptId, paymentId).run();

  const receipt = await env.DB.prepare('SELECT * FROM receipts WHERE id = ?').bind(receiptId).first();
  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first();

  await notifyParentsOfStudent(env, studentId, {
    schoolId,
    type: 'payment_received',
    subject: subjectFor('payment_received', 'bm') + ` — ${receiptNumber}`,
    body: `Bayaran RM ${(amountCents / 100).toFixed(2)} telah diterima untuk ${student.full_name}. Resit ${receiptNumber} boleh dimuat turun dari portal ibu bapa.\nA payment of RM ${(amountCents / 100).toFixed(2)} has been received for ${student.full_name}. Receipt ${receiptNumber} is available in the parent portal.`,
    language: 'bm',
  });

  return { payment, receipt, allocations, credit, student };
}

/**
 * Reverse a payment when its receipt is cancelled: allocated amounts go back
 * onto the invoices (recoveries go back to waived) and unused overpayment credit
 * is voided. Refused when that credit has already been used or refunded.
 */
export async function reversePayment(env, paymentId) {
  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(paymentId).first();
  if (!payment) throw new Error('Payment not found');
  const credit = await env.DB.prepare('SELECT * FROM credits WHERE payment_id = ?').bind(paymentId).first();
  if (credit && credit.remaining_cents < credit.amount_cents) {
    const err = new Error(
      'Kredit daripada bayaran ini telah digunakan atau dibayar balik; resit tidak boleh dibatalkan. / Credit from this payment has already been used or refunded, so the receipt cannot be cancelled.',
    );
    err.status = 409;
    throw err;
  }
  const { results: allocations } = await env.DB.prepare('SELECT * FROM payment_allocations WHERE payment_id = ?')
    .bind(paymentId)
    .all();
  const stmts = [];
  for (const a of allocations) {
    if (payment.is_recovery) {
      stmts.push(
        env.DB.prepare('UPDATE invoices SET paid_cents = paid_cents - ?, waived_cents = waived_cents + ? WHERE id = ?')
          .bind(a.amount_cents, a.amount_cents, a.invoice_id),
        env.DB.prepare('UPDATE write_offs SET recovered_cents = MAX(0, recovered_cents - ?) WHERE school_id = ? AND invoice_ids LIKE ?')
          .bind(a.amount_cents, payment.school_id, `%${a.invoice_id}%`),
      );
    } else {
      stmts.push(env.DB.prepare('UPDATE invoices SET paid_cents = paid_cents - ? WHERE id = ?').bind(a.amount_cents, a.invoice_id));
    }
  }
  if (credit) stmts.push(env.DB.prepare('UPDATE credits SET remaining_cents = 0 WHERE id = ?').bind(credit.id));
  if (stmts.length) await env.DB.batch(stmts);
  for (const invoiceId of new Set(allocations.map((a) => a.invoice_id))) await refreshInvoice(env, invoiceId);
  return { allocations: allocations.length, creditVoided: credit ? credit.remaining_cents : 0 };
}

/** Compute outstanding balance and aging buckets for a student. */
export async function studentBalance(env, studentId) {
  const row = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(amount_cents - paid_cents - credited_cents - waived_cents),0) AS outstanding,
       COALESCE(SUM(paid_cents),0) AS paid,
       COALESCE(SUM(waived_cents),0) AS waived
     FROM invoices WHERE student_id = ? AND status IN ('unpaid','partial')`,
  )
    .bind(studentId)
    .first();
  const credit = await env.DB.prepare(
    'SELECT COALESCE(SUM(remaining_cents),0) AS credit FROM credits WHERE student_id = ?',
  )
    .bind(studentId)
    .first();
  return { outstanding: row?.outstanding || 0, paid: row?.paid || 0, waived: row?.waived || 0, credit: credit?.credit || 0 };
}

export async function agingReport(env, schoolId, asOf = today()) {
  const { results } = await env.DB.prepare(
    `SELECT i.*, s.full_name AS student_name
     FROM invoices i JOIN students s ON s.id = i.student_id
     WHERE i.school_id = ? AND i.status IN ('unpaid','partial')
       AND (i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents) > 0
     ORDER BY i.due_date ASC`,
  )
    .bind(schoolId)
    .all();
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, over90: 0, total: 0 };
  const rows = results.map((inv) => {
    const outstanding = inv.amount_cents - inv.paid_cents - inv.credited_cents - inv.waived_cents;
    const days = daysBetween(inv.due_date, asOf);
    let bucket = 'current';
    if (days > 90) bucket = 'over90';
    else if (days > 60) bucket = 'd61_90';
    else if (days > 30) bucket = 'd31_60';
    else if (days > 0) bucket = 'd1_30';
    buckets[bucket] += outstanding;
    buckets.total += outstanding;
    return { ...inv, outstanding, days_overdue: Math.max(0, days), bucket };
  });
  return { rows, buckets };
}

/** Daily reminder run (FR-FIN-21). */
export async function runReminders(env, asOf = today()) {
  const { results: invoices } = await env.DB.prepare(
    `SELECT i.*, s.full_name AS student_name, s.reminders_enabled, s.school_id
     FROM invoices i JOIN students s ON s.id = i.student_id
     WHERE i.status IN ('unpaid','partial') AND s.status = 'active' AND s.reminders_enabled = 1
       AND (i.amount_cents - i.paid_cents - i.credited_cents - i.waived_cents) > 0
       AND i.due_date < ?`,
  )
    .bind(asOf)
    .all();
  const sent = [];
  for (const inv of invoices) {
    const days = daysBetween(inv.due_date, asOf);
    let stage = null;
    if (days === 3) stage = 3;
    else if (days === 14) stage = 14;
    else if (days >= 30 && days % 30 === 0) stage = days;
    if (!stage) continue;
    const exists = await env.DB.prepare(
      'SELECT id FROM reminders WHERE invoice_id = ? AND stage = ? AND due_date = ?',
    )
      .bind(inv.id, stage, inv.due_date)
      .first();
    if (exists) continue;
    const status = stage >= 30 ? 'pending_review' : 'sent';
    const rid = id('rem');
    await env.DB.prepare(
      'INSERT INTO reminders (id, school_id, student_id, invoice_id, stage, status, due_date, created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
      .bind(rid, inv.school_id, inv.student_id, inv.id, stage, status, inv.due_date, nowIso())
      .run();
    sent.push({ ...inv, stage, status });
    if (status === 'sent') {
      const outstanding = inv.amount_cents - inv.paid_cents - inv.credited_cents - inv.waived_cents;
      await notifyParentsOfStudent(env, inv.student_id, {
        schoolId: inv.school_id,
        type: 'arrears_reminder',
        subject: `${subjectFor('arrears_reminder', 'bm')} — ${inv.number}`,
        body:
          stage === 3
            ? `Peringatan mesra: invois ${inv.number} sebanyak RM ${(outstanding / 100).toFixed(2)} telah melepasi tarikh akhir ${inv.due_date}. Sila buat bayaran.\nFriendly reminder: invoice ${inv.number} for RM ${(outstanding / 100).toFixed(2)} is past its due date of ${inv.due_date}. Please make payment.`
            : `Notis kedua: invois ${inv.number} sebanyak RM ${(outstanding / 100).toFixed(2)} masih belum dibayar (tarikh akhir ${inv.due_date}). Sila hubungi pihak sekolah.\nSecond notice: invoice ${inv.number} for RM ${(outstanding / 100).toFixed(2)} remains unpaid (due ${inv.due_date}). Please contact the school.`,
        language: 'bm',
      });
    } else {
      await notifyRoles(env, inv.school_id, ['bursar', 'school_admin'], {
        type: 'arrears_reminder_review',
        subject: `Semakan notis rasmi / Formal notice review — ${inv.number}`,
        body: `Notis formal untuk invois ${inv.number} (${inv.student_name}) menunggu semakan Bursar sebelum dihantar.\nFormal notice for invoice ${inv.number} (${inv.student_name}) is awaiting Bursar review before sending.`,
        language: 'bm',
      });
    }
  }
  return sent;
}

export async function runDaily(env) {
  const d = new Date();
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const { results: schools } = await env.DB.prepare("SELECT * FROM schools WHERE status = 'active'").all();
  const summary = { schools: schools.length, monthly: 0, registration: 0, reminders: 0, retention: 0 };
  for (const school of schools) {
    if (day === 1) {
      const r = await generateMonthlyInvoices(env, school.id, monthOf(today()));
      summary.monthly += r.created.length;
    }
    if (month === school.reg_gen_month && day === school.reg_gen_day) {
      const r = await generateRegistrationInvoices(env, school.id, year);
      summary.registration += r.created.length;
    }
    if (day === 1) {
      summary.retention += await flagRetentionRecords(env, school.id);
    }
  }
  summary.reminders = (await runReminders(env)).length;
  return summary;
}

/** Flag records past retention (FR-RET-05) - nothing deleted automatically. */
export async function flagRetentionRecords(env, schoolId) {
  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM applications WHERE school_id = ? AND status = 'not_accepted'
     AND NOT EXISTS (SELECT 1 FROM retention_records rr WHERE rr.entity = 'application' AND rr.entity_id = applications.id)
     AND id IN (SELECT application_id FROM decisions WHERE decision = 'not_accepted' AND decided_at < ?)`,
  )
    .bind(schoolId, cutoff)
    .all();
  for (const app of results) {
    await env.DB.prepare(
      'INSERT INTO retention_records (id, school_id, entity, entity_id, label, flagged_at, status) VALUES (?,?,?,?,?,?,?)',
    )
      .bind(id('ret'), schoolId, 'application', app.id, `${app.reference} — ${app.student_name}`, nowIso(), 'pending')
      .run();
  }
  return results.length;
}

export function ageBucketsLabel(bucket, lang = 'bm') {
  const map = {
    bm: { current: 'Belum akhir', d1_30: '1–30 hari', d31_60: '31–60 hari', d61_90: '61–90 hari', over90: '> 90 hari' },
    en: { current: 'Current', d1_30: '1–30 days', d31_60: '31–60 days', d61_90: '61–90 days', over90: 'Over 90 days' },
  };
  return (map[lang] || map.bm)[bucket];
}
