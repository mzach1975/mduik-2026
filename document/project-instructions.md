# MDUIK project instructions (summary of SPEC.md v1.2 and SRS v1.6)

**What we are building:** a responsive, multi-tenant web app for school administration. Two school categories: Tahfiz and Islamic Studies. Launch with 2 schools, expecting 4 within 2 to 3 years. Full spec: `SPEC.md` in this project. Requirement IDs and acceptance criteria: SRS v1.6 (English and Malay).

**Users and roles:** Super Admin (creates schools and school admins; state-wide view; may edit school operational data, audited), School Admin (runs one school; switches monthly fee tracking on or off for each student; sets due dates; approves fee adjustments; writes off outstanding fees directly with a reason; approves retention deletions), Bursar (fees only; requests fee adjustments; can turn arrears reminders off; cannot write off), Teacher (interviews and scoring; can teach at several schools), Parent (sees all linked children; pays by bank transfer or cash). A user can hold several roles. No student logins in Phase 1. Applicants use a public form and a reference number, with no account.

**Core modules (Phase 1):**
- Admissions: public application (Malay and English), open all year, interview assignment, two-scorer rubric (pass mark 40/100), deliberation (Diterima / Tidak diterima / Senarai menunggu), waiting list (manual offers, 7-day response), registration. No seat capacity, vacancies, or class setup.
- Records: students, teachers, parents, with cross-school links and transfers. Class is a free-text field. A student is a record linked to parents and fees, with no login. Bulk import from Excel (chunked, see Cloudflare rules).
- Fees: monthly fee tracking switched on and off for each student. While on for a student, monthly invoices are generated on the first day of each month at the full rate, with no pro-rating. Registration fee charged once per student per calendar year, no pro-rating. One monthly due day per school, and one registration fee generation date and due date per school. A student registered mid-month or mid-year gets their first monthly invoice on the 1st of the following month. Bursar requests adjustments and School Admin approves. Bank transfer and cash only. Oldest-first allocation. Credit does not expire. Sequential receipts. Refunds with second-person approval. Write-offs by School Admin directly, with reason, marked Waived, no 90-day rule. Arrears aging by original due date. Ledger export (CSV and Excel). PDF for receipts and reports.
- Arrears reminders: Day 3, Day 14, Day 30 (Bursar reviews), then every 30 days. Bursar can turn them off.
- Data retention: rejected applicants 12 months after decision; graduates kept as alumni; financial records until settled or written off; monthly review job, deletion only with School Admin approval.
- Notifications by email (Cloudflare Email Service) and parent portal. No WhatsApp.
- Dashboards and reports per role, including student and teacher records reports and the write-off report.

**Removed on 1 November 2026:** intake years, seat capacity and vacancies, class setup, balance brought forward, the intake-year reminder, the 90-day write-off rule, and the requester/approver split for write-offs.

**Out of scope:** online payment (FPX and e-wallet), removed on 30 October 2026. **Phase 2:** academic performance, including hafazan progress.

**Rules to keep:**
- Every request is scoped to a school by middleware. Data is isolated per school, except for the Super Admin state view.
- School names on forms and receipts come from tenant settings.
- Changes to finance and admissions records, fee settings (tracking per student, due days, registration fee generation and due dates), fee adjustments, write-offs, recoveries, and retention deletions are written to the audit log. View-access logging must follow the Cloudflare write-budget rules below.
- Issued invoices are never edited (BR-08). Adjustments use new invoices or credit.
- Unpaid invoices keep their original due date and stay outstanding until paid or written off (BR-13, BR-15).
- Requesters cannot approve their own refunds or fee adjustments.
- IC numbers are encrypted at field level and masked. Parents see only their own children. Financial-condition details are visible only to School Admin and Bursar.
- Interview rubric: `rubric/tahfiz-interview-rubric-v2.md` (draft v6). Pass mark 40. Iqra' and Islamic Studies use the same rubric as Tahfiz. Section 5 split 5/5/10. Section 6 hafazan is one 10-mark item. Section 5's hafazan item is kept alongside it as a separate check.

---

## Technology stack (Cloudflare-first)

All hosting and data services run on Cloudflare. Build with these choices; do not add a second database, cache, queue, or hosting platform without a decision recorded in SPEC.md section 14.

| Layer | Use | Notes |
|---|---|---|
| Frontend | React, Tailwind CSS, on Cloudflare Pages | Responsive, mobile-first for parents. Static assets are free and unlimited on Workers. |
| Framework | Node.js on Cloudflare Workers | Node.js compatibility enabled. |
| API | Cloudflare Workers (with Pages Functions where useful) | Middleware for school scoping and role checks on every request. |
| Database | Cloudflare D1 (SQLite) | One shared database, `school_id` on every school-owned table. Tenancy model still open (SPEC 14.2). |
| Files | Cloudflare R2 | Application documents, receipts (PDF), proof of transfer, import source files. |
| Scheduled jobs | Workers Cron Triggers | Monthly invoice generation (first day of each month, when a student's tracking is on), registration invoices (on the School Admin's generation date), arrears reminders, waiting-list expiry (7 days), monthly retention review. |
| Auth | Workers-issued sessions (signed, HTTP-only cookies), password hashing with Web Crypto | Web Crypto for hashing. Avoid libraries that do not run on Workers. Check hashing cost against the Workers CPU limit (below). |
| Email | Cloudflare Email Service (decided 30 October 2026) | Public beta since April 2026. Called from Workers. Confirm sending limits and beta risk before launch (SPEC 14.2). |

