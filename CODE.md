# CODE.md: how MDUIK works

Reference for new sessions. `CLAUDE.md` covers commands, conventions and session history. This file covers architecture, data, flows and business rules. Updated 2026-11-20 (after CR-PR 2026-11-20). UI text says "madrasah" (BM and EN); code, routes and tables still say "school".

## 1. What the system is
A multi-tenant administration system for Islamic schools (categories `tahfiz` and `islamic_studies`) under MDUIK. Each school is a tenant. It covers:
- public applications, admissions, interviews and decisions
- student, parent and teacher records
- fees: invoices, payments, receipts, credit, refunds, write-offs, fee adjustments, reminders
- a parent portal across schools
- reports, audit, imports, data retention, notifications and announcements

The UI is bilingual: BM is the default and English the second language. Money is stored as integer sen (`*_cents`).

## 2. Architecture
```
Browser (React 19 SPA, Vite, react-router)  --fetch /api/* (cookie)-->  Cloudflare Worker (Hono)
   dist/ served by Workers Assets (SPA fallback)                         ├─ D1 (SQLite) binding DB = mduik-db
                                                                         ├─ R2 binding BUCKET = mduik-docs (documents, proofs, backups)
                                                                         ├─ send_email binding EMAIL (Cloudflare Email Service, domain mduik.org)
                                                                         └─ Cron 0 18 * * * UTC (02:00 MYT) → scheduled()
```
- **Entry point:** `worker/src/index.js`.
- **Global middleware**, in order:
  1. Security headers and `Cache-Control: no-store`.
  2. CSRF check: a POST/PATCH/PUT/DELETE whose Origin is neither same-host nor in `ALLOWED_ORIGINS` is rejected.
  3. `ensureSchema(env)` runs the runtime migrations, once per isolate.
- **Routers:**
  - `/api/auth`
  - `/api/public` (no auth)
  - `/api/reports`
  - everything else mounted at `/api`: dashboard, tenants, admissions, records, finance, admin
- **`scheduled()`:** `ensureSchema`, then `runDaily` (finance), then `lapseOffers` (admissions).
- **Errors:** the JSON body is `{ error: 'BM. / EN.', code?, ...extra }` via `bad()`. `onError` maps SQLite constraint errors to a 4xx naming the field (`duplicate`, `invalid_value`, `required`, `invalid_reference`); anything else is 500 `system_error`.
- **Environment:**
  - Secrets: `JWT_SECRET`, `IC_KEY` (AES), `IC_PEPPER` (IC hash), `ALLOWED_ORIGINS`, `MAIL_FROM` (sender, `no_reply@mduik.org`; the code falls back to the same address).
  - Vars: `APP_URL` (`https://mduik.org`, used in email links), `APP_NAME`, `DEFAULT_LANGUAGE`.
  - Routes: custom domain `mduik.org` (`[[routes]] custom_domain = true`); `workers_dev` stays on.
  - Local secrets are in `.dev.vars`.

