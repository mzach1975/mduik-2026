# SPEC.md: School Administration System (MDUIK)

**Version:** 1.2 draft
**Date:** 2 November 2026
**Status:** Aligned with the Software Requirements Specification v1.6 (SRS). Where this file and the SRS differ, the SRS governs requirements. All product decisions are closed (section 14.1). Build-team items are in section 14.2.

---

## 1. Purpose

A responsive web application for managing schools. It replaces the current Google Form, WhatsApp, and Excel process for admissions, registration, and fees. It is multi-tenant, so one platform serves several schools. It covers two school categories: **Tahfiz** and **Islamic Studies**.

Launch: 2 schools. Expected growth: 4 schools within 2 to 3 years.

Users: Super Admin, School Admin, Bursar, Teacher, Parent. Students have no login in Phase 1. Applicants use a public form and do not have accounts.

Calendar: the system uses the **Gregorian calendar only**. The Hijri calendar is not used in the system.

## 2. Goals

1. Move admissions online, from application through to registration, with scoring and a documented decision.
2. Give parents balances, invoices, and receipts online, and tell them how to pay by bank transfer or cash.
3. Give school staff accurate invoices, receipts, refunds, arrears, write-offs, and ledger exports.
4. Give the state-level user a consolidated view across schools.
5. Keep each school's data separate, while letting staff and students move between schools.

## 3. Scope

### 3.1 In scope: Phase 1 (launch)

- Multi-tenant schools, with per-school settings
- User accounts, roles, and access control (multiple roles per user)
- Public admission application form, with reference number and status check
- Admissions at any time of the year: interview assignment, scoring (rubric v6), deliberation, decision, and waiting list
- Registration of accepted applicants
- Student, parent, and teacher records, including linking parents to several children and teachers to several schools
- Monthly fee tracking (switched on and off per student), registration fee, invoicing, manual payments (bank transfer and cash), receipts, credit, refunds, write-offs, arrears, and ledger export
- Data retention rules and approved deletion
- Parent portal: children, balances, invoices, receipts, and payment instructions
- Dashboards and reports (section 7)
- Email notifications and parent portal messages
- Bulk import from Excel
- Audit log
- Malay and English interface

### 3.2 Phase 2

- Academic performance: recording and monitoring student progress, including hafazan progress
- Student login (decision deferred; not in Phase 1)

### 3.3 Out of scope

- **Online payment (FPX and e-wallet).** Removed from scope on 30 October 2026. Payments are by bank transfer and cash, recorded by staff.
- **Intake years, seat capacity, vacancies, and class setup.** Removed on 1 November 2026. Admissions are not tied to a period or a seat count.
- **Balance brought forward.** Removed on 1 November 2026. Outstanding invoices stay under their original due dates.
- Integration with external systems (accounting, government systems). The client confirmed no integration is required.
- Accounting software integration. Exports are CSV or Excel only.
- WhatsApp Business API. Notifications use email and the portal.

---

## 4. Tenancy

- **One shared database** with a `school_id` on every school-owned record.
- **Every API request is scoped to a school.** The scope is enforced in middleware, not left to each query.
- **Teachers and students can move between schools.** A person is one record, linked to one or more schools through membership records. A transfer adds or ends a membership. It does not create a duplicate person.
- **State view:** a Super Admin can read data across all schools, and it is logged in the audit log.
- **Per-school configuration:** category (Tahfiz or Islamic Studies), school name and logo, fee plans, receipt numbering, rules that differ between categories, **monthly due day (1 to 28)**, and **registration fee generation date and due date** (day and month, applied each calendar year). Monthly fee tracking is set for each student.
- **Tenant onboarding:** the Super Admin creates a school, then creates its School Admin account. The school name in templates and forms always comes from tenant settings.

*Proposal:* a user who teaches at two schools picks a school context at login, and sees only that school's data until they switch.

---

## 5. Roles and access

A user can hold more than one role, in one or more schools. Access is checked against the role and the school in the current context.

