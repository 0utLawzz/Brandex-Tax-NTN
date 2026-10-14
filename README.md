# Brandex Tax & NTN Manager

Dedicated Tax/NTN application using Supabase project **FBR-SYS** (`buatdkcrapysagrwwjdl`). It does not modify the trademark CMS.

## First use

1. Open the deployed app. Choose **Create staff account**, enter your own email and a password of at least 12 characters, and confirm the email.
2. Return to the app and sign in. Choose **Activate owner access** and paste the one-time code from the separately delivered `OWNER-SETUP.txt` file. The code expires seven days after delivery and works only once, before an active administrator exists.
3. In Settings, set your receipt branding. Additional staff create their own Auth accounts; an administrator grants their user UUID a tax role. Registration alone never gives access to records.

The database, private bucket and document Edge Function are installed. The browser uses only the publishable key. No database password, service-role key or FBR encryption key needs to be entered into the app.

Set Supabase **Authentication → URL Configuration → Site URL** and allowed redirect URLs to the deployed app URL for email-confirmation redirects. Confirming the email also works if you return to the app manually after opening the confirmation link. Enable leaked-password protection if your Supabase plan supports it.

## Included workflows

- Permanent, unique, normalized and locked Client Codes (`X881`, `X 881` and `x-881` become `X-881`); client identifiers, contacts, type, FBR status, Drive folder link/ID, labels and general notes.
- Tax years with due date, filed date/reference, independent filing status, service charge and notes. Only one record per client/year.
- Positive payments against a tax year; overpayments and reducing charges below received payments are rejected. Retry keys avoid duplicate receipts. Receipts preserve original client/year/firm details. Only administrators can void payments, preserving the original record.
- Separate printable service acknowledgements and payment receipts; print to paper or use the browser's Save as PDF. Receipts exclude CNIC, NTN, credentials and internal document links.
- Notes, reusable labels, reporting CSV, dashboard, four-field search, soft archive/restore, activity history, receipt branding and staff settings.
- Two private PDF categories: NTN document and NTN Certificate. Versioned uploads preserve prior documents. PDFs never appear in default listings, reports, receipts or public views. Officers download a copy for sending through their usual client communication channel; the app does not automatically send messages.

## Roles

| Role | Client/filing changes | Payments | FBR credentials / PDFs | Settings / staff / void |
| --- | --- | --- | --- | --- |
| Admin | Yes | Yes | Yes | Yes |
| Officer | Yes | Yes | Yes | No |
| Billing | Read | Record | No | No |
| Viewer | Read | Read | No | No |

All users with tax access are trusted internal staff. No client/public portal is supplied. Auth accounts without active tax membership cannot read tax data. Roles are read from live `tax_members`, never user-editable Auth metadata.

## Security implementation

Every tax table has RLS. Browser roles receive SELECT grants with appropriate policies; mutations use an audited, role-checked RPC. Privileged functions live in an unexposed private schema with a fixed empty search path and explicit execute grants. Client Code cannot be changed even through direct database updates. The audit log has no browser write/delete grants.

FBR password/PIN JSON is stored only as an encrypted Supabase Vault secret. Its reference and verification/contact metadata live in `tax_private.credentials`, with no browser table grants and a deny policy. Authorized reveals require a purpose, log an event in the same transaction, and are limited to ten per minute per user. The UI clears revealed values after 30 seconds, on navigation and on hiding the tab. Copy requires another audited reveal. Clipboard contents remain until replaced by the user. Supabase project/database owners remain privileged administrators of Vault.

`tax-private-documents` is a private bucket, limited to PDF MIME type and 10 MB. A restrictive policy denies direct browser access to this bucket, including in the presence of permissive policies. `tax-documents` validates the bearer token with `Auth.getUser`, checks live membership and role, verifies the client and PDF header/size, and uses the server-only service-role key supplied automatically by Supabase. Downloads require a purpose and an audit entry before issuing a 60-second signed link. Signed links are bearer links during that short lifetime; downloaded copies are managed by staff. Files have no inline preview. Upload-registration failure triggers storage cleanup.

The Edge Function uses `verify_jwt=false` because it performs full authentication explicitly in the function and supports current publishable-key/JWT handling. This is not an unauthenticated endpoint. Invalid or missing tokens and non-officer roles are rejected.

No client secrets or PDFs are cached in localStorage. Browser connection settings contain public values only; the staff Auth session uses sessionStorage. Sample mode is explicitly marked and uses fictional, memory-only data. It cannot upload documents or reveal real credentials.

## GitHub and Vercel

Repository: https://github.com/0utLawzz/Brandex-Tax-NTN (private).

Vercel builds with `npm ci` and `npm run build` and publishes `dist`. The browser connection values in `src/public-config.js` are public; no service-role key or owner activation code is required in Vercel environment variables. Set Supabase Auth Site URL and allowed redirects to the Vercel production URL. Access to records still requires Supabase Auth and an active tax role.

## Development and redeployment

```sh
npm ci
npm test
npm run dev
npm run build
```

`src/public-config.js` contains the public connection to FBR-SYS. For another project, use the blank `.env.example` template or change the public configuration. Never place a service-role or secret key in `VITE_*` variables or browser code. `.env` files are ignored.

Migrations in `supabase/migrations/` reproduce the database structure on a fresh project. Deploy `supabase/functions/tax-documents/index.ts` as `tax-documents`; its auth check must remain intact. `supabase/config.toml` records the endpoint's gateway configuration. Owner setup code provisioning is separate from migrations, so plaintext setup codes never enter source control. Generate a cryptographically random 32-byte code; insert only its SHA-256 hash into `tax_private.owner_setup` with a limited expiration. Never reset owner setup when an active administrator exists.

## Verification

See `VERIFICATION.md` for the actual checks performed and limits. Live testing uses synthetic temporary records, not legacy clients. Existing Drive files were not imported or moved.
