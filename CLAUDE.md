# CLAUDE.md

MDUIK School Administration System: a multi-tenant system for admissions, records, finance and a parent portal. It runs on Cloudflare Workers with D1 and R2, and the frontend is React 19 + Vite.

## Commands
- `npm run dev`: Vite frontend
- `npm run worker:dev`: Worker locally (wrangler)
- `npm run build`: frontend build (deploy needs it)
- `npm test`: integration tests (`node --test tests/`, needs Node ≥ 22.13 for `node:sqlite`)
- `npx wrangler deploy --dry-run --outdir .wrangler-dry`: check the Worker bundles
- Deploy: a push to `main` runs `.github/workflows/deploy.yml` (build → apply `schema.sql` → deploy → smoke test)

## Layout
- `worker/src/routes/*`: Hono routes, mounted under `/api` in `worker/src/index.js`
- `worker/src/lib/parents.js`: parent service (IC lookup, duplicate check, linking, portal login)
- `worker/src/lib/migrate.js`: runtime column migrations (runs once per isolate before each `/api/*` request)
- `worker/src/lib/finance.js`: invoices, payments, credit, receipts
- `src/pages/*`: React pages; `src/components/ParentPicker.jsx` is the shared IC search and duplicate UI
- `src/locales/{bm,en}.js`: all UI text (BM is the default; add every key to both files)
- `tests/`: the Worker runs against an in-memory SQLite D1 shim (`tests/helpers.mjs`); `tests/fixtures/schema-v1.sql` is the pre-migration schema

## Conventions
- Every school-owned query filters by `auth.activeSchool`. Super Admin (`auth.isSuper`) bypasses role checks.
- API error messages are bilingual: `'Mesej BM. / English message.'`, returned via `bad(msg, status, extra)`.
- `schema.sql` is re-applied on every deploy and must stay idempotent. Never put `ALTER TABLE` there. Add new columns to the `CREATE TABLE` (for fresh databases) and to `migrate.js` (for existing ones), and create indexes on new columns only in `migrate.js`.
- ICs are stored as `ic_hash` (salted SHA-256 with `IC_PEPPER`), `ic_enc` (AES-GCM) and `ic_masked`. Search only by the hash. Never return `ic_hash`/`ic_enc` to clients (use `publicParent` / `stripIc`).
- Use `audit(c, action, entity, id, { before, after })` for every write.
- Make small, targeted edits. Run `npm test` and `npm run build` after changes.

## Business rules: parents (spec, Nov 2026)
- One parent record per person, linked to many students across schools; `parent_students.school_id` stores the school on each link.
- Parent records and logins are created or linked only by School Admin registration of an accepted applicant. The public form creates neither.
- IC match → link the existing parent. New IC with an email/phone match → 409 `duplicate_contact`; the admin chooses link or `createAnyway` with a reason of at least 5 characters. Applies to registration, `POST /parents`, `POST /users` (role parent) and CSV import (`duplicateAction` on confirm).
- School Admin edits a parent only if the parent has a child at their school. Delete/deactivate is Super Admin only, enforced server-side.
- Portal: one card per child (school name, balance, credit, next payment, open invoices); the total is the sum of school balances.
- Credit is per school and never pays another school's invoices. Multi-school transfers are recorded per school by each Bursar with the same bank reference.

## Session log: 2026-11-04
Completed (commit `e217536`, pushed to `main`):
- Parent service and runtime migration (`parents`: `ic_hash`, `ic_enc`, `phone_norm`, `status`, `duplicate_reason`, `updated_at`; `parent_students.school_id`).
- IC lookup endpoint `GET /parents/lookup`; new `POST/PATCH/DELETE /parents`, `POST /parents/:id/status`.
- Registration, student creation, user creation and CSV import all use the shared parent rules.
- Super-Admin-only parent delete/deactivate (API plus hidden buttons in Parents and Users pages).
- Portal per-school cards with open invoices and a summed total.
- School-scoped credit application and refunds.
- 11 integration tests covering the spec's test list plus migration and public-form checks.

## Next steps
1. Confirm the GitHub Actions deploy for `e217536` succeeded and `/api/health` is OK, and that the first request ran the migration (check `parents` columns in D1).
2. Click through the new UI in a browser: registration IC search, the duplicate warning, the Parents add/edit flow, Super Admin deactivate/delete, the import duplicate choice, and portal cards (desktop and phone width).
3. Backfill IC hashes for existing parents (they predate IC storage, so IC search can't find them). Options: a Super Admin import of parent ICs, or prompting admins via the edit form.
4. Decide whether to switch `hashIc` to an HMAC with a dedicated secret (needs re-hashing stored ICs for students, applications and parents).
5. Add `npm test` to the deploy workflow before the deploy step.
6. Optional: show a per-school warning when the same bank reference is recorded twice within one school.