| Role | Summary of access |
|---|---|
| **Super Admin** | Creates and suspends schools. Creates School Admins. State-level view across schools. Edits school operational data (audited, FR-TEN-09). System settings. Audit log (read-only). |
| **School Admin** | Full control of their school: teachers, parents, students, admissions, fee settings, invoices, payments, reports, and school settings. Creates teachers, parents, and students. Bulk import. **Switches monthly fee tracking on or off for each student.** Sets due dates. **Approves** monthly fee adjustments requested by the Bursar. **Writes off** outstanding fees directly, with a reason. Approves retention deletions. |
| **Bursar** | Fees, invoices, payments, receipts, credit, refund requests, arrears, and finance reports. **Requests** monthly fee adjustments. Read-only view of student name, class, and payment status. Turns arrears reminders on or off. Cannot write off. No admissions or academic data. |
| **Teacher** | Sees interviews assigned to them and enters scores. Sees students in their assigned interviews. Does not see fees or finance. |
| **Parent** | Sees only their linked children (across schools). Views invoices, receipts, balances, and payment instructions. Updates their own contact details. Sees the status of their own application. |

**Not users in Phase 1:**
- **Student:** a record only. Parents act for their children.
- **Applicant:** no account. Uses the public form and reference number.

**Permission rules:**
- Super Admin edits to school operational data are allowed and audited (user, time, school, values before and after).
- A refund needs approval by a second person, and the refund is recorded with a reason.
- A monthly fee adjustment requested by a user cannot be approved by that same user.
- A write-off is applied by the School Admin with a reason. It is recorded in the audit log.
- Access to a family's financial condition is limited to School Admin and Bursar. It is not shown to teachers.

---

## 6. Functional requirements

### 6.1 Fee settings and tracking

- School Admin sets **monthly fee tracking on or off for each student**.
- When tracking is **switched on** for a student, that student's monthly invoices begin on the **first day of the following month**, including for students registered mid-month or mid-year.
- When tracking is **switched off** for a student, no new monthly invoices are generated for that student. Outstanding invoices remain payable and stay in arrears reports. Reminders continue until the Bursar turns them off for the account.
- School Admin sets **one monthly due day** (1 to 28) for the school. Changes apply to invoices generated after the change. Issued invoices keep their due date.
- School Admin sets **the registration fee generation date and the due date** for the school (each as day and month, for example due 31 January). They apply to each calendar year. Issued invoices keep their due date.
- Changes to any setting affect future invoices only.
- Every change to these settings is recorded in the audit log.

### 6.2 Public application and admissions

**Current process (for reference):** Google Form, then WhatsApp notification, then interview scheduling, then deliberation, then decision, then notification, then registration form.

**Target process:**

1. **Application.** Public form, in Malay and English. Captures: student information, education history, reason for application, school category, and parent information. Documents are uploaded where needed. The form generates a reference number. Admissions are open all year.
2. **Status check.** The applicant checks status using the reference number and their registered email or phone number.
3. **Automatic checks at submission.** Required fields, age eligibility, category selected, and documents uploaded. Incomplete applications are flagged to staff.
4. **Interview scheduling.** The admin schedules the interview and assigns a teacher. The applicant is notified by email and portal.
5. **Interview.** The assigned teacher completes the applicant form during or before the interview, then scores using the rubric.
6. **Scoring.** Two scorers per interview, each in their own column. The final score is the average. Scoring follows section 6.3.
7. **Deliberation.** The committee sees the scores and records a decision: **Diterima** (accepted), **Tidak diterima** (rejected), or **Senarai menunggu** (waiting list). The decision reason is recorded.
8. **Waiting list.** Applicants on the waiting list are listed by score for the committee's reference. The School Admin makes each offer manually, by email and portal. **The applicant has 7 calendar days to respond.** If there is no response, the offer lapses and the School Admin may offer it to the next applicant. The system does not make offers automatically.
9. **Notification.** The applicant is notified of the decision by email and portal.
10. **Registration.** For accepted applicants, the admin completes the registration form. The system creates the student record, the parent link, and the registration fee invoice for the current calendar year.

**Rules:**
- No seat capacity or vacancy limit applies. Acceptances are not blocked by a count.
- Decisions and reasons are kept, to support appeals.

### 6.3 Interview scoring

The scoring rubric is in the project document `rubric/tahfiz-interview-rubric-v2.md` (draft v6). Summary:

| Section | Name | Max | Type |
|---|---|---|---|
| 1 | Pembacaan Al-Quran / Iqra' | 25 | Scored (Tajwid 10, Makhraj 10, Kelancaran 5) |
| 2 | Tauhid | 22 | Scored (Syahadah 2, Rukun Islam 10, Rukun Iman 10) |
| 3 | Feqah | 13 | Scored (Prayer names and rakaat 10, Niat Subuh 3) |
| 4 | Adab dan Doa | 10 | Scored (Doa makan 5, Doa tidur 5) |
| 5 | Ujian Penulisan: Jawi and Hafal | 20 | Scored (Baca Jawi 5, Tulis Jawi 5, Hafal and baca ayat pilihan 10) |
| 6 | Hafazan | 10 | Scored (one item, time recorded against form wording: Baik under 5 minutes, Sederhana under 10 minutes, Lemah over 10 minutes) |
| 7 | Perkara yang perlu baca & faham | not scored | Checklist, √ or x, for school reference |
| 8 | Individu | not scored | Checklist, √ or x, for school reference |

