## CR-1. Remove fee plans, add school-level fees
1. Delete the Fee Plan entity, its screens, endpoints, and the student fee plan field. Remove any fee plan column from import templates and seed data.
2. Add to the school record: `default_monthly_fee` and `registration_fee_amount` (both required, money, two decimals).
3. The create-school form (Super Admin) asks for both fields. School Admin and Super Admin can edit them later. Each edit is audited with before and after values.
4. Changes apply to invoices created after the change. Issued invoices never change (BR-08).
5. Monthly invoice job: use the student's approved adjusted rate if one exists, otherwise `default_monthly_fee`.
6. Registration invoice job: use `registration_fee_amount`.
7. Keep the per-student adjustment flow (Bursar requests, School Admin approves).

## CR-2. Remove class everywhere
1. Remove the `class` field from the student table, forms, API, and filters.
2. Remove the class import template and any class column in the student template.
3. Registration list report: remove the "filter by class" option. Remove any class tile from dashboards.
4. Write a migration that drops the column. Back up first.

## CR-3. IC / Passport No. (students, parents, teachers)
1. Rename the label to **IC / Passport No.** everywhere it appears (forms, tables, reports, emails, import templates).
2. Mandatory for students, parents, and teachers. It accepts IC, passport, birth certificate, and MyKid numbers. Do not enforce a 12-digit format.
3. Normalise before storing and matching: uppercase, remove spaces and hyphens. Put this in one shared function.
4. Store the value encrypted at field level, plus a keyed hash (`id_hash`) of the normalised value for matching. Do not search on the encrypted value.
5. Masked display shows only the last four characters (example `********1234`).
6. Indexes: unique `id_hash` on parents and on teachers. For students, index `id_hash` and warn on a match. Keep the write cost of indexes in mind.

## CR-4. Student forms and page
1. Add student form: remove the parent/guardian section. Remove class, phone, and email. Keep name and IC / Passport No. (mandatory), plus the existing required fields.
2. Student information page: display the linked parents and guardians only (name, masked IC / Passport No., phone, email). There is no "Link parent" and no "Remove link" action here.
3. Do not collect phone or email for students anywhere.

## CR-5. Parent page, forms, and linking
1. Add parent form: name, IC / Passport No., email, and phone are all mandatory.
2. Before creating a parent, search by `id_hash`. If found, show the existing parent and let the School Admin use it. If not found, create a new one. Also warn if the email or phone already belongs to another parent or teacher, with the choice "use existing" or "create anyway" (the second needs a reason).
3. Parent page: add **Link child**. The School Admin searches for students in their own school only and confirms. A parent can be linked to children at different schools. Store `school_id` on each link.
4. Parent page: add **Remove link** beside each child. It deletes only the link row, never the parent account or the student. Audit it. Warn when it is the child's last link. The School Admin can remove links only for students in their own school.
5. School Admin can edit a parent only when the parent has a link to a student in that school. Enforce this on the server.
6. Only Super Admin can delete or deactivate a parent account. Hide the actions from School Admin and also enforce on the server.
7. Registration of an accepted applicant: the registration form searches the parent by IC / Passport No. and links the existing parent, or creates a new parent. The public application form never creates a parent account.

## CR-6. Teacher form
1. Remove the "create a login account" checkbox and the password field. A login is always created.
2. Mandatory: name, IC / Passport No., email, phone.
3. Before creating, search by `id_hash`. If found, add a membership to the current school instead of creating a new teacher, and show the existing details first. Same email and phone warning as parents.
4. A teacher has one record and one login across schools.

## CR-7. Login and passwords
1. Parents and teachers: the login ID is the normalised IC / Passport No. (or email, as before). The initial password is the same value, hashed with Web Crypto. Set `must_change_password = true`.
2. First login: block every page until the password is changed. The new password must differ from the IC / Passport No. and meet the password rules. Then clear the flag.
3. The welcome email states the login ID and never the password.
4. Super Admin and School Admin keep email login with a set password. Do not apply the IC rule or forced change to them.
5. Password reset by email still works for everyone.
6. Check hashing cost against the Workers CPU limit.

## CR-8. Import
1. Remove the class template and class columns.
2. The dry-run validation report flags rows whose IC / Passport No., email, or phone already exists as possible duplicates. No row is created silently.

## CR-9. Documentation touched by code
1. Update labels, help text, and email templates for "IC / Passport No.".
2. Update the user manual (draft v0.2) screenshots after the screens change.

## CR-10. Improved user interface
1. Update logo using image inside \public\images\mduik.jpg

## Tests to add or update

| # | Test |
|---|---|
| 1 | Creating a school requires default monthly fee and registration fee amount. Editing them changes only later invoices. |
| 2 | A monthly invoice uses the approved adjusted rate, else the school default. |
| 3 | No fee plan, class, student phone, or student email appears in any form, API response, report, or import template. |
| 4 | Add student has no parent section. IC / Passport No. is mandatory and accepts a birth certificate or MyKid number. |
| 5 | Student information page shows parents and has no link or unlink action. |
| 6 | Adding a parent requires IC / Passport No., email, and phone. Login ID and initial password equal the IC / Passport No. |
| 7 | First login forces a password change. A new password equal to the IC / Passport No. is rejected. |
| 8 | Adding a teacher has no login checkbox or password field. A login is always created. |
| 9 | Searching an IC / Passport No. finds the existing parent or teacher. No duplicate is created. A teacher at two schools has one record and two memberships. |
| 10 | Email or phone already used by another parent or teacher shows a warning. |
| 11 | Link child and Remove link work only on the parent page, only for students in the admin's own school. |
| 12 | Removing a link keeps the parent account and the student, and is audited. |
| 13 | School Admin cannot delete or deactivate a parent (UI and API). Super Admin can. |
| 14 | School Admin cannot edit a parent who has no linked student in their school. |
| 15 | A parent with children at two schools sees two cards labelled by school, and a total equal to the sum. |
| 16 | Credit at one school cannot pay an invoice at the other school. |
| 17 | Super Admin and School Admin log in with email and a set password. No forced change flag. |
| 18 | The import dry run flags duplicates by IC / Passport No., email, and phone. |

## Not in scope

- No change to Super Admin and School Admin login.
- No online payment.
- No student login.
