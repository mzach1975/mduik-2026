# CLAUDE.md

MDUIK School Administration System: a multi-tenant system for admissions, records, finance and a parent portal. It runs on Cloudflare Workers with D1 and R2, and the frontend is React 19 + Vite. Production: https://mduik.org (also https://mduik.mohdzakaria.workers.dev; D1 database `mduik-db`).

**At the start of every new session, read `CODE.md`** for the architecture, data model, data flows and business rules before changing code. Keep it up to date when the schema, a flow or a rule changes.

## Commands
- `npm run dev`: Vite frontend
- `npm run worker:dev`: Worker locally (wrangler)
- `npm run build`: frontend build (deploy needs it)
- `npm test`: integration tests (`node --test "tests/**/*.test.mjs"`; needs Node ≥ 22.13 for `node:sqlite`). Use the glob: Node 22 in CI does not accept a folder argument.
- `npx wrangler deploy --dry-run --outdir .wrangler-dry`: check the Worker bundles
- `node scripts/generate-seed.mjs`: regenerate `seed.sql` (reads `IC_KEY`/`IC_PEPPER` from `.dev.vars`)
- Deploy: a push to `main` runs `.github/workflows/deploy.yml` (npm test → build → D1 export as artifact `d1-backup-<sha>`, kept 30 days → apply `schema.sql` → deploy → smoke test `/api/health`)

## Layout
- `worker/src/routes/*`: Hono routes, mounted under `/api` in `worker/src/index.js` (auth, public, admissions, records, finance, reports, dashboard, admin, tenants)
- `worker/src/lib/people.js`: shared person rules: required fields, email/phone match across parents and teachers, `ensureLogin`, welcome message
- `worker/src/lib/parents.js` / `teachers.js`: parent and teacher services (IC lookup, plan → commit, linking, school memberships)
- `worker/src/lib/auth.js`: sessions, PBKDF2 passwords, IC crypto (`hashIc`, `encryptIc`), first-password sentinel, `must_change_password` gate
- `worker/src/lib/util.js`: `normalizeIc`, `validIc`, `maskIc`, `bad`, ids
- `worker/src/lib/migrate.js`: runtime migrations (run once per isolate before each `/api/*` request), including `migrateCr20261109`
- `worker/src/lib/finance.js`: invoices, payments, credit, receipts, `ADJUSTED_RATE_SQL` / `studentMonthlyRate`
- `src/pages/*`: React pages. `src/components/ParentPicker.jsx` is the shared IC search and duplicate UI (`kind="parent"|"teacher"`). `src/pages/auth/ForcePassword.jsx` is the forced first-password screen.
- `src/locales/{bm,en}.js`: all UI text (BM is the default; add every key to both files)
- `tests/`: the Worker runs against an in-memory SQLite D1 shim (`tests/helpers.mjs`); `tests/fixtures/schema-v1.sql` is the pre-migration schema. `parents.test.mjs` (parent spec) and `cr-2026-11-09.test.mjs` (CR tests) cover all 18 CR test cases.
- `document/`: SPEC.md, SRS docx, `Change_Request_2026-11-09.md`. The School Admin manual (draft v0.2) is not in the repo.

## Conventions
- Every school-owned query filters by `auth.activeSchool`. Super Admin (`auth.isSuper`) bypasses role checks.
- API error messages are bilingual: `'Mesej BM. / English message.'`, returned via `bad(msg, status, extra)`; person-rule messages come from `message(code, kind)` in people.js.
- `schema.sql` is re-applied on every deploy and must stay idempotent. Never put `ALTER TABLE` there. Add new columns to the `CREATE TABLE` (for fresh databases) and to `migrate.js` (for existing ones), and create indexes on new columns only in `migrate.js`. Destructive migrations back up to `migration_backups` first and are guarded by a `settings` marker.
- ICs are stored as `ic_hash` (peppered SHA-256), `ic_enc` (AES-GCM) and `ic_masked`. Search only by the hash. Never return `ic_hash`/`ic_enc` to clients (`publicParent`, `publicTeacher`, `stripIc`; import `report_json` stays server side).
- Use `audit(c, action, entity, id, { before, after })` for every write.
- Some files use CRLF; edit with CRLF-safe tools. Python is not installed (use Node for scripts).
- Make small, targeted edits. Run `npm test` and `npm run build` after changes.