- **Total scored:** 100.
- **Pass mark: 40 out of 100 (40%).** The system flags applications below the pass mark for the committee. The committee still records the decision.
- **Section 5 split:** 5 (Jawi reading), 5 (Jawi writing), and 10 (memorisation and recitation), as agreed by the school.
- Section 5's hafazan item and section 6 are separate checks, and both are kept.
- **Iqra' rubric:** the same for all levels.
- **Hafazan passages:** standard across all levels.
- **Islamic Studies:** uses the same rubric as Tahfiz.

### 6.4 Student and teacher records

- **Student record:** personal details, IC or birth details, class (free text, no class setup), school, guardian links, status (applicant, active, withdrawn, graduated), and history across schools.
- **Teacher record:** personal details, schools assigned, status.
- **Parent record:** contact details, linked children (any number, across schools).
- **Transfers:** moving a student or teacher to another school adds a membership and ends the old one. History is kept.
- Student and teacher records are visible in the Super Admin and School Admin reports (section 7).

### 6.5 Fees and finance

**Registration fee**
- Charged once per student per calendar year, in the full amount. **No pro-rating.**
- Generated at registration if the student registers in that calendar year. Otherwise generated on the registration fee generation date set by the School Admin, for each active student. It is charged regardless of the monthly tracking setting.
- Due on the registration due date set by the School Admin. If that date has passed when the invoice is issued, it is due on the issue date.

**Monthly fee**
- A fixed rate per fee plan.
- For each student with tracking on, invoices are generated automatically on the **first day of each month**, for each active student with a fee plan. Each invoice carries the full monthly rate, including any approved adjustment.
- A student registered mid-month or mid-year is billed from the 1st of the following month when tracking is on. **No pro-rating.**
- No invoices are generated for students with status withdrawn or graduated.
- **One monthly invoice per student per month.** A re-run in the same month does not create duplicates.
- **Adjustments:** the Bursar requests an adjustment for a student. The School Admin approves it. The adjustment is recorded in the audit trail with the reason, requester (Bursar), approver (School Admin), and date. The adjustment takes effect only after approval.

**Invoices**
- Invoice numbers are sequential per school.
- Issued invoices are not changed (BR-08). Adjustments are made through a new invoice or credit.
- Each invoice keeps its original due date. Aging is calculated from it.

**Payments**
- **Bank transfer and cash only.** Staff record each payment with the date, amount, and bank reference. Proof of transfer can be attached.
- **Allocation:** oldest outstanding invoice first. This is the only allocation rule. Staff and parents cannot direct a payment to a specific invoice.
- **Overpayment and advance payment:** held as credit. Credit does not expire. It is applied automatically to new invoices, earliest due date first.

**Receipts**
- Sequential receipt numbers per school, with no gaps. Numbers are allocated inside a single D1 transaction (design rule 3).
- Issued as a PDF on payment, and available to parents in the portal and by email.
- A voided receipt is kept with a reason. It is never deleted.

**Refunds**
- A refund is requested with a reason.
- A second person approves it. The requester cannot approve their own refund.
- Approved refunds are recorded in the refund log.

**Arrears**
- **Aging buckets** are calculated from the original due date: Current (not yet due), 1–30, 31–60, 61–90, and over 90 days.
- **Reminders** by email and portal on fixed days after the original due date:
  - Day 3: friendly reminder with amount and payment instructions.
  - Day 14: second notice, with the list of unpaid invoices.
  - Day 30: formal notice. The Bursar reviews it before it is sent.
  - Every 30 days after that.
- Reminders stop when the balance is paid, or when the Bursar turns them off for the account. They are not paused for holidays or fee deadline weeks. Each reminder is logged.
- Unpaid invoices stay outstanding until paid or written off, even after monthly tracking is switched off.

