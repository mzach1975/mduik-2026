# MDUIK School Administration System

A multi-tenant school administration platform for **MDUIK Tahfiz** and **MDUIK Pengajian Islam**, built from SRS v1.6.

The system covers admissions and interviews, student/parent/teacher records, fees and finance, the parent portal, dashboards, reports, notifications, audit trails, CSV imports, document storage and data retention.

## Live application

- Production: `https://mduik.mohdzakaria.workers.dev` (Cloudflare Workers)
- Repository: `https://github.com/mzach1975/mduik-2026`

## Technology

- **Runtime:** Cloudflare Workers with `nodejs_compat`
- **Frontend:** React 19, Vite, React Router, custom CSS design system
- **Database:** Cloudflare D1
- **Documents:** Cloudflare R2 (`mduik-docs`), with a D1 fallback
- **Email:** Cloudflare Email Service binding is optional; notifications are always stored in the portal
- **Exports:** PDF, CSV and SpreadsheetML (`.xls`) generated without external services
- **Language:** Bahasa Melayu (default) and English, with all UI text in translation files

## Main features

- Two school categories: Tahfiz and Islamic Studies
- Public admission form and application status checker
- 100-mark interview rubric with two assessors and a pass mark of 40
- Waiting-list offers with a 7-day response window
- Student, parent and teacher records, class allocation and monthly tracking
- Registration and monthly invoices, payments, sequential receipts, credits, arrears, refunds, write-offs and a general ledger
- Parent portal with linked children only, invoices, receipts and payment instructions
- Role dashboards for Super Admin, School Admin, Bursar, Teacher and Parent
- PDF, CSV and Excel reports
- Portal notifications and optional email delivery
- Audit log, CSV imports with dry-run validation, retention review and backups
- School-scoped multi-tenancy with role-based access control

## Business rules implemented

- Final interview mark is the average of two assessors; pass mark is 40
- Waiting-list offers expire after 7 calendar days
- Payments are allocated to the oldest outstanding invoice first
- Receipt numbers are sequential and gap-free; receipts are cancelled, never deleted
- One registration invoice per student per calendar year
- Monthly fee tracking starts on the 1st of the following month
- No pro-rating of monthly fees
- Write-offs are restricted to School Admin
- Refunds must be approved by a second person
- Audit entries are retained for one year
- Gregorian calendar only; no online payment
- Students and applicants do not have login accounts
- Parents can only see children linked to their account

## Project structure

```text
worker/src/
  index.js              Worker entry point and route mounting
  lib/                  Auth, database, numbering, PDF, export and helper modules
  routes/               Auth, public, admissions, records, finance, reports, admin, tenants
src/
  pages/                React pages grouped by domain
  components/           Shared UI components and icons
  locales/              BM and EN translation dictionaries
  api.js, auth.jsx      API client and authentication context
schema.sql              D1 schema
seed.sql                Demo data
scripts/                Seed generator and maintenance scripts
wrangler.toml           Worker, D1, R2, assets and cron configuration
```

## Local development

### Prerequisites

- Node.js 20+
- A Cloudflare account with Wrangler authenticated (`npx wrangler login`)

### Setup

```bash
npm install
```

Create a local `.dev.vars` file (it is git-ignored):

```ini
JWT_SECRET=replace-with-a-long-random-value
IC_KEY=replace-with-a-32-byte-base64-key
IC_PEPPER=replace-with-a-long-random-pepper
MAIL_FROM=no-reply@example.my
APP_URL=http://127.0.0.1:8787
```

Create the local D1 database and load the demo data:

```bash
npm run db:local
npm run db:seed
```

Start the Worker and frontend together:

```bash
npm run build
npx wrangler dev --port 8787 --local
```

Open `http://127.0.0.1:8787`.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `super@mduik.my` | `Admin@12345` |
| School Admin (Tahfiz) | `admin.tahfiz@mduik.my` | `Mduik@2026` |
| School Admin (Islamic Studies) | `admin.islam@mduik.my` | `Mduik@2026` |
| Bursar | `bendahari@mduik.my` | `Mduik@2026` |
| Teacher | `guru1@mduik.my` | `Mduik@2026` |
| Parent | `ibubapa@mduik.my` | `Mduik@2026` |

The parent portal can also be accessed with IC number `850101145566`.

> Demo credentials are for evaluation only. Change all passwords and secrets before using the system with real data.

## Database commands

```bash
npm run db:local          # apply schema.sql to local D1
npm run db:seed           # load seed.sql into local D1
npm run db:remote         # apply schema.sql to remote D1
```

To reset the local database, stop `wrangler dev`, delete `.wrangler/state/v3/d1`, then re-run `db:local` and `db:seed`.

## Deployment

1. Create the D1 database and R2 bucket:

   ```bash
   npx wrangler d1 create mduik-db
   npx wrangler r2 bucket create mduik-docs
   ```

2. Update `database_id` in `wrangler.toml` if the database was recreated.

3. Set production secrets:

   ```bash
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put IC_KEY
   npx wrangler secret put IC_PEPPER
   npx wrangler secret put MAIL_FROM
   ```

4. Apply the schema and demo data to remote D1:

   ```bash
   npx wrangler d1 execute mduik-db --remote --file=./schema.sql
   npx wrangler d1 execute mduik-db --remote --file=./seed.sql
   ```

5. Build and deploy:

   ```bash
   npm run deploy
   ```

`npm run deploy` runs `vite build` and then `wrangler deploy`. Static assets are served by the Worker from `./dist`, while `/api/*` is handled by Hono.

## Security notes

- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production
- Passwords use PBKDF2 with per-user salts
- IC numbers are encrypted at rest and masked in responses
- Every school-scoped query is filtered by the active school
- Role checks are enforced on the API, not only in the UI
- Audit entries record sensitive actions and are immutable
- R2 stores documents, payment proofs and backups
- Email delivery is optional and never blocks a portal notification

## License

Private project for MDUIK. All rights reserved.
