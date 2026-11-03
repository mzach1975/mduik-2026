# MDUIK School Administration System — User Manual

**English edition · Version 1.0 · November 2026**

This manual explains how to use the MDUIK School Administration System in daily school operations. It is written for the roles available in the deployed system: Super Admin, School Admin, Bursar, Teacher and Parent.

The system is bilingual. Bahasa Melayu is the default language and English can be selected from the language control in the top bar or from **Settings**. All dates use the Gregorian calendar.

> **Production URL:** `https://mduik.mohdzakaria.workers.dev`

---

## Contents

1. [System overview](#1-system-overview)
2. [Roles and access at a glance](#2-roles-and-access-at-a-glance)
3. [Signing in and common screens](#3-signing-in-and-common-screens)
4. [Public website and admission application](#4-public-website-and-admission-application)
5. [Super Admin guide](#5-super-admin-guide)
6. [School Admin guide](#6-school-admin-guide)
7. [Bursar guide](#7-bursar-guide)
8. [Teacher guide](#8-teacher-guide)
9. [Parent guide](#9-parent-guide)
10. [Key business rules](#10-key-business-rules)
11. [Status reference](#11-status-reference)
12. [Security, privacy and data retention](#12-security-privacy-and-data-retention)
13. [Troubleshooting and support](#13-troubleshooting-and-support)

---

## 1. System overview

MDUIK is a multi-tenant school administration system for **MDUIK Tahfiz** and **MDUIK Pengajian Islam**. It brings admissions, interview scoring, student and parent records, fees, receipts, reports and parent communication into one secure portal.

The main modules are:

- **Admissions** — applications, interviews, committee decisions, waiting-list offers and student registration.
- **Records** — students, teachers, parents and parent–child links.
- **Finance** — invoices, payments, receipts, arrears, refunds, write-offs, fee adjustments and the general ledger.
- **Operations** — dashboards and printable/exportable reports.
- **Administration** — schools, users and roles, audit log, CSV imports and data retention.
- **Parent portal** — linked children, balances, invoices, receipts, payment instructions and offer responses.

Every school record belongs to one school. Staff only see the school that is active in their school context. A user who holds roles in more than one school can switch schools from the top bar.

### Important operating rules

- There are **no student or applicant login accounts**. Applicants apply through the public form and check progress with a reference number.
- Parents only see children explicitly linked to their parent record.
- There is **no online payment**. Parents pay by bank transfer or cash at the school office, and school staff record the payment.
- The system does not use intake periods or seat limits; applications can be submitted throughout the year.
- All financial records and sensitive actions are audited.

---

## 2. Roles and access at a glance

| Area | Super Admin | School Admin | Bursar | Teacher | Parent |
| --- | --- | --- | --- | --- | --- |
| Dashboard | All schools / selected school | School dashboard | Finance and school dashboard | Interview tasks | Children and applications |
| Applications and interviews | Full access after selecting a school | Full access | No access | Read applications; score assigned interviews | Own applications only |
| Student, teacher and parent records | Full access | Full access | View only | No access | Own linked children via portal |
| Invoices, payments and receipts | Full access | Full access | Record payments; view and export; request/approve refunds; request adjustments | No access | View own children’s records and receipts |
| Write-offs | Yes | Yes | View only | No | No |
| Reports | All reports | All reports | Finance reports | No | No |
| Schools | Create and manage all schools | No | No | No | No |
| Users and roles | All schools | Own school | No | No | No |
| Audit log, imports and retention | All schools | Own school | No | No | No |
| School settings and fee plans | All schools | Own school | No | No | No |
| Own profile, password and language | Yes | Yes | Yes | Yes | Yes |
| Parent portal | No | No | No | No | Yes |

### Role descriptions

- **Super Admin** — system owner. Manages tenant schools, school-level administrators, global reports, audit, imports and retention. Must select a school before working with that school’s applications, records or finances.
- **School Admin** — manages one school: admissions, records, finance, users, audit, imports, retention and school settings.
- **Bursar** — handles day-to-day finance: payments, receipts, arrears, refunds and fee-adjustment requests. Cannot write off balances, cancel receipts, generate invoices, manage users or change school settings.
- **Teacher** — reviews applications and scores interviews to which they are assigned. Cannot schedule interviews, record decisions or register students.
- **Parent** — accesses only the children linked to their account, plus their own applications, receipts, payment instructions and contact details.

A person can hold more than one role, including roles in different schools. The school selector in the top bar changes the active school and therefore the records and menu options available.

---

## 3. Signing in and common screens

### 3.1 Signing in

1. Open the production URL.
2. Select **Staff sign in** or go directly to `/login`.
3. Enter your registered email address, or your IC number if your account is linked to an IC.
4. Enter your password and select **Sign in**.

Parents can sign in with the email address on their parent record or with the IC number registered for their account.

If you have forgotten your password, select **Forgot your password?**, enter your email address and follow the reset link. For security, the system shows the same confirmation whether or not the email exists.

After five failed sign-in attempts, the account is temporarily locked for 15 minutes. Wait for the lock to expire or contact your system administrator.

### 3.2 Choosing a school

- A School Admin, Bursar, Teacher or Parent normally works in their assigned school automatically.
- A Super Admin starts at state level and can select a school from the school selector. School-scoped modules appear after a school is selected.
- A user with roles in more than one school can switch schools from the top bar. The page reloads in the selected school context.

Always check the school name in the top bar before creating or changing records.

### 3.3 Common navigation

The left sidebar contains the modules allowed for your role. On smaller screens, use the menu button to open the sidebar.

The top bar contains:

- the current school name and school selector, where available;
- the notification bell with an unread count;
- the language switch (BM / EN);
- the user menu with profile/settings and sign-out.

### 3.4 Notifications

Open **Notifications** from the sidebar or the top-bar bell. Notifications include application updates, interview assignments, invoice notices, payment and refund updates, and retention reminders.

- Notifications are always stored in the portal.
- Email delivery is optional and may show as **Sent**, **Queued**, **Failed** or **Portal only**.
- Select a notification to mark it read, or use **Mark all as read**.
- Admin users may also see the school outbox.

### 3.5 Settings and language

**Settings** contains your profile, preferred language and password. School Admins and Super Admins also see school configuration and fee settings for the active school.

Changing the language changes the interface immediately. The preference is saved to your user account.

### 3.6 Screen sizes

The interface works on desktop, tablet and mobile. Tables may scroll sideways on a narrow screen; use the horizontal scroll area within the table rather than zooming the browser.

---

## 4. Public website and admission application

The public website does not require an account. It provides:

- school information and the admission call-to-action;
- the online application form at `/apply`;
- the application status checker at `/status`;
- the PDPA privacy notice at `/privacy`.

### 4.1 Submitting an application

The form has three steps:

1. **Student** — school, category, student name, IC or birth-certificate number, date of birth, gender, class applied for, address, email and phone.
2. **Parent / guardian** — parent or guardian name, email and phone.
3. **Education and consent** — previous school and education history, reason for applying, supporting documents and consent.

Complete all fields marked with an asterisk. The applicant must be between 4 and 25 years old. The parent email must be a valid email address.

Supporting documents are optional at submission. Up to 10 files can be attached. Each file must be PDF, JPG, PNG or WebP and no larger than 4 MB.

Select the consent checkbox and submit. The system immediately returns a reference number in the form `APP-XXX/YYYY/NNNNN`.

> Keep the reference number safe. It is required to check the application status. There is no applicant login.

If required information is missing, the age is outside the eligible range, the email is invalid or consent is absent, the application is saved with the status **Incomplete** and flagged for staff follow-up. The applicant still receives a reference number.

### 4.2 Checking application status

1. Open **Check application status**.
2. Enter the reference number.
3. Enter the parent email address or phone number used in the application.
4. Select **Check status**.

The result shows the current status, school, category, submission date, interview details, decision and reason, any offer deadline and automatic screening flags. If the application is incomplete, the page advises that the school will make contact.

### 4.3 Offers and responses

A waiting-list offer is valid for **7 calendar days**. The applicant is notified through the portal notification and, when configured, email.

A parent who has a portal account and whose email matches the application can accept or decline an offer from **My applications** in the parent portal. If no response is received before the deadline, the offer lapses automatically.

If the parent cannot see the application in the portal, the email on the application may differ from the email on the parent account. Contact the school office to correct the record.

---

## 5. Super Admin guide

The Super Admin has system-wide access. The school selector determines which school’s operational data is shown. At state level, the Super Admin sees the state dashboard, schools, users, audit, imports, retention, reports, notifications and personal settings.

### 5.1 State dashboard and school context

The dashboard provides a state-level overview of schools, student numbers, applications, fee collection and arrears. Select a school to work inside it. After switching, the admissions, records and finance menus become available for that school.

### 5.2 Schools

Open **Administration → Schools**.

#### Create a school

Select **Create school** and provide:

- school name, short name, category (Tahfiz or Islamic Studies) and state;
- invoice and receipt prefixes;
- monthly and registration fees, or configure fee plans later;
- monthly due day and registration generation/due dates;
- bank name, account number and payment instructions in BM and EN;
- logo URL, if required;
- the School Admin’s name, email and temporary password.

Creating a school also creates its School Admin account. The School Admin can sign in immediately.

#### Manage a school

From the school list you can open school settings, edit fee plans and payment details, and suspend or reactivate a school. A suspended school is excluded from the public school list. School names and payment details are used on forms, receipts and letters, so keep them accurate.

### 5.3 Users and roles

Open **Administration → Users & roles**.

- Select **Add user** to create a staff or parent account.
- Choose the role and, where applicable, the school.
- A parent account is linked to a parent record; the link determines which children the parent can see.
- A user may hold more than one role or roles in more than one school.
- Accounts are **deactivated, never deleted**. Use **Deactivate** or **Activate**.
- Use **Reset password** to issue a temporary password. Share it securely; the user can change it after signing in.
- The list shows role, school, status and last sign-in.

### 5.4 Audit log

Open **Administration → Audit log**. Every sensitive action records the time, user, role, action, entity, record and before/after details where applicable. The log is read-only and cannot be edited or deleted. Entries are retained according to the audit retention rule (one year).

### 5.5 Import data

Open **Administration → Import data**.

1. Choose the data type: students, parents, teachers or opening fee balances.
2. Download the CSV template for that data type.
3. Upload a CSV exported from Excel. The maximum is 2,000 rows per file.
4. Select **Run validation**. No data is saved during the dry run.
5. Review the validation report: total rows, valid rows, failed rows and row-level errors.
6. Select **Confirm import**. Only valid rows are written; failed rows are not saved.

The source file is stored with the import batch for reference.

### 5.6 Retention

Open **Administration → Retention**. Retention rules define how long each data type is kept. A monthly job flags records that have passed their retention period. The School Admin or Super Admin reviews each flagged record and chooses to delete personal data, anonymise it or dismiss the flag. No deletion or anonymisation occurs without approval.

### 5.7 Reports

Open **Operations → Reports**. Reports are generated from live data and can be downloaded as PDF for printing, CSV for spreadsheets or Excel (`.xls`) for further analysis. Available reports include admissions funnel, interview results, registration list, student and teacher records, fee collection, arrears aging, receipt register, refund log, teacher assignments, audit log, write-offs and the state-level consolidated report.

Use the period and class filters where relevant. A user only sees reports permitted for their role.

### 5.8 Super Admin settings

Use **Settings** to change your own name, language and password, and to review the active school context. School-specific settings are managed from **Schools** or, when a school is active, from **Settings → School / Fees**.

---

## 6. School Admin guide

The School Admin manages one school. The menu contains **Dashboard**, **Admissions**, **Records**, **Finance**, **Operations**, **Administration** and **Settings**.

### 6.1 Dashboard

The dashboard summarises:

- active students and monthly tracking status;
- fees collected this month and outstanding fees;
- open invoices and pending actions;
- admissions funnel and recent applications;
- upcoming interviews and scores still to be completed;
- latest receipts, arrears aging and pending refunds/adjustments.

Quick actions provide shortcuts to the application list, payment recording, monthly billing and reports.

### 6.2 Admissions workflow

The normal workflow is:

**Application received → screening → interview scheduled → two assessors score → committee decision → offer (if waiting list) → registration**

#### Review applications

Open **Admissions → Applications**. Use the tabs and filters to find applications by status, category or search term. The list shows the reference, applicant, submission date and final interview mark.

Open an application to see:

- applicant and parent details;
- education history and reason;
- supporting documents;
- automatic screening checks: missing fields, age eligibility, documents, consent and email validity;
- interview history and scores;
- decision and offer status.

#### Schedule an interview

1. Open the application.
2. Select **Schedule interview**.
3. Enter the date and time, mode (in person or phone), location and notes.
4. Select **two assessors** from the school’s teachers.
5. Save.

The application status changes to **Interview** and the applicant and both assessors are notified. Teachers only see interviews to which they are assigned.

#### Score an interview

Open the assigned interview from **Admissions → Interviews** or the interview task on the dashboard. The rubric totals 100 marks across the sections defined for the school category. Enter each item, add the optional hafazan checklist/time rating, and submit.

- The final mark is the **average of the two assessors**.
- The pass mark is **40/100**.
- A mark below 40 is flagged to the committee; the committee can still record its decision.
- Assessors can amend their submitted scores.
- A teacher’s view of the other assessor’s marks is hidden until the teacher submits their own score.
- When both scores are received, the interview is marked **Completed**.

#### Record the committee decision

1. Open the application.
2. Select **Record decision**.
3. Choose **Accepted**, **Not accepted** or **Waiting list**.
4. Enter a reason. A reason is mandatory and supports any later appeal.
5. Save.

The decision is notified to the applicant. The application status changes accordingly.

#### Make a waiting-list offer

A waiting-list offer can only be made for an applicant whose decision is **Waiting list**.

1. Open the application.
2. Select **Make waiting-list offer**.
3. Confirm. The system sets a response deadline **7 calendar days** from the offer date.
4. The applicant is notified. The parent can accept or decline from the portal.

If the parent accepts, the application becomes **Accepted**. If the parent declines, the response is recorded and the applicant returns to the waiting list. If there is no response, the offer lapses automatically after the deadline.

#### Register an accepted applicant

1. Open an **Accepted** application.
2. Select **Register student**.
3. Confirm the class, monthly fee and parent information.
4. Save.

Registration:

- creates a new student record, or reactivates an existing student with the same IC in the school;
- creates or reuses the parent record and links the parent to the student;
- creates the **registration fee invoice for the current calendar year**;
- marks the application **Registered**;
- warns about outstanding arrears if the student is re-registering, but does **not** block registration.

Registration does **not** automatically switch on monthly fee tracking. Open the student record and enable monthly tracking when monthly fees should begin. The first monthly invoice will be for the first day of the following month.

### 6.3 Student records

Open **Records → Students**.

- Use search and filters to find students by name, class, status or tracking status.
- Select a student to see personal details, fee plan, monthly fee, balance, parents/guardians, invoices, payments, adjustments and reminders.
- Select **Add student** to create a record manually.
- IC numbers are encrypted at rest and shown masked.
- Use **Link parent** to connect an existing parent or create a new parent record.
- Use **Update tracking** to switch monthly tracking on or off. Switching on sets the first invoice month to the following month. Switching off stops new monthly invoices but leaves existing invoices payable.
- Use **Generate registration invoice** if the current-year registration invoice has not yet been created. The system prevents duplicates for the same student and calendar year.
- Download the account statement as a PDF.
- Change the student’s status to **Active**, **Withdrawn** or **Graduated** as appropriate.

### 6.4 Teacher records

Open **Records → Teachers**.

- View teacher contact details, school assignments, login account and interview duties.
- Select **Add teacher** to create a record.
- Optionally create a login account and set a temporary password. If left blank, the default temporary password is used.
- A teacher can be assigned to more than one school through user roles.
- Deactivate a login when a teacher leaves; do not delete the record.

### 6.5 Parent records

Open **Records → Parents**.

- View parent contact details and linked children.
- Create or edit parent records and link them to students.
- A parent can be linked to more than one child, including children in different schools, but the portal only shows the linked records.
- Ask parents to keep their phone, email and address current; they can update these fields in the portal.

### 6.6 Finance overview

The Finance menu contains:

- **Invoices**
- **Payments**
- **Receipts**
- **Arrears**
- **Refunds**
- **Write-offs**
- **Fee adjustments**
- **General ledger**

#### Invoices

Invoices may be monthly, registration, opening or adjustment invoices. Each shows the invoice number, student, period, issue date, due date, amount, outstanding balance and status.

- **Monthly invoices** are generated for a selected billing month, normally the following month.
- **Registration invoices** are generated once per student per calendar year.
- Issued invoices keep their original due date even if the school later changes its due-day settings.
- The system does not pro-rate monthly fees; the full monthly fee applies for each active month.
- Use the export options to download invoices as CSV or Excel.

#### Generate invoices

School Admins can use **Generate monthly invoices** or **Generate registration invoices**.

- Monthly generation applies to active students with monthly tracking switched on and a tracking start date on or before the billing month.
- Registration generation applies to active students and uses the current calendar year.
- Re-running generation is safe: existing invoices for the same student, type and period are not duplicated.

#### Record a payment

1. Open **Finance → Payments** or use the dashboard quick action.
2. Select the student.
3. Enter the amount, payment date, method (cash or bank) and bank reference where applicable.
4. Add notes or attach proof if available.
5. Save.

Payments are allocated to the **oldest outstanding invoice first**. Any overpayment is held as student credit and applied to future invoices. A receipt is issued immediately with a sequential number.

For a waived invoice, a payment can be recorded as a **recovery of the written-off balance**.

#### Receipts

Open **Finance → Receipts**.

- Receipts are sequential and gap-free.
- Receipts are **never deleted**.
- A School Admin can cancel a receipt with a reason. The number is retained and the receipt is marked cancelled.
- Open a receipt to view or print the PDF.

#### Arrears

Open **Finance → Arrears**. Outstanding invoices are aged from their original due date into 1–30, 31–60, 61–90 and over-90-day buckets.

Reminder notices are generated at day 3, day 14 and day 30 after the due date, then every 30 days. Formal notices at day 30 and beyond require review before release. School Admins and Bursars can release reminders.

#### Refunds

Open **Finance → Refunds**.

1. Select **Request refund**.
2. Choose the student, amount and reason. The amount cannot exceed available credit.
3. Submit. The request is recorded as **Pending**.
4. A second authorised person approves or rejects it.

The requester cannot approve their own refund. When approved, available credit is reduced and the parent is notified.

#### Write-offs

Open **Finance → Write-offs**. Only a **School Admin** can write off balances.

- Choose all outstanding invoices or selected invoices.
- Enter a reason.
- Confirm. The selected invoices are marked **Waived** and the action is recorded in the audit log.
- Write-offs cannot be undone. If the family later pays, use **Record recovery** against the waived invoice.

#### Fee adjustments

Open **Finance → Fee adjustments**.

- A Bursar or School Admin can request a change to a student’s monthly fee.
- Enter the new monthly rate, effective date and reason.
- A School Admin approves or rejects the request.
- On approval, the student’s monthly fee is updated for future invoices and the parent is notified.

#### General ledger

Open **Finance → General ledger**. Choose a period and generate the ledger. Invoices appear as debits, payments as credits, and a running balance is shown. Download the ledger as CSV or Excel when needed.

### 6.7 Administration for the school

School Admins can manage:

- **Users & roles** for their school, including parent accounts and password resets.
- **Audit log** for the school, read-only.
- **Import data** using the CSV dry-run workflow.
- **Retention** review and approval for their school.
- **Reports** for admissions, records and finance.

### 6.8 School settings

Open **Settings**:

- **School** — school identity, contact details, bank details, payment instructions, branding and due dates.
- **Fees** — fee plans, monthly and registration fees.
- **My account** — name, language and password.

Changes to due days apply only to invoices issued after the change. Issued invoices keep their original due dates. The registration fee is charged once per student per calendar year, independently of monthly tracking.

---

## 7. Bursar guide

The Bursar handles finance and has read-only access to records. The menu contains **Dashboard**, **Records**, **Finance**, **Operations → Reports**, **Notifications** and **Settings**.

### 7.1 Records

The Bursar can view students, teachers and parents, including balances and contact details, but cannot create or edit those records. Ask a School Admin to correct record data.

### 7.2 Payments and receipts

The Bursar can:

- record cash and bank payments;
- allocate payments to the oldest outstanding invoices;
- record a recovery against a waived invoice;
- view and print receipts;
- export payment and receipt data.

The Bursar cannot cancel receipts. Cancellation is restricted to the School Admin.

### 7.3 Arrears

The Bursar can review aging, release formal reminders at day 30 and beyond, and follow up on outstanding balances. Reminders are generated from the original due date.

### 7.4 Refunds

The Bursar can request refunds and can approve or reject another person’s pending refund request. The Bursar cannot approve their own request. Approval is only possible when sufficient student credit exists.

### 7.5 Fee adjustments

The Bursar can request a change to a student’s monthly fee. Only a School Admin can approve or reject it.

### 7.6 Bursar restrictions

The Bursar cannot:

- write off outstanding balances;
- cancel receipts;
- generate monthly or registration invoices;
- approve fee adjustments;
- manage users, imports, retention or audit;
- change school settings or fee plans;
- schedule interviews, record admissions decisions or register students.

### 7.7 Bursar reports

Open **Operations → Reports** for fee collection, arrears aging, receipt register, refund log, write-off report and other finance-related reports permitted for the role.

---

## 8. Teacher guide

The Teacher menu contains **Dashboard**, **Admissions → Applications / Interviews**, **Notifications** and **Settings**.

### 8.1 Interview tasks

The dashboard shows your assigned interviews and scoring tasks. Open **Admissions → Interviews** to see the interviews assigned to you. You only see interviews where you are an assessor or the creator.

### 8.2 Reviewing applications

Teachers can open applications and review applicant details, documents, interviews and scores. Teachers cannot:

- schedule interviews;
- record committee decisions;
- make offers;
- register students;
- change student or finance records.

### 8.3 Scoring an interview

1. Open the assigned interview.
2. Review the applicant and the interview details.
3. Enter a score for each rubric item within the stated maximum.
4. Optionally record the hafazan time rating and checklist items.
5. Confirm and submit.

The running total is shown before submission. The total cannot exceed 100, and each item must stay within its maximum. You can amend your score later.

The final mark is the average of both assessors. The pass mark is 40/100. If the final mark is below 40, the committee is notified and can still make a decision. The other assessor’s marks are hidden until you submit your own score.

---

## 9. Parent guide

Parents have a dedicated portal and cannot see other families’ records.

### 9.1 Signing in

Use the email address on your parent record or your registered IC number, together with your password. If the school created your account, use the temporary password provided and change it in **Settings** after signing in.

### 9.2 My children

Open **My children** to see every child linked to your account. Each child card shows the school, class, status, outstanding balance, available credit and next due date.

Select **View account** to see:

- the child’s invoices, including period, due date, amount and status;
- payments and receipt numbers;
- the current balance and credit;
- the school’s bank details and cash payment instructions.

Select **Receipt** to download a receipt PDF. There is **no online payment**. Pay by bank transfer or cash at the school office; staff will record the payment and issue a receipt.

### 9.3 My applications

The portal lists applications whose parent email matches your account email. You can see the status and any offer.

If an offer is active, select **Respond**, then **Accept offer** or **Decline offer** before the deadline. The offer is valid for 7 calendar days. If you do not respond, it lapses automatically.

If an application is missing, it was probably submitted with a different parent email. Contact the school office with the reference number.

### 9.4 Contact details

Use **Update contact details** to change your phone, email or address. Keep these current so the school can reach you and so application records remain linked to your account.

### 9.5 Notifications and settings

The portal shows school notices, invoice and payment updates, offer reminders and other messages. Use **Settings** to change your password and preferred language.

### 9.6 Privacy

You can only view children linked to your parent record. If a child is missing, the school must add the parent–child link; you cannot create it yourself.

---

## 10. Key business rules

The following rules are enforced by the system and should be reflected in school practice.

### Admissions and interviews

- Applications are accepted throughout the year. There are no intake periods or seat limits.
- Applicants must be between 4 and 25 years old. Missing required fields, invalid email, missing consent or an ineligible age flags the application as incomplete.
- An interview has two assessors. The final mark is the average of the assessors’ totals.
- The interview rubric totals 100 marks; the pass mark is 40.
- A mark below 40 is flagged to the committee, but the committee still records the decision and reason.
- A decision requires a reason.
- Waiting-list offers are valid for 7 calendar days and lapse automatically if unanswered.
- Only accepted applicants can be registered.
- Registration creates or reactivates the student, links the parent, and issues one registration invoice for the current calendar year.
- Outstanding arrears do not block registration, but the School Admin and Bursar are notified.
- Monthly tracking is separate from registration and starts on the first day of the following month when switched on.

### Finance

- Payments are allocated to the oldest outstanding invoice first.
- Overpayments become student credit and are applied to future invoices.
- Receipt numbers are sequential and gap-free. Receipts are cancelled, never deleted.
- One registration invoice is allowed per student per calendar year.
- Monthly fees are not pro-rated; the full fee applies for each active month.
- Issued invoices keep their original due date when school due-day settings change.
- Write-offs are restricted to the School Admin and cannot be undone. Later payments against a waived invoice are recorded as recoveries.
- Refunds require a second approver, and the requester cannot approve their own refund.
- Fee adjustments are requested by the Bursar or School Admin and approved by the School Admin.
- Arrears reminders follow day 3, day 14, day 30 and then every 30 days from the original due date.
- The general ledger shows invoices as debits and payments as credits.

### Records and access

- A user may hold multiple roles and roles in multiple schools.
- Accounts are deactivated, never deleted.
- Every school-scoped query is limited to the active school.
- Parents only see children explicitly linked to their parent record.
- Students and applicants do not have login accounts.
- IC numbers are encrypted at rest and shown masked.
- Audit entries are read-only and retained for one year.

### Dates and payment

- All dates use the Gregorian calendar.
- There is no online payment gateway.

---

## 11. Status reference

### Application status

| Status | Meaning |
| --- | --- |
| Submitted | Complete application received and awaiting review. |
| Incomplete | Required information, age eligibility, email or consent needs attention. |
| Interview | Interview scheduled or in progress. |
| Accepted | Committee accepted the applicant. |
| Not accepted | Committee did not accept the applicant. |
| Waiting list | Applicant is on the waiting list. |
| Registered | Applicant has been registered as a student. |

### Offer status

| Status | Meaning |
| --- | --- |
| Offered | Waiting-list offer sent; response required by the deadline. |
| Accepted | Parent accepted the offer. |
| Declined | Parent declined the offer. |
| Lapsed | Deadline passed without a response. |

### Invoice status

| Status | Meaning |
| --- | --- |
| Unpaid | No payment or credit applied yet. |
| Partial | Some amount paid or credited; a balance remains. |
| Paid | Fully settled. |
| Waived | Outstanding balance written off by the School Admin. |

### Refund and adjustment status

| Status | Meaning |
| --- | --- |
| Pending | Awaiting a second approver or School Admin review. |
| Approved | Approved and applied. |
| Rejected | Declined; no financial change. |

### Import status

| Status | Meaning |
| --- | --- |
| Dry run | Validation completed; no rows saved. |
| Confirmed | Valid rows written to the database. |

---

## 12. Security, privacy and data retention

- Sign-in sessions use secure, HTTP-only cookies in production.
- Passwords are stored using PBKDF2 with per-user salts.
- IC numbers are encrypted at rest and masked in responses and lists.
- Role checks are enforced by the API as well as the interface.
- Every school-scoped query is filtered by the active school.
- Audit entries record sensitive actions and cannot be edited or deleted.
- Documents and payment proofs are stored in private object storage; only authorised users can retrieve them.
- Portal notifications are always recorded; email delivery is optional and never blocks the portal message.
- Data is processed under Malaysia’s Personal Data Protection Act 2010.
- Parents may request access to their children’s data and correct their own contact details through the portal.
- Retention rules define how long each data type is kept. Flagged records are reviewed by an administrator before deletion or anonymisation.
- Audit entries are retained for one year.

Do not share accounts or passwords. Use a separate account for each person so the audit trail remains accurate.

---

## 13. Troubleshooting and support

### I cannot sign in

- Check the email address or IC number and password.
- After five failed attempts, wait 15 minutes for the temporary lock to expire.
- Use **Forgot your password?** to request a reset link.
- If your account is deactivated, contact your School Admin or Super Admin.

### I cannot see a module

Modules depend on your role and active school. If you are a Super Admin, select a school first. If you hold roles in more than one school, use the school selector. If access is still missing, ask an administrator to check your roles.

### A parent cannot see a child

The child must be linked to the parent record. A School Admin can add the link from the parent or student record. Parents cannot create links themselves.

### A parent cannot see an application

The application’s parent email must match the parent account email. Use the reference number and contact the school office to correct the email if needed.

### An offer has disappeared

Waiting-list offers expire after 7 calendar days. If the deadline has passed, the offer lapses. Contact the school office; a School Admin may need to review the application again.

### A payment is not showing in the portal

Staff record payments manually. Ask the school office for the receipt number and confirm that the payment was recorded against the correct student. Receipts are never deleted; a cancelled receipt remains visible with its number.

### A receipt needs to be cancelled

Only a School Admin can cancel a receipt, and a reason is required. The receipt number is retained. Do not attempt to delete or reissue the same number.

### A monthly invoice is missing

Check that the student is active, monthly tracking is switched on, and the tracking start month has been reached. Generate monthly invoices for the correct billing month. The system does not pro-rate or create duplicate invoices for the same period.

### A balance was written off but the family now wants to pay

Record a payment and select the waived invoice as a **recovery**. The payment is tracked separately from the original write-off.

### The interface is in the wrong language

Use the **BM / EN** switch in the top bar or change the preferred language in **Settings**.

### A table is cut off on a phone

Tables scroll horizontally within their container. Swipe the table area sideways. If the page itself overflows, report the exact page and device width to the system administrator.

### Who do I contact?

- **Admissions, records or portal links** — School Admin.
- **Payments, receipts, refunds or arrears** — Bursar or School Admin.
- **Accounts, roles, imports or retention** — School Admin; for cross-school issues, Super Admin.
- **Privacy requests** — the school office.

---

*End of manual.*