### Backend modules (`worker/src/lib`)
| File | Responsibility |
|---|---|
| `auth.js` | PBKDF2 passwords (100k iterations, the Workers maximum); IC crypto (`encryptIc`/`decryptIc` AES-GCM, `hashIc` = SHA-256(pepper + normalised IC)); HMAC JWT session in cookie `mduik_session` (10 h); `resolveAuth` (roles, active school); `authMiddleware` (also the forced password-change gate); `requireRoles`; `can()` capability map; login attempts and lockout |
| `util.js` | `id(prefix)`, `nowIso`, `today`, `monthOf`/`yearOf`, `json`, `bad`, `readJson`, `normalizeIc`, `validIc`, `maskIc`, `stripIc`, CSV helpers |
| `people.js` | person rules shared by parents and teachers: `checkNewPerson`, `findContactMatches` (parents ∪ teachers by email / normalised phone), `loginEmailTaken`, `knowsPerson`, bilingual `message(code, kind)`, `planFailure`, `ensureLogin`, `welcomeMessage` |
| `parents.js` | `planParent` → `commitParent`, `findParentByIc`, `parentInSchool`, `linkParentToStudent`, `registerParent`, `ensureParentLogin`, `publicParent` |
| `teachers.js` | `planTeacher` → `commitTeacher`, `addMembership`, `registerTeacher`, `teacherSchools`, `publicTeacher` |
| `students.js` | CR-PR 2026-11-18 student fields: `PLACEMENTS`, `placementKey` (BM/EN labels → key), `registrationDateError`, `activeClass`/`activeClassByName`, `newStudentFields` (date default today, class and placement required) |
| `finance.js` | numbering, invoice creation and status, credit application, payment allocation, receipt reversal, balances and aging, monthly and registration generation, reminders, `runDaily`, retention flagging |
| `notify.js` | `notify` (inserts a `notifications` row, then emails if a recipient exists and the template is on; `template` + `vars` render the global template), `notifyRoles`, `notifyParentsOfStudent` |
| `templates.js` | global email templates: `TEMPLATES` defaults (key, name, vars, `locked`, BM/EN subject/body), `getTemplate` (default + `email_templates` override), `renderTemplate` (subject "BM / EN", body BM then EN), `fill`, `unknownVars`, `rm` |
| `xlsx.js` | `toXlsx(rows, columns, title)`: one-sheet `.xlsx` (stored zip, inline strings, bold header), `sheetName`, `XLSX_TYPE` |
| `audit.js` | `audit(c, action, entity, id, {before, after})`, `auditView` |
| `pdf.js` | receipt and statement PDFs |
| `migrate.js` | `ensureSchema`: adds columns and indexes on existing databases; `migrateCr20261109` (one-off, guarded by a marker); `migrateCr20261118`; `migrateCr20261120` (email_templates, audit retention 3 months, clears finished migrations' backups); `bootstrapSuperAdmin` (`BOOTSTRAP_ADMIN` secret) |

### Frontend (`src/`)
- **App shell:**
  - `main.jsx` and `App.jsx` handle routing.
  - Public pages: `/` (lead-capture landing: hero + sign-in card via `components/LoginForm.jsx`, announcements, CTA), `/apply`, `/status`, `/privacy`.
  - Auth pages: `/forgot-password`, `/reset-password`. There is no login page (CR-PR 2026-11-20): `/login` redirects to `/#login`, the sign-in card on the landing page, which scrolls into view.
  - Staff and portal pages live under `/app/*`.
- **`App.jsx` guards:**
  - `RequireAuth` shows `ForcePassword` when `user.mustChangePassword` is set.
  - `RequireRole`: Super Admin passes all.
  - `SchoolRequired`: a Super Admin with no active school goes to `/app/schools`.
- **Shared code:**
  - `api.js`: fetch wrapper with `credentials: include` and the `ApiError(status, data)` class. It fires the `mduik:unauthorized` event on 401 and `mduik:password-change` on 403 with `password_change_required`.
  - `auth.jsx`: AuthContext with `user`, `login`, `logout`, `switchSchool`, `refresh`.
  - `i18n` provides `t(key, vars)` with `{n}` interpolation, `money` and `date`.
  - `hooks.js`: `useApi(path, {enabled})`, `useDebounced`, `buildQuery`.
- **Components:**
  - `components/ui.jsx`: Card, Modal, Field, DataTable, ConfirmDialog, StatCard, toasts, and so on.
  - `Layout.jsx`: role-based sidebar (`navSections`) and the school switcher.
  - `ParentPicker.jsx`: the IC-first person search with the duplicate UI (`kind="parent"|"teacher"`).
  - `StudentFields.jsx`: `useClasses`, `StudentClassFields` (registration date, class, placement), `placementLabel`, `NoClassesAlert`; used by Add student, Edit student and Register.
  - `Brand.jsx`: the logo `/images/mduik.jpg`.
- **Locales:** `src/locales/bm.js` and `en.js` must keep identical key sets.

## 3. Roles and tenancy
| Role | Scope | Can do |
|---|---|---|
| `super_admin` | all schools (`user_roles.school_id` NULL) | everything; creates schools and other Super Admins (`POST /users`, typed password ≥ 8); the only role that can delete or deactivate a parent; must pick an active school for school pages |
| `school_admin` | one school | everything in their school (`can` = `*`): records, admissions, approvals, users, imports, retention, settings, fees |
| `bursar` | one school | finance read/write, request and approve refunds (not their own), request adjustments, read records and reports |
| `teacher` | one or more schools | admissions read, view and score the interviews they are assigned to |
| `parent` | linked children's schools | portal only |

- One user can hold several `user_roles` rows (role × school).
- The session carries an `activeSchool`, which can be switched with `POST /auth/context`. `auth.roleInSchool` is the role used for checks.
- **Every school-owned query filters by `auth.activeSchool`.** People records (`parents`, `teachers`, `users`) are global and are scoped through link and membership tables.
- Suspended schools: their roles are ignored, and a user whose only schools are suspended cannot log in.

## 4. Data model (D1, `schema.sql`)
IDs are text with a prefix: `sch_`, `u_`/`usr`, `std`, `par`, `tch`, `tsm`, `ps`, `app`, `inv`, `pay`, `pal`, `crd`, `rct`, `rem`, `aud`, `adj`, and so on. Timestamps are ISO strings. Months are `YYYY-MM`.

**Tenancy and identity**
- `schools`:
  - Basic details: category, state, contact.
  - **Fees:** `monthly_fee_cents`, `registration_fee_cents`.
  - Schedule: `monthly_due_day` (1–28) and registration generation/due dates (`reg_gen_month/day`, `reg_due_month/day`).
  - Bank and payment instructions (BM/EN), invoice and receipt prefixes, status.
- `users`:
  - Login fields: `email` (unique), `ic_hash` (unique), `ic_enc`, `ic_masked`.
  - `password_hash`: PBKDF2, or the sentinel `idhash$initial`.
  - `must_change_password`, `language`, `status`.
  - `parent_id`, the link to a parent record.
- `user_roles (user_id, school_id, role, started_at, ended_at, status)`, unique on (user, school, role).
- `login_attempts`, used for the lockout. `session_revocations`, used for logout and password changes.

**People**
- `students`:
  - Identity: `school_id`, name, IC fields, dob, gender, address, status (`applicant|active|withdrawn|graduated`).
  - Billing flags: `monthly_tracking` with `tracking_start` (`YYYY-MM`), `reminders_enabled`.
  - `application_id`, `import_batch_id`.
  - `monthly_fee_cents` is kept for history only. The billing rate comes from adjustments or the school (see §6).
  - CR-PR 2026-11-18: `registration_date` (YYYY-MM-DD, not in the future; existing rows backfilled from `created_at`), `class_id` → `classes`, `placement` (`boarding|day|temp_boarding`, labels Asrama/Harian/Asrama Sementara).
  - There is no phone, email or fee plan. The class is a label only (no fee effect).
- `classes (school_id, name, description, status active|inactive)`: unique on (school, lower(name)) (index in migrate.js).
- `parents`:
  - Global, one row per person: name, email, phone, `phone_norm`, IC fields, address.
  - `user_id`, `status` (`active|inactive`), `duplicate_reason`.
- `parent_students (parent_id, student_id, relationship guardian|father|mother, school_id)`, unique on (parent, student).
- `teachers`:
  - Global, one row per person: `school_id` is the home school only; name, email, phone, `phone_norm`, IC fields, `user_id`, `duplicate_reason`, status.
  - Unique indexes on `ic_hash`, email and phone are created in migrate.js.
- `teacher_schools (teacher_id, school_id, status)`: the teacher's memberships, one per school.

**Admissions**
- `applications`:
  - `reference` (`APP-<code>/<year>/<seq>`), category, student details and IC fields.
  - The parent's name, email and phone as typed; no parent record is created.
  - `status`: `incomplete|submitted|interview|accepted|not_accepted|waiting_list|registered`.
  - `flags` JSON (consent, emailValid, ageEligible, age, missingFields, documentsUploaded), `documents` JSON of ids.
  - `offer_status` (`offered|accepted|declined|lapsed`) and `offer_deadline`.
- `interviews (scheduled_at, mode, location, status scheduled|completed)`, `interview_assessors` (one or more teachers).
- `scores (interview_id, assessor_id, marks JSON, total)`, one per assessor. `marks.checklist` = `{ itemKey: { checked, remark } }` (§6.8).
- `decisions (decision, reason, decided_by)`.

**Finance**
- `invoices`:
  - `number`, `type monthly|registration|opening|adjustment`, `period` (`YYYY-MM` or `YYYY`), issue and due dates.
  - Amounts: `amount_cents`, `paid_cents`, `credited_cents`, `waived_cents`.
  - `status unpaid|partial|paid|waived`.
  - Unique on (school, student, type, period), which makes generation idempotent. Unique on (school, number).
- `invoice_lines`.
- `payments (method cash|bank, bank_ref, paid_at, proof_key, receipt_id, is_recovery)` and `payment_allocations (payment_id, invoice_id, amount)`.
- `credits (amount, remaining, source overpayment|…, payment_id, refund_id)`: per student and per school.
- `receipts (number, status issued|cancelled, cancel_reason)`.
- `refunds (credit_id, amount, reason, status pending|approved|rejected, requested_by, approved_by)`.
- `write_offs (amount, reason, invoice_ids JSON/text, approved_by, recovered_cents)`.
- `fee_adjustments (old_rate, new_rate, reason, status pending|approved|rejected, effective_date)`.
- `reminders (invoice_id, stage, status sent|pending_review|released, due_date)`, unique on (invoice, stage, due_date).
- `counters (school_id, name, value)`: sequential numbers for invoices, receipts and applications.

**Platform**
- `notifications (user_id/recipient_email, type, subject, body, channel, read_at, email_status queued|sent|failed|portal_only)`.
- `announcements`: public notices managed by Super Admin (BM/EN, pinned, active window).
- `audit_logs (actor, role, action, entity, entity_id, before_json, after_json, ip)`.
- `import_batches (type, status dry_run|confirmed, rows, report_json)`. `report_json` holds encrypted ICs and is never returned to clients.
- `retention_config` and `retention_records` (flagged, then approved or dismissed; nothing is deleted automatically).
- `documents (owner_type, owner_id, r2_key or data_b64)`, `backups`, `settings (key, value)` (also holds migration markers), `migration_backups` (emptied once a migration finishes).
- `email_templates (key, subject_bm, subject_en, body_bm, body_en, enabled, updated_at, updated_by)`: overrides of the code defaults in `templates.js`; NULL text = default.

## 5. Identity, IC and login rules
- **IC / Passport No.:**
  - Accepts IC, passport, birth certificate or MyKid numbers.
  - `normalizeIc` uppercases and strips spaces and hyphens. `validIc` accepts 5–20 characters in `[A-Z0-9]`.
  - Stored three ways: `ic_hash` (search key), `ic_enc` (AES-GCM) and `ic_masked` (`********1234`).
  - Search uses only the hash. `ic_hash` and `ic_enc` never leave the server.
- **Mandatory:** for students, parents and teachers, and on the public application form.
  - Parent and teacher hashes are unique.
  - A student IC match only warns: 409 `student_ic_exists` (with school names), then `allowDuplicateIc: true`.
- **Login** (`POST /auth/login`):
  - The identifier is either an email or a valid IC: if there is no `@`, the user is looked up by `ic_hash`.
  - Lockout: too many failures for one identifier → 429 for 15 minutes. IC variants count as the same account.
  - Inactive users, users with no active roles, and users whose schools are all suspended get 403.
- **First password** (parents and teachers):
  - The password is the IC. It is stored as the sentinel `idhash$initial`; verification compares `hashIc(input)` with `users.ic_hash`, so no PBKDF2 runs at creation time.
  - `must_change_password = 1` makes every authenticated API call return 403 `{code: 'password_change_required'}`, except `/auth/me`, logout and change-password. The UI shows `ForcePassword`.
  - A new password must be at least 8 characters and must not be the user's own IC.
  - A password change revokes the user's other sessions.
- **Welcome email:** shows the login ID (email plus the masked IC) and never a password.
- **Unchanged:** admin and bursar logins are created with a typed password, and forgot/reset by email still works.

## 6. Business rules and data flows

### 6.1 Public application → registration
1. **`POST /public/applications`** (no auth):
   - Validates the school (active) and IC. The form has no category field; the application takes the school's category.
   - Age must be at least 7 (no maximum); under 7 → `incomplete`.
   - At least one supporting document (Birth Cert / MyKad / MyKid / Passport and parents' MyKad / Passport) is required: 400 `documents_required` otherwise. Only unclaimed draft uploads count.
   - Builds `flags`; the status is `incomplete` if anything is missing, the age is out of range or the email is invalid, otherwise `submitted`.
   - Gives the application a reference number, emails the parent a confirmation ("received and will be processed"), and notifies every School Admin plus the school's contact email (if no admin already uses it).
   - Notification email HTML is escaped (`notify.js`).
   - Creates **no parent and no user**.
   - Documents are uploaded first with `POST /public/documents`.
2. **Status check:** `GET /public/applications/status` takes the reference plus the parent email or phone (phone matched without spaces, hyphens, brackets or +). It returns the school phone/email and document count; the page shows a 5-step progress bar and a per-status "what next" message, and checks automatically when opened from the success page.
3. **Schedule** (School Admin):
   - Needs a date (local `YYYY-MM-DDTHH:mm` or a full ISO string) and **at least one** interviewer (max 10), each an active teacher or admin at the school.
   - The application moves `submitted|incomplete` → `interview`, and assessors are notified.
4. **Score** (assigned teacher or School Admin):
   - Each assessor submits marks for the rubric (§6.8).
   - The final mark is the average of the assessors' totals; pass mark is 40/100. The interview is `completed` once every assigned assessor has scored. Below pass → the admin is notified.
   - Scores lock once a decision exists.
5. **Decision** (School Admin):
   - `accepted|not_accepted|waiting_list`, with a reason of at least 3 characters.
   - It cannot change once the applicant is `registered`.
6. **Waiting-list offer:**
   - `POST /offer` sets a deadline 7 days ahead.
   - The parent or admin answers with `offer-response` (accepted → `accepted`).
   - The cron runs `lapseOffers`, which marks past-deadline offers `lapsed` and notifies admins.
7. **Register** (School Admin, `accepted` only), in this order:
   1. Student IC: from the application, or `body.studentIc`.
   2. **The parent is planned first**, so a duplicate warning leaves nothing half-written.
   3. If a student with that IC already exists in this school, it is reused and reactivated. Outstanding arrears trigger a notice to admin and bursar but never block (FR-FIN-26).
   4. Otherwise a new student is inserted with `status active` and `monthly_tracking 0`.
   5. The parent is committed and linked, `ensureParentLogin` runs, and the registration invoice is created for the school fee, due on `reg_due_month/day`.
   6. The application moves to `registered`.

### 6.2 Parents (one record per person)
- **Planning:** `planParent` returns one of:
  - `{parent}`: selected, or matched by IC.
  - `{create}`: new record.
  - `{conflict}`: 409 `duplicate_contact` with matches.
  - `{error}`.
- **Order of checks:**
  1. `parentId` given: a parent linked only to other schools needs proof (`knowsPerson`: matching IC, email or phone).
  2. IC match → existing parent. An inactive parent → 409 `inactive`.
  3. New person: name, IC, email and phone are all required and valid.
  4. Email or phone matches **any parent or teacher** with a different IC → conflict. The admin chooses "Use existing" (only offered for a match of the same kind) or `createAnyway` with a reason of at least 5 characters. The reason and the matched ids are stored and audited.
  5. The email already belongs to another user's login → 409 `login_email_taken`.
- **Who creates parents:** only School Admin, through registration, `POST /parents` (Add parent, needs a `studentId` of their school), `POST /users` (role parent) or CSV import.
- **Edit:** School Admin may edit only a parent with a child at their school (email and phone required). **Deactivate/delete is Super Admin only**, enforced server-side.
- **Link child:** `POST /parents/:id/link` takes an own-school student; a repeat link → 409 `already_linked`; it ensures the parent's login and role at that school.
- **Remove link:**
  - `DELETE /parents/:id/links/:studentId` works only for own-school students.
  - If it is the student's last parent → 409 `last_link` unless `confirmLastLink: true`.
  - Audited as `unlink`.
- **Student page:** shows parents read only (masked IC, phone, email, relationship); links are managed only on the Parents page.

### 6.3 Teachers
- One `teachers` row and one login per person. Schools are rows in `teacher_schools`.
- **IC lookup** (`findTeacherByIc`): the teacher hash first, then the linked login's `users.ic_hash` (teachers created before IC was mandatory); a fallback hit backfills the teacher row.
- `POST /teachers` (School Admin):
  - IC match → adds a membership (409 `already_member` if already active here).
  - Otherwise creates the teacher with the same duplicate and contact rules as parents.
  - A login with the teacher role at the school is always created or attached.
- `PATCH /teachers/:id`: the status applies per school (the membership and the `user_roles` row).
- Lists and counts use `teacher_schools`.
- Interview assessors must hold an active teacher role at the school.

### 6.4 Logins for people (`ensureLogin`)
1. Find an existing user by `ic_hash`, otherwise by email when that user has no conflicting IC. Admin users are never given a person's IC.
2. If none is found, create a user with the IC sentinel password and `must_change_password = 1`.
3. Link `users.parent_id` or `teachers.user_id`.
4. Upsert the role at the school, reactivating it if needed.
5. Send the welcome notification.

### 6.5 Fees and invoices
- **No fee plans.** Classes have no fee effect.
- **School fees:** both are required when a school is created (400 `fees_required`). School Admin and Super Admin can edit them (audited). **Changes affect only invoices created afterwards**; issued invoices keep their amount (BR-08).
- **Monthly rate** for a student = the latest approved `fee_adjustments.new_rate_cents` (`ADJUSTED_RATE_SQL`), otherwise the school's `monthly_fee_cents` at generation time.
- **Fee adjustment:**
  - Bursar or School Admin requests it, recording `old_rate` from `studentMonthlyRate`.
  - School Admin approves (setting `effective_date`) or rejects.
- **Monthly generation** (`generateMonthlyInvoices`):
  - Runs on day 1, or manually with `POST /run-monthly`.
  - Covers active students with `monthly_tracking = 1` whose `tracking_start ≤ month`.
  - Due date is `monthly_due_day`; one invoice per student per month (idempotent). Parents are notified.
- **Registration generation:** runs yearly on `reg_gen_month/day`, one invoice per student per year. A single student's invoice can also be created with `POST /students/:id/registration-invoice`.
- **Invoice status:**
  - outstanding = amount − paid − credited − waived
  - `waived` if waived ≥ amount; `paid` if outstanding ≤ 0; `partial` if anything was paid or credited; otherwise `unpaid`.
- **Credit:** new invoices consume the earliest available credit first. **Credit is per school** and never pays another school's invoices.

### 6.6 Payments, receipts, refunds, write-offs
- **Record a payment** (bursar or admin):
  - Amount from RM 0.01 to RM 1,000,000; the date cannot be in the future; method `cash|bank`. Bank transfers need `bankRef`. Proof can be uploaded.
  - **Allocation:** if it is a recovery, the written-off invoice is paid first (waived → paid, and the write-off's `recovered_cents` increases). Then outstanding invoices are paid **oldest due date first**. Any remainder becomes `credits` (overpayment).
  - A receipt is always issued with the next number from `counters`, and parents are notified.
- **Multi-school transfers:** each bursar records their own school's share with the same bank reference.
- **Receipt cancellation** (School Admin, reason required) runs `reversePayment`:
  - Allocations go back onto the invoices (recoveries go back to waived), and unused overpayment credit is voided.
  - It is refused if that credit has already been used or refunded.
- **Refund:**
  - Requested against available credit, with a reason; the amount cannot exceed that credit.
  - It is approved by a different user than the requester (no self-approval), and approval consumes the credit.
- **Write-off** (School Admin, reason required): takes the selected (or all) unpaid and partial invoices, sets the outstanding amount to waived, and records a `write_offs` row. Later recoveries reduce it.
- **Arrears and aging:** `agingReport` and `studentBalance`. A student who withdraws keeps that school's arrears at that school.

### 6.7 Reminders and the daily job
- **Cron:** runs daily at 18:00 UTC.
- **`runDaily`, per active school:**
  - Day 1: monthly invoices and retention flagging.
  - The registration-generation date: registration invoices.
  - Then reminders for all schools, then `purgeAuditLogs` (audit rows older than 3 months deleted), then `lapseOffers`.
- **Reminders** cover active students with reminders on and overdue invoices.
  - **Stages:** a reminder is created on day 3 and day 14 past due, then every 30 days after that.
  - Days 3 and 14 are emailed to parents automatically.
  - Stages of 30+ days are `pending_review` and notify the bursar and admin. A bursar or admin must release them (`POST /reminders/:id/release`) before they are sent.

### 6.8 Interview rubric (`admissions.js` RUBRIC, total 100, pass 40)
| Section | Max | Items (max) |
|---|---|---|
| Qur'an reading / Iqra' | 25 | tajwid 10, makhraj 10, fluency 5 |
| Tauhid | 22 | syahadah 2, pillars of Islam 10, pillars of Iman 10 |
| Prayer | 13 | prayer names and rakaat 10, Subuh intention 3 |
| Daily supplications | 10 | before eating 5, before sleeping 5 |
| Jawi and memorising | 20 | read Jawi 5, write Jawi 5, memorise verses 10 |
| Hafazan | 10 | timed (good < 5 min, fair < 10 min, weak > 10 min) |

Every item mark is required and limited to its maximum.

**Checklist (not scored)**, each item with a tick and a remark (≤ 500 characters); unknown keys are dropped server-side:
- 7. Items to be read and understood: `c7_rules` Undang-Undang Madrasah / Asrama, `c7_discipline` Panduan Salah Laku Disiplin, `c7_cooperation` Akuan Kerjasama Dua Hala, `c7_leave` Garis Panduan Berkaitan Dengan Cuti.
- 8. Individual: `c8_interest` Minat dan kemahuan, `c8_prayer` Penjagaan solat, `c8_aurat` Penjagaan aurat, `c8_social` Pergaulan (luar & dalam rumah).

The marking page has a sticky score bar with a gold submit button (the old green-on-green button was hard to see).

### 6.8a Classes, registration date and placement (CR-PR 2026-11-18)
- **Classes:** Settings → Classes (School Admin; bursar can list). `GET/POST /classes`, `PATCH/DELETE /classes/:id`. Duplicate name → 409 `class_exists`. Delete with students → 409 `class_in_use` (deactivate instead). Inactive classes are not offered for new assignments but stay on existing students. All writes audited (`entity = class`).
- **New student** (`POST /students`, registration, import): registration date (default today), an active class and a placement are required (`class_required|class_invalid|placement_required|placement_invalid|registration_date_*`). Re-registration of an existing student overwrites the three fields.
- **Edit** (`PATCH /students/:id`): `classId`, `placement`, `registrationDate`; once sent they cannot be empty. A class change is audited with `class_id` and `class_name` before/after. Students created before the CR have no class until edited.
- Students list filters `classId` and `placement`; reports `registration-list` and `student-records` include the three fields; the portal shows class and placement.

### 6.9 Parent portal
- `GET /portal/children`: one card per linked child, showing the school name, balance, credit, next payment and open invoices.
  - **The total is the sum of the per-school balances.**
- Child detail, receipt PDFs and the parent's own applications. All linked children across madrasahs show at once: parents have no madrasah switcher, no "Update contact details" (the `PATCH /portal/contact` endpoint remains) and no "Public site" menu link.

### 6.10 Imports (School Admin)
- **Templates:**
  - students: `registration_date` (blank = today), `class` (required, an active class by name, case-insensitive), `placement` (required; key or BM/EN label); no phone, email or monthly fee
  - parents: includes `student_ic` to link
  - teachers: includes `ic`
- **Dry run** (`POST /imports`):
  - Validates every row and flags duplicates by IC, email and phone (`kind`, `matchedOn`).
  - Stores the report with `sealIc` ciphertext.
- **Confirm** (`POST /imports/:id/confirm`) takes `duplicateAction` (`skip|link|create` with a reason). Nothing is created silently.
  - The response is `{imported, linked, failed, parentSkipped, skipped}`.
  - Parents and teachers get logins.

### 6.11 Audit, retention, notifications, backups
- **Audit:** most writes call `audit()` with before and after; CR-PR 2026-11-20 CR-5 removed record creation, views (`auditView` is now unused), imports, retention actions, uploads and profile/password changes (list in CLAUDE.md). Kept for 3 months, then deleted by the daily job. School Admin can view their school's log.
- **Retention:** `retention_config` sets the period in months per data type. Records past retention are flagged, then a School Admin approves or dismisses them; there is no automatic deletion.
- **Notifications:** always stored for the portal and emailed when a recipient address exists and the template is on. Text comes from the global email templates (Super Admin → Email templates; every email bilingual). `email_status` (`queued|sent|failed|portal_only|disabled`) shows the delivery result, and there is an outbox view for School Admin.
- **Reports:** a Super Admin sees all madrasahs (with a Madrasah column) or one picked with `?school=`; others see their active madrasah. Excel = `.xlsx`.
- **Backups:**
  - School Admin can request an in-app backup to R2.
  - The deploy workflow exports all of D1 as a GitHub artifact before each deploy.
- **Announcements:** public notices managed by Super Admin, shown on the landing page.

## 7. Migrations
- `schema.sql` is applied on every deploy and is idempotent (CREATE … IF NOT EXISTS only).
- `migrate.js` `ensureSchema` runs once per isolate. It adds missing columns with ALTER and creates indexes on new columns, including the unique indexes on teachers' IC, email and phone.
- **`migrateCr20261109`** (marker `settings['migration:cr-2026-11-09']`; ran on production on 2026-11-09):
  1. Backfilled `teacher_schools` and teacher `phone_norm`.
  2. Turned each non-default student rate into an approved adjustment (`adj_cr_*`).
  3. Backed up, then dropped, `students.class_name/phone/email/fee_plan_id` and `applications.phone/email`.
  4. Backed up, then dropped, the `fee_plans` table.
  5. Re-masked `ic_masked` in 5 tables.
- Backups sit in `migration_backups` (`json_object` rows) only while a migration runs; `migrateCr20261120` deletes the rows of every migration whose marker is set (CR-PR 2026-11-20 CR-7).
- **`migrateCr20261120`**: creates `email_templates`, sets `retention_config.audit_log` to 3 months, clears finished migrations' backups. **`bootstrapSuperAdmin`** creates the first Super Admin from `BOOTSTRAP_ADMIN` when none is active (must change password).

## 8. Tests
- `node --test "tests/**/*.test.mjs"` runs the real Worker against an in-memory `node:sqlite` D1 shim (`tests/helpers.mjs`).
- Helpers: `api`, `raw`, `asUser`. `asUser` clears `must_change_password`.
- `tests/fixtures/schema-v1.sql` is the pre-migration schema, used for migration tests.
- Coverage: the parent spec (`parents.test.mjs`), CR 2026-11-09 (`cr-2026-11-09.test.mjs`), CR-PR 2026-11-11, CR-PR 2026-11-14, CR-PR 2026-11-17, CR-PR 2026-11-18 and CR-PR 2026-11-20 (`cr-pr-2026-11-*.test.mjs`): 57 tests. `setup()` seeds an active class `cls_a`/`cls_b` ("Tahun 1") per school.

## 9. Known gaps and open questions
- Parents and teachers created before IC became mandatory have no `ic_hash`, so IC search can't find them. Passport ICs hashed before the normaliser change were digits only and won't match.
- `hashIc` is a peppered SHA-256, not an HMAC with a dedicated secret.
- Welcome emails during large imports may hit the Workers subrequest limit.
- No duplicate bank-reference warning within one school.
- The School Admin manual (v0.2) and its screenshots are outside the repo.
- Things I inferred but haven't confirmed with the business:
  - The reminder schedule (days 3 and 14, then every 30 days with review).
  - Retention periods (they come from the `retention_config` data).