**Write-offs**
- The School Admin writes off outstanding fees for a student, either the full balance or selected invoices. The Bursar cannot write off.
- Each write-off requires a reason. There is no minimum overdue period (no 90-day rule).
- Each write-off records the invoices, amount, reason, approver (School Admin), and date in the audit log. The invoices are marked **Waived**.
- A payment received after a write-off is recorded as a recovery and reported separately.
- A write-off report lists waived invoices by date, amount, reason, and approver (FR-RPT-14).

**Ledger**
- General ledger export per school, per period, as CSV or Excel.
- Data exports for invoices, receipts, refunds, arrears, and write-offs, as CSV or Excel.

### 6.6 Parent portal

- Parents log in with their IC number or email, and a password.
- Dashboard per child: balance due, credit, next payment, and payment history.
- Outstanding invoices shown with their original due dates and amounts.
- **Payment:** the portal shows bank transfer and cash instructions. There is no online payment.
- Download invoices and receipts.
- Messages and notifications from the school.
- View application status for their own applications.
- Parents see only their linked children. Other families' data is never shown.

### 6.7 Users and accounts

- **Login:** IC number (MyKad) or email, plus password. Passwords are hashed with a modern algorithm. Session expiry, password reset by email, and account lockout after repeated failures.
- **Creation:** Super Admin creates School Admins. School Admins create teachers, parents, and students, either one by one or by bulk import.
- **Multiple roles:** a user can be assigned more than one role, within a school.
- **Deactivation:** accounts are deactivated, not deleted. History is kept.
- **Students:** a record linked to parents and fees. There is no student login in Phase 1.

### 6.8 Notifications

- **Channels:** email and parent portal. There is no WhatsApp integration.
- **Transactional email provider:** Cloudflare Email Service (see section 10 for the beta note).
- **Events:** application received, interview scheduled, decision, waiting-list offer, invoice issued, payment received, receipt issued, arrears reminder, write-off applied (School Admin), monthly tracking switched on or off for a student (School Admin), and a student with outstanding arrears registered again (School Admin and Bursar, not blocked).
- **Languages:** sent in the language set in the user's profile (Malay or English).

### 6.9 Dashboards

| Role | Dashboard |
|---|---|
| Super Admin | Schools, students and applications per school, collection rate and arrears per school, number of students with monthly fee tracking on, per school, state-level student and teacher records |
| School Admin | Admissions funnel, students with monthly fee tracking on and off, monthly due day and registration dates, fee collection this month, arrears aging, student and teacher records |
| Bursar | Collections today and this month, outstanding invoices, arrears aging, recent receipts |
| Teacher | Upcoming interviews, pending scores |
| Parent | Per child: balance due, credit, next payment, payment history |

### 6.10 Data retention

- Retention periods are set per data type in a configuration table that the School Admin can view.
- **Rejected applicants:** records kept for **12 months** after the decision.
- **Graduated students:** kept as **alumni records**. Personal details are not deleted.
- **Financial records:** kept until the balance is settled or written off.
- A **monthly scheduled job** flags records past their retention period and lists them for the School Admin. Nothing is deleted or anonymised without School Admin approval.
- An approved deletion removes or anonymises personal data. The audit log records the deletion without keeping the deleted personal data.
- **Withdrawn and graduated students** are marked "Withdrawn" or "Graduated". They are not deleted.

### 6.11 Audit log

- Records who viewed or changed student, teacher, finance, and admissions records, with time and school.
- Records changes to monthly fee tracking (for each student), due days, registration fee generation and due dates, fee amounts, adjustments, write-offs, recoveries, refunds, receipt voids, role assignments, and reminder settings.
- Records Super Admin edits to school operational data, with values before and after.
- Read-only for Super Admin. Retention period: 1 year.
- View-access logging must follow the write-budget decision (section 14.2).

---

## 7. Reports

| Report | Available to |
|---|---|
| Admissions pipeline | School Admin, Super Admin |
| Interview results (scores per applicant, scorers, final score) | School Admin, Super Admin |
| Registration list (filterable by class) | School Admin, Super Admin |
| Student records | School Admin, Super Admin |
| Teacher records (schools assigned) | School Admin, Super Admin |
| Fee collection | School Admin, Bursar, Super Admin |
| Arrears aging (by original due date) | School Admin, Bursar, Super Admin |
| Write-off report | School Admin, Bursar, Super Admin |
| Receipt register | School Admin, Bursar |
| Refund log | School Admin, Bursar, Super Admin |
| General ledger export | School Admin, Bursar |
| Teacher-school assignments | School Admin, Super Admin |
| Audit log | Super Admin, School Admin (own school) |
| State consolidated report (across schools) | Super Admin |