### Cloudflare limits that shape the design (verify before launch; limits change)

**D1 (Workers Free plan):**
- Rows read: 5 million per day.
- Rows written: **100,000 per day**. This is the tightest limit. When it is hit, D1 refuses queries until the daily reset, so the whole system stops.
- Storage: 5 GB total for the account on the free plan.
- Free daily limits reset at 00:00 UTC, which is 08:00 Malaysia time.
- An index adds one extra row written for each write that touches an indexed column.
- A single query that changes hundreds of thousands of rows will exceed execution limits. Chunk bulk work (for example 500 to 1,000 rows per batch).
- Paid plan (for comparison): 25 billion rows read and 50 million rows written per month included, then $0.001 per million reads and $1.00 per million writes.

**Workers (Free plan):**
- 100,000 requests per day for the account, with a burst limit of 1,000 requests per minute. Reset at 00:00 UTC.
- CPU time: **10 ms per invocation**. Waiting on fetch, D1, or R2 does not count. Password hashing and PDF generation are the most likely to exceed it.
- Paid plan: CPU up to 5 minutes per request (default 30 seconds), and 30 million CPU ms included per month.

**R2 (free tier, Standard storage only):**
- Storage: 10 GB-month per month.
- Class A operations (writes, lists): 1 million per month.
- Class B operations (reads): 10 million per month.
- Egress to the internet: free. Deletes are free.

**Cloudflare Email Service:**
- Sending to arbitrary recipients requires the Workers Paid plan. Sends to verified addresses are free.
- Paid plan: 3,000 outbound emails included per month, then $0.35 per 1,000 (as published; verify current pricing).
- Public beta. Daily sending limits are not stated on the pricing page. Confirm before launch.

### Design rules from these limits

1. **Protect the D1 write budget.** Every page view must not write a row. Group related writes into one D1 batch or transaction. Keep the write count per user action known and small. Count writes when adding any feature.
2. **View-access audit logs (SPEC 6.11) need a decision.** Logging each view of a student or finance record as a D1 row can use up the free daily write budget within a single busy morning. Options: buffer and write view logs in batches, write them to R2 as periodic log objects, or move to the paid plan. Do not silently write one row per view. Edits, approvals, write-offs, and retention deletions are always logged as normal rows; the decision applies only to views.
3. **Receipt numbers and invoice numbers stay gap-free.** Allocate them inside a single D1 transaction that updates a per-school counter, so two concurrent payments cannot take the same number.
4. **Index the columns used in filters**, such as `school_id`, status, billing month, and invoice due date, to keep rows read down. Accept the extra row written per indexed write as the cost.
5. **Keep the Workers CPU budget at 10 ms on the free plan.** Test password hashing iterations and PDF generation against this limit. If either cannot fit, move to the Workers Paid plan. Prefer generating receipts as HTML and rendering to PDF at download, or pre-generate once and store in R2.
6. **Use R2 for files, not D1.** Store only the R2 key and metadata in D1. Serve downloads through a signed, time-limited Worker route, so parents only get their own children's files.
7. **Count daily requests.** On the free plan, 100,000 requests per day across the account is shared by staff, parents, and applicants. Estimate peak-day traffic, especially fee deadline week and the registration and monthly invoice runs, before choosing the plan.
8. **Backups.** D1 Time Travel gives point-in-time restore (reported as 30 days; verify the current retention). Add a scheduled monthly incremental export to R2. Super Admin can trigger a full backup on demand. Test a restore.
9. **Consider one D1 database per school** as an alternative to a shared database. It isolates tenants physically and fits the free tier's multiple-database allowance, but cross-school access for the Super Admin and teachers at two schools becomes harder. This is a decision for SPEC section 14.2, not a default.
10. **Batch the heavy jobs.** The monthly invoice run and the registration invoice run (on the generation date) must be batched and idempotent, so a re-run never creates duplicate invoices. The monthly retention review must be idempotent too, so a re-run never creates duplicate flags or deletions.

### Cloudflare checks before build

- Confirm the current D1, Workers, R2, and Email Service free and paid limits on the Cloudflare pricing pages.
- Estimate daily writes and requests for a 100-user peak day, including audit logging and the monthly and registration invoice runs. Decide free or paid plan from that estimate.
- Measure password hashing and PDF generation CPU time in a Worker.
- Test one full monthly invoice run and one registration invoice run against the D1 write budget.

---

**Still open (build team):** Cloudflare plan (free or paid), view-access audit logging approach, D1 tenancy model (shared or per school), Cloudflare Email Service limits and beta acceptance.

**Client decisions (closed 2 November 2026, SRS v1.6 section 11.1):** audit log retained 1 year; support is continuous with no fixed period; page load target 5 seconds; monthly incremental backup with on-demand full backup by Super Admin; registration fee generation date set by School Admin; waiting list without seats; class as a free-text field.

See SPEC.md section 14 for the full decision log.
