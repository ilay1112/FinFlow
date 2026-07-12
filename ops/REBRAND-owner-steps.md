# Rebrand cutover — owner-only external steps (`finflow.co.il` → `tbiz.co.il`)

**Ticket:** FF-INT-2. These are steps no agent can perform (require console/registrar access with
owner credentials). Everything else (code, copy, package IDs, Drive folder rename) is handled by the
other rebrand tickets (FF-WEB-3, FF-MKT-2, FF-AND-1, FF-DATA-1).

## Auth code audit (context for the steps below)

`src/services/auth.ts:82` pins the web OAuth redirect to
`${window.location.origin}/login` — **origin-relative**, not hardcoded to `finflow.co.il`. Grepped
the full auth path (`src/services/auth.ts`, `src/App.tsx`) and the client IDs
(`GOOGLE_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`) both come from `import.meta.env` — no literal domain
anywhere in the login/refresh/logout flow. **Conclusion: the code will work unmodified on
`tbiz.co.il`** the moment the new origin/redirect URI is registered on Google's side (step 2 below).
No code fix was needed; `auth.ts` was left untouched.

The only `finflow.co.il` occurrences in the repo are in marketing copy/metadata
(`marketing/landing/index.html`, `TEAM_BOARD.md`) and docs — owned by FF-MKT-2/FF-WEB-3, not auth.

---

## 1. Vercel — custom domain

1. Vercel dashboard → the FinFlow project → **Settings → Domains** → **Add** `tbiz.co.il` (and
   `www.tbiz.co.il` if you want the www variant, redirecting to the apex or vice versa — pick one as
   primary).
2. Vercel will show the DNS records to create at your registrar. Typically:
   - **Apex (`tbiz.co.il`):** an `A` record to Vercel's anycast IP (`76.76.21.21`), **or** `ALIAS`/
     `ANAME` to `cname.vercel-dns.com` if your registrar supports it.
   - **`www.tbiz.co.il`:** `CNAME` → `cname.vercel-dns.com`.
   - Exact records are shown live in the Vercel Domains panel — use those, they can change.
3. Wait for Vercel to show the domain as **Valid** (DNS propagation + automatic TLS cert issuance,
   usually minutes to a few hours).
4. Keep `finflow.co.il` (or the current `*.vercel.app` domain) attached and serving during the
   transition — do not remove it until cutover is confirmed (§5).

## 2. Google Cloud Console — OAuth Web client

Console → **APIs & Services → Credentials** → the existing Web application OAuth client (the one
`GOOGLE_CLIENT_ID` points to).