Export formats: PDF for reports and receipts; CSV and Excel for data exports. Dates are shown in Gregorian.

---

## 8. Data migration

- Existing data is in Excel. Import templates are provided for: students, parents, teachers, class (free text), and opening fee balances.
- Import is per school. A dry run shows a validation report before any data is saved.
- The validation report lists each failed row with the reason. No row is silently dropped.
- Imported records are marked with the import batch, so a batch can be reviewed or reversed.
- Opening balances are imported as opening invoices, with the source file kept.

---

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| Responsive design | Works on phones, tablets, and desktops. Mobile-first for parents. No horizontal scroll on phones. |
| Languages | Malay and English. All text is kept out of code (translation files). |
| Concurrency | 100 concurrent users at peak, such as fee deadline week (client figure). |
| Performance | Pages load within 5 seconds on a typical mobile connection. |
| Security | HTTPS only. Passwords hashed. IC numbers encrypted at field level and masked in the UI. Rate limiting on login. Role checks on every request. |
| Privacy (PDPA) | Consent recorded from parents for application and data processing. Privacy notice in Malay and English. Retention rules as section 6.10. Access to children's data is logged. |
| Backup | Monthly incremental database backup. Super Admin can trigger a full backup on demand. Restore is tested. |
| Accessibility | Keyboard navigation, readable contrast, form labels on all fields. |
| Audit | Section 6.11. |

---

## 10. Technical approach

*Built in-house with Claude Code, hosted on Cloudflare. Stack details and Cloudflare limits are in `instructions/project-instructions.md`.*