## Business rules: parents (spec, Nov 2026)
- One parent record per person, linked to many students across schools; `parent_students.school_id` stores the school on each link.
- Parent records and logins are created or linked only by School Admin (registration of an accepted applicant, Add parent, Users, import). The public form creates neither.
- IC match → use the existing parent. New IC with an email/phone match (any parent or teacher) → 409 `duplicate_contact`; the admin chooses "Use existing" (same kind only) or `createAnyway` with a reason of at least 5 characters. Applies to registration, `POST /parents`, `POST /teachers`, `POST /users` (role parent/teacher) and CSV import (`duplicateAction` on confirm).
- School Admin edits a parent only if the parent has a child at their school. Delete/deactivate is Super Admin only, enforced server-side.
- Portal: one card per child (school name, balance, credit, next payment, open invoices); the total is the sum of school balances.
- Credit is per school and never pays another school's invoices. Multi-school transfers are recorded per school by each Bursar with the same bank reference.

## Business rules: CR 2026-11-09
- No fee plans and no class anywhere. Fees are `schools.monthly_fee_cents` / `registration_fee_cents`: required on school create, editable by School Admin and Super Admin (audited), and changes apply only to invoices created afterwards. Monthly rate = latest approved `fee_adjustments` rate, else the school default.
- "IC / Passport No." (IC, passport, birth certificate or MyKid) is mandatory for students, parents and teachers. `normalizeIc` = uppercase, spaces and hyphens removed; `validIc` = 5–20 letters/digits; mask `********1234`. Hash is unique on parents and teachers; a student match only warns (409 `student_ic_exists`, then `allowDuplicateIc: true`).
- Add student: no parent section, class, phone, email or fee. Student page shows parents read only; links are made and removed on the Parents page ("Link child" for own-school students; "Remove link" asks again when it is the student's last parent: `confirmLastLink`).
- Teachers: one record and one login per person; schools are rows in `teacher_schools`. An IC match adds a membership. A login is always created.
- Parent/teacher login ID = IC or email. The first password is the IC, stored as the sentinel `idhash$initial` and checked against `users.ic_hash` (no PBKDF2 cost at creation). `users.must_change_password` makes every API call return 403 `password_change_required` until changed; the new password must be ≥ 8 characters and not the IC. The welcome email shows email + masked IC, never a password. Admin logins are unchanged; reset still works.
- Import: no class columns; the dry run flags IC, email and phone duplicates; nothing is created silently.

## Business rules: CR-PR 2026-11-11 (`document/CR-PR-111126.md`)
- PR-1 fixed: the schedule endpoint accepts local and full ISO date-times (the UI sent `toISOString()`, which the old regex rejected).
- Application form: no category field (application takes the school's category); minimum age 7, no maximum; at least one supporting document required (400 `documents_required`).
- On submit: confirmation email to the parent; notice to School Admins and the school contact email.
- Status page: progress steps, "what next" per status, school contact, phone matched loosely, auto-check from the success link.
- Interviews: one or more interviewers (max 10); completed when all have scored. Checklist of 8 items (sections 7 and 8), each with a tick and a remark.

## Decisions (CR 2026-11-09)
- Kept the `monthly_fee_cents` / `registration_fee_cents` column names.
- Kept the peppered SHA-256 `ic_hash` (no HMAC switch yet).
- Initial password verified via the stored IC hash (sentinel) rather than a PBKDF2 hash of the IC, to stay within Workers CPU limits on bulk creation.
- Welcome email shows the email and the masked IC only.
- Existing non-default student rates were converted to approved adjustments (`adj_cr_*`) by the migration so no student's fee changed.
- "Last link" warning is about the student losing their last parent.

## Session log
- 2026-11-04 (`e217536`): parent service, IC lookup, `POST/PATCH/DELETE /parents`, Super-Admin-only delete/deactivate, per-school portal cards, school-scoped credit, 11 tests.
- 2026-11-09 (`61d3554`, `4a872d8`): implemented CR 2026-11-09 end to end (backend, `migrateCr20261109`, UI, locales, forced password screen, logo `public/images/mduik.jpg`, seed, deploy backup + test step); fixed `npm test` for Node 22 in CI. Deploy `42566803089` succeeded; on production the migration ran (marker set, 34 backup rows, `fee_plans` dropped, 4 teacher memberships). 26 tests pass.

## Next steps
1. Download the `d1-backup-4a872d8…` artifact from run `42566803089` and store it permanently (expires after 30 days).
2. Click through the new UI in a browser (desktop and phone width): add student (IC warning), Parents add/Link child/Remove link, Teachers add by IC, Users with parent/teacher role, registration with student IC, school fees in Schools/Settings, imports, first-login password change, portal cards.
3. Update the School Admin manual to draft v0.2 with new screenshots (the manual is outside the repo).
4. Backfill IC hashes for parents and teachers created before IC was mandatory (IC search can't find them; old passport ICs were hashed digits-only and won't match).
5. Welcome emails for large imports may hit the Workers subrequest limit; consider queueing them.
6. Decide whether to switch `hashIc` to an HMAC with a dedicated secret (needs re-hashing stored ICs).
7. Optional: warn when the same bank reference is recorded twice within one school.
