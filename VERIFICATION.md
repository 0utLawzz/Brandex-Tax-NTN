# Verification — 14 October 2026

Supabase: FBR-SYS (`buatdkcrapysagrwwjdl`). Original Central Processing project was deleted by the owner during this task. The replacement project was created by the owner. The Brandex trademark CMS was not modified.

## Live backend

21 authenticated/unauthenticated API checks passed against the installed Supabase database and Edge Function:

1. Anonymous client reads denied.
2. Signed-in accounts without a tax role see no records and cannot write.
3. Officer client creation normalizes Client Code.
4. Normalized duplicate codes rejected.
5. Viewer client creation and billing client editing denied.
6. Tax-year charges and filing state remain separate.
7. Billing payment creates a receipt snapshot without changing filing status.
8. Payment retries do not duplicate the payment.
9. Overpayment and reducing charges below payments rejected.
10. Filed state requires a filed date.
11. Notes save; direct browser table mutations denied.
12. Vault credential save, metadata and authorized reveal work; billing/viewer reveal and short purpose denied.
13. Officer NTN PDF upload succeeds through the authenticated endpoint.
14. NTN Certificate uploads into a separate category.
15. Billing and viewer PDF listings/downloads denied.
16. Signed download retrieves the uploaded bytes; expiry is 60 seconds; public and direct authenticated Storage access denied.
17. Non-PDF content rejected.
18. Reveal and retrieval audit events exist without password/PIN values.
19. Admin void preserves the payment record; billing void denied.
20. Soft archive blocks changes; restore preserves notes.
21. Viewer role escalation and settings mutations denied.

Temporary test accounts, synthetic clients, test Vault secrets and test PDFs are removed after validation. Test receipt numbers may leave sequence gaps, which are expected and do not cause reuse.

Final cleanup queries confirmed zero temporary clients, test users and private test files. The production document endpoint was restored to the verified source after cleanup. The final Supabase security advisor scan returned no findings.

## Source and UI

Three domain tests verify Client Code equivalence, separate payment state, balances and HTML escaping. Production compilation passes. Dependency audit reports zero known vulnerabilities. Browser testing covered staff sign-in and actual client/year/payment entry against Supabase, receipt view, search, private document/credential tabs and responsive layout at 390 × 844. The receipt was exported with the browser print engine, verified as one A4 page, rendered and visually inspected without clipping. The one-time owner activation and rejection of code reuse were checked in a rolled-back database transaction.

## Limits / owner actions

Legacy client files were not imported. Drive linking uses existing folder IDs/URLs. Staff must download stored PDFs and send them through their normal communication channel. Browser print/Save as PDF produces receipts; no automatic email delivery is configured. Real staff must choose their own login and complete one-time owner activation. Supabase Auth redirect URLs must be set for a smooth email confirmation return. During testing, Auth's advisor flagged leaked-password protection; confirm that setting in Auth and enable it if supported by the plan.