| Layer | Approach |
|---|---|
| Frontend | React with Tailwind CSS, hosted on Cloudflare Pages. Responsive by design. |
| Framework | Node.js, running on Cloudflare Workers with Node.js compatibility enabled. |
| API | Cloudflare Workers, with middleware for school scoping and role checks. |
| Database | Cloudflare D1. Free-tier limits change, so they must be checked before launch. |
| Files | Cloudflare R2 for application documents, receipts, and proof of payment. |
| Scheduled jobs | Workers Cron Triggers: monthly invoice generation (first day of each month, when tracking is on), registration invoice generation (on the School Admin's registration generation date), arrears reminders, waiting-list expiry (7 days), monthly retention review. |
| Auth | Email or IC number plus password. Sessions. Password reset by email. |
| Email | **Cloudflare Email Service** (decided 30 October 2026). It is in public beta, launched April 2026. Before launch, confirm daily sending limits, delivery to Malaysian mailboxes, and the beta risk for invoices and receipts. |
| Payment | Bank transfer and cash only. No payment gateway. |
| Localisation | Malay and English, from the start. |

**Constraints to verify before build:**
- Current free-tier limits for D1, R2, and Workers (storage, row reads and writes, requests).
- Whether D1 at the free tier meets the 100-user peak.
- Cloudflare Email Service sending limits and beta terms.

---

## 11. Acceptance criteria

The acceptance criteria are maintained in SRS v1.6, Section 9, criteria 1 to 36. Those criteria are the reference for testing.

---

## 12. Assumptions

- The school's monthly fee can be adjusted per student. The Bursar requests the adjustment, the School Admin approves it, and the system records it.
- Parents are the only account holders for students in Phase 1.
- Payments are by bank transfer and cash only.
- Interviews are conducted in person or on a call. The applicant completes the form during or before the interview.
- Malay is the primary language. English is a second language for the interface and documents.
- The system is Gregorian-only. School Admin turns monthly fee tracking on for each student when that student's billing should start.
- Registration fees are charged once per calendar year.

---

## 13. Out of scope for Phase 1

- Student login
- Academic performance tracking (Phase 2)
- Online payment (FPX, e-wallet)
- Intake years, seat capacity, vacancies, class setup
- Balance brought forward
- WhatsApp notifications
- Accounting software integration
- Government or ministry reporting integration

---

## 14. Decisions and open items

### 14.1 Decided

| # | Date | Decision |
|---|---|---|
| 1 | 30 Oct 2026 | Pass mark 40 out of 100. |
| 2 | 30 Oct 2026 | Hafazan passages standard across all levels. |
| 3 | 30 Oct 2026 | Iqra' rubric the same for all levels. |
| 4 | 30 Oct 2026 | Section 5 split 5 / 5 / 10 agreed. |
| 5 | 30 Oct 2026 | Islamic Studies uses the Tahfiz rubric. |
| 6 | 30 Oct 2026 | Super Admin may edit school operational data, audited. |
| 7 | 30 Oct 2026 | Bursar requests monthly fee adjustments; School Admin approves. |
| 8 | 30 Oct 2026 | Online payment out of scope. |
| 9 | 30 Oct 2026 | Transactional email provider: Cloudflare Email Service. |
| 10 | 30 Oct 2026 | Waiting-list response deadline: 7 calendar days. |
| 11 | 30 Oct 2026 | Reminder schedule and aging buckets as proposed. Bursar reviews the formal notice and may turn reminders off. |
| 12 | 30 Oct 2026 | Payment allocation: oldest first only. |
| 13 | 30 Oct 2026 | Retention: rejected applicants 12 months; graduates kept as alumni; financial records until settled or written off; deletion needs School Admin approval. |
| 14 | 30 Oct 2026 | Registration and monthly fees are not pro-rated. |
| 15 | 30 Oct 2026 | Re-registration with arrears: notify only, no blocking. |
| 16 | 1 Nov 2026 | Intake year removed. Admissions open all year. No seat capacity, vacancies, or class setup. |
| 17 | 1 Nov 2026 | Registration fee charged once per student per calendar year. |
| 18 | 1 Nov 2026 | Monthly fee tracking switched on and off by School Admin for each student. Off stops new monthly invoices for that student only. |
| 19 | 1 Nov 2026 | Monthly invoices begin on the first day of the following month after tracking is switched on for a student, including students registered mid-month or mid-year. |
| 20 | 1 Nov 2026 | Balance brought forward removed. Outstanding invoices keep their original due dates. |
| 21 | 1 Nov 2026 | Write-off applied directly by School Admin with reason and audit. No 90-day rule. Bursar cannot write off. |
| 22 | 1 Nov 2026 | One monthly due day per school, and one registration fee generation date and one due date per school. |
| 23 | 1 Nov 2026 | Single fee configuration per school (one setting, not per period). |
| 24 | 2 Nov 2026 | Registration fee charged once per calendar year, regardless of the monthly tracking setting. |
| 25 | 2 Nov 2026 | Registration fee generation date set by School Admin, the same as the due date. |
| 26 | 2 Nov 2026 | Students registered mid-month or mid-year: first monthly invoice on the 1st of the following month. |
| 27 | 2 Nov 2026 | Development framework: Node.js on Cloudflare Workers. |
| 28 | 2 Nov 2026 | PDF for receipts and reports; CSV and Excel for data exports. |
| 29 | 2 Nov 2026 | A student is a record linked to parents and fees, with no student login. |
| 30 | 2 Nov 2026 | Audit log retained 1 year. Page load target 5 seconds. Monthly incremental backup, with on-demand full backup by Super Admin. Continuous support with no fixed period. |

### 14.2 Open items

| # | Decision | Owner |
|---|---|---|
| 1 | Audit log retention period (FR-AUD-04) | School |
| 2 | Support period after launch (SRS section 10) | Client |
| 3 | Confirm: registration invoices generated on 1 January for active students, due on the school's registration due date | School |
| 4 | Confirm: waiting-list behaviour without seat capacity (manual offers, 7-day response, no automatic trigger) | School |
| 5 | Confirm: class kept as a free-text field on the student record | School |
| 6 | Cloudflare plan: free or paid, after measuring writes and CPU for a 100-user peak | Build team |
| 7 | View-access audit logging approach: batched, to R2, or paid plan (see instructions, design rule 2) | Build team |
| 8 | D1 tenancy model: one shared database (current) or one per school | Build team |
| 9 | Cloudflare Email Service: confirm daily limits and accept beta risk before launch | Build team |
| 10 | Confirm: write-off status stays "Waived" | School |

---

## Appendix A: Rubric reference

Full rubric: `rubric/tahfiz-interview-rubric-v2.md` in the MDUIK project (draft v6).

## Appendix B: Source notes

- Requirements from the client interview (15 October 2026).
- Decisions on open items from the client (30 October 2026).
- Decisions on monthly fee tracking, admissions, and write-off from the client (1 November 2026).
- Current admissions paper: "SOALAN TEMUDUGA TAHFIZ" (uploaded).
- Decisions on 2 November 2026 (fee tracking per student, registration fee dates, Node.js, output formats, audit retention, backup, support).
- SRS v1.6 (2 November 2026), both English and Malay versions.