- **Authorized JavaScript origins:** add `https://tbiz.co.il`.
- **Authorized redirect URIs:** add `https://tbiz.co.il/login`.
- **Keep the existing `finflow.co.il` origin/redirect entries in place** until cutover is complete
  (don't delete them yet — see checklist below). Without the tbiz entries present, login on the new
  domain fails with `Error 400: redirect_uri_mismatch` (this is the exact failure mode `auth.ts:74-79`
  already guards against for path variance — it does not help across domains).

## 3. Google Cloud Console — OAuth Android client

Same Credentials page, the Android OAuth client used by the Capacitor app.

- Register the new package name **`com.tbiz.app`** (from FF-AND-1's appId change) as a new Android
  OAuth client, or update the existing one's package name if Google allows in-place edits.
- Attach the app's **SHA-1 signing certificate fingerprint** (from FF-AND-1 — get it from the signing
  keystore/Play Console release). Google Sign-In on Android matches package name + SHA-1; if either is
  missing/wrong, native Google login fails silently or with `DEVELOPER_ERROR`.
- If FF-AND-1 keeps both a debug and release signing key, register **both** SHA-1s (debug builds
  otherwise can't sign in during QA).

## 4. OAuth consent screen

Console → **APIs & Services → OAuth consent screen**.

- Rename the app from **"FinFlow"** to **"tbiz"** — this is the name users see on the Google
  sign-in/consent dialog.
- Update the **Application home page**, **Privacy policy link**, and **Terms of service link** to
  `https://tbiz.co.il/...` — but only **after** step 1 confirms `tbiz.co.il` is live and serving those
  pages (don't point consent screen links at a domain that 404s).

## 5. Drive data — informational, no owner action required

FF-DATA-1 renames the `FinFlow Data` root folder to `tbiz Data` automatically on next app load
(metadata-only rename via the Drive API — file IDs and contents are untouched, so no data is lost or
duplicated). No owner console action needed for this step. Recommendation: before this goes out to
real users, run one **live migration drill on a test/throwaway Google account** (sign in, confirm the
folder renames cleanly, confirm existing invoices/expenses still load) so the first real user isn't
the first test of the rename path.

## 6. Cutover checklist — ordering matters

Do NOT deploy the tbiz-branded build (FF-WEB-3, FF-MKT-2) before the Google-side registration is
live, or login will break for anyone who lands on the new domain mid-switch.

1. **Register `tbiz.co.il` in Vercel + set DNS** (§1) — wait until Vercel shows the domain as Valid
   with TLS issued.
2. **Add tbiz origins/redirects to the Google OAuth Web client** (§2) — do this before any traffic is
   sent to `tbiz.co.il`, since without it login 400s immediately.
3. **Register the Android package + SHA-1** (§3) — needed before FF-AND-1's rebranded Android build
   is distributed to any tester/user.
4. **Deploy/merge the rebranded app** (FF-WEB-3, FF-MKT-2 code) so `tbiz.co.il` serves the tbiz UI.
5. **Smoke-test login on `tbiz.co.il`** with a real Google account — web login, and Android login once
   that build is out — before telling users/switching primary links to the new domain.
6. **Rename the OAuth consent screen app name + policy links** (§4) — cosmetic, safe to do any time
   after step 4, but the links must point at a live tbiz page.
7. Only after tbiz.co.il is confirmed working end-to-end: optionally remove the old
   `finflow.co.il` origin/redirect entries from the Google OAuth client (not urgent — leaving them is
   harmless, they're just unused once nothing links to the old domain).

## 7. 301 redirects — old domain(s) to tbiz.co.il

If `finflow.co.il` and/or `finflow.app` were ever live and indexed (check registrar/hosting history —
not just the current Vercel project), set up permanent redirects so existing inbound links, bookmarks,
and search engine results don't 404 after cutover:

- At the registrar/DNS or hosting layer for each old domain still under your control, add a **301
  (permanent) redirect** from `finflow.co.il/*` (and `www.finflow.co.il/*` if that variant was live) to
  the equivalent `tbiz.co.il/*` path — preserve the path/query string, don't blanket-redirect everything
  to the homepage.
- Same for `finflow.app` if it was ever a live, published domain (not just reserved).
- If the old domain is still pointed at the Vercel project (per §1, don't remove it immediately), you
  can alternatively configure the redirect **in Vercel** (Project → Domains → mark `finflow.co.il` as a
  redirect target to `tbiz.co.il` with a 308/301) instead of at the registrar.
- Do this **after** §1–§4 of the cutover checklist (tbiz.co.il must be live and serving correctly
  before you redirect traffic away from the old domain).
- Verify with `curl -I https://finflow.co.il/<some-known-path>` and confirm a `301`/`308` status with a
  `Location: https://tbiz.co.il/<same-path>` header, for a couple of real paths (home, login, pricing).

## 8. Google Search Console — add tbiz.co.il + Change of Address

1. In [Google Search Console](https://search.google.com/search-console), add a new property for
   `tbiz.co.il` (Domain property is preferred if you can complete DNS verification; URL-prefix property
   with the HTML tag/file method also works).
2. Verify ownership (DNS TXT record at the registrar for a Domain property, or the HTML verification
   file/meta tag for a URL-prefix property — either way this depends on §1's DNS access).
3. Once §7's redirects are live and confirmed, open the **old** `finflow.co.il` property in Search
   Console (add it first if it isn't already a verified property there) → **Settings → Change of
   Address** → select the new `tbiz.co.il` property → follow the wizard, which checks that the 301
   redirects are in place before accepting the change.
4. Submit the `tbiz.co.il` sitemap in the new property (Search Console → Sitemaps) so re-indexing under
   the new domain starts promptly instead of waiting for organic re-crawl.
5. Leave both properties verified and monitor the old property's Change of Address status and the new
   property's Coverage/Performance reports for a few weeks post-cutover to confirm search traffic
   migrates cleanly.
