# FinFlow Landing Page — Waitlist $0 Setup Guide

**File:** `marketing/landing/index.html`
**Status:** DONE — wired to the owner's real Google Form. Design + a11y + seo + cost gates CLEAR
(see TEAM_BOARD.md FF-MKT-1 thread). Endpoint is
`https://docs.google.com/forms/d/e/1FAIpQLSfyfeifgfQ9s6LtxHccgaLxKTZlPkCI16oFRZb_UxnzgWWwlQ/formResponse`
and the email field is `entry.759788545` (both live in the form-submit handler in
`marketing/landing/index.html`, currently around line 825–833). Verified with a Playwright-driven
test submission against the local static server (2026-07-12) — see TEAM_BOARD.md FF-MKT-1 for
evidence. **Remaining step is the owner's, not dev's:** submit one real test entry on the live page
and confirm it lands in the Form's Responses tab / linked Google Sheet (dev has no access to verify
that last hop).

## Zero-Cost Capture Options

All three options are:
- ✓ Free (no paid tiers or usage caps)
- ✓ No backend infrastructure (zero-server compliant)
- ✓ GDPR/privacy-safe (user controls data storage)
- ✓ Documented in the HTML `<script>` section (lines 665–918)

### Option A: Google Form (Recommended — Simplest, and the wired default) — DONE

**Cost:** $0 | **Setup time:** 5 min | **Maintenance:** None

**Status: wired and verified.** The page now posts to the owner's real form:
- Endpoint: `https://docs.google.com/forms/d/e/1FAIpQLSfyfeifgfQ9s6LtxHccgaLxKTZlPkCI16oFRZb_UxnzgWWwlQ/formResponse`
  (the public `/d/e/` form-response path — required; the `/d/{FORM_ID}/` editor path silently fails
  for a public form).
- Email field: `entry.759788545`, appended as the email value on submit.
- Request mode: `no-cors` fetch (Google Forms sends no CORS headers, so the response is opaque —
  a resolved promise is treated as success and shows the existing success message; a rejected
  promise, e.g. offline, does not).
- Verified 2026-07-12 with a Playwright-driven test submission against the local static server: the
  captured network request was `POST https://docs.google.com/forms/d/e/1FAIpQLSfyfeifgfQ9s6LtxHccgaLxKTZlPkCI16oFRZb_UxnzgWWwlQ/formResponse`
  with `entry.759788545=<test email>` in the multipart form-data payload, and the success message
  (`#success-message` gains class `show`) rendered afterward.

**Steps below are kept for reference only** (e.g. if the owner ever needs to repoint this at a
different form) — they are already done for the current live form:
1. Go to https://docs.google.com/forms/create and create a new form.
2. Add one field: **"Email Address"** — set field type to "Short answer" and toggle **Required**.
   (Do not add any other required fields — the page only submits an email value.)
3. Click **Send** (top right) → the **link icon** tab → copy the share link. It looks like:
   `https://docs.google.com/forms/d/e/1FAIpQLSc.../viewform`
   The `FORM_ID` is the long token between `/d/e/` and `/viewform`.
4. In `marketing/landing/index.html`, set `googleFormUrl` (in the waitlist submit handler,
   currently around line 828) to `https://docs.google.com/forms/d/e/{FORM_ID}/formResponse`.
5. Find the email field's entry ID:
   - Open the live form (the `viewform` link), right-click anywhere → **Inspect** → **Network** tab.
   - Fill in a test email and submit the form manually.
   - In the Network tab, find the `formResponse` POST request and look at its **Payload/Form Data** —
     you'll see a field named `entry.XXXXXXXXXX` (a long number) mapped to the email you typed.
   - In `marketing/landing/index.html`, find `formData.append('entry.759788545', email);`
     (currently line 833) and replace `759788545` with the real number you found
     (keep the `entry.` prefix).
6. Save the file. Responses auto-save to a linked Google Sheet (click **Responses** tab →
   the green Sheets icon → "Create Spreadsheet" if not already linked).
7. Export responses as CSV anytime from the Responses tab (⋮ menu → Download responses).

**Pros:**
- No code needed; Google handles everything
- Responses auto-link to Sheet
- Built-in analytics (response count, timestamps)

**Cons:**
- Must manually extract the entry ID
- Limited customization

---

### Option B: Formspree Free Tier — NOT RECOMMENDED (cost-validator flagged)

**Cost:** $0 today, but **50 submissions/month hard cap on the free tier** — a real cost cliff if
the waitlist succeeds (the whole point of running it). cost-validator's FF-MKT-1 sign-off
(TEAM_BOARD.md) recommends **Option A or C instead**; keeping this here only for completeness.

**Steps (if you choose this anyway):**
1. Sign up at https://formspree.io
2. Create a new form; select this domain (e.g., `finflow.co.il` or your Vercel domain)
3. Copy your endpoint: `https://formspree.io/f/{PROJECT_ID}`
4. In `marketing/landing/index.html`, replace the fetch call (currently around line 837) with:

```javascript
await fetch('https://formspree.io/f/{PROJECT_ID}', {
    method: 'POST',
    body: JSON.stringify({ email: email }),
    headers: { 'Content-Type': 'application/json' }
});
```

5. Responses appear in your Formspree inbox (email notification)
6. Export to CSV anytime from the dashboard

**Pros:**
- Clean inbox interface
- Email notifications
- Easy export

**Cons:**
- 50 submissions/month limit (sufficient for early-stage validation)
- Requires sign-up

---

### Option C: Google Apps Script + Google Sheet (Most Control)

**Cost:** $0 (Google Cloud free tier) | **Setup time:** 15 min | **Maintenance:** None

**Steps:**
1. Create a Google Sheet: https://sheets.google.com/create
2. Add columns: "Email", "Timestamp", "Submitted At"
3. Go to https://script.google.com → **New project**
4. Replace `Code.gs` with:

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const email = e.parameter.email;
  const timestamp = new Date();
  sheet.appendRow([email, timestamp]);
  return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
}
```

5. Deploy: **"Deploy"** → **"New deployment"** → Type: **"Web app"**
   - Execute as: **"Me"**
   - New users can: **"Anyone"**
6. Copy the deployment URL (looks like `https://script.google.com/macros/s/{DEPLOYMENT_ID}/userweb`)
7. In `marketing/landing/index.html`, replace the fetch URL (currently around line 837, the
   `googleFormUrl`/`fetch(googleFormUrl, ...)` call) with your deployment URL
8. Test: submit the form once; verify the email appears in the Google Sheet

**Pros:**
- Full control over data (Sheet is yours)
- Unlimited submissions
- Automatic timestamping
- Can add formulas, pivot tables, etc.

**Cons:**
- Slightly more setup
- Requires Apps Script knowledge (but template provided)

---

## Current Implementation (Wired and Live)

```html
<form id="waitlist-form">
    <input type="email" required>
    <button type="submit">Sign Up</button>
</form>
```

The JavaScript (lines 665–918) includes:
- Form validation (email regex check)
- Google Form no-cors POST to the real endpoint + real `entry.759788545` field (no placeholder
  constants remain — see Option A above)
- Fire-and-forget success handling (resolved promise → success message; rejected promise → logged,
  no false-positive success message)
- Language-aware feedback (he/en)

**Nothing left to wire on the dev side.** Only remaining action is the owner's: submit one real
test email on the deployed page and confirm the response appears in the Form's Responses tab /
linked Google Sheet (dev verified the outgoing request is correct but has no access to the owner's
Form/Sheet to confirm capture on the receiving end).

---

## Where the page is served (Vercel routing)

`vercel.json` (repo root) now serves `marketing/landing/index.html` at the stable path
**`/lp`** (e.g. `https://finflow.co.il/lp`), via a dedicated `@vercel/static` build + a `/lp` route
that's checked before the existing React SPA catch-all. The site root `/` and all other paths still
go to the React app (`index.html` at repo root) exactly as before — the root path is already the
React app's live entry point (auth/dashboard shell), so putting the marketing page there would have
broken it. Point any outbound waitlist links / ads / social bios at `/lp`, not `/`.

## Deployment Checklist

- [x] **Design gate:** Reviewed — CLEAR (TEAM_BOARD.md FF-MKT-1, design-expert sign-offs)
- [x] **A11y gate:** WCAG 2.1 AA — CLEAR (same sign-offs)
- [x] **SEO gate:** CLEAR (seo-specialist sign-off); structured data, meta, canonical fixed
- [x] **Cost validator:** CLEAR ($0, Google Form/Apps Script recommended over Formspree)
- [x] **Developer (this ticket, FF-MKT-1):** "Who It's For" section removed; `vercel.json` now
  serves the landing page at `/lp` without breaking the React app's routes; waitlist wired to the
  owner's real Google Form (`/d/e/…/formResponse` endpoint + `entry.759788545`) and verified with a
  Playwright test submission — no placeholders remain
- [ ] **Owner:** Submit one real test email on the deployed page and confirm the response appears
  in the Form's Responses tab / linked Google Sheet — **this is the only remaining step before
  treating the waitlist as fully confirmed end-to-end**
- [ ] **QA:** Independently confirm the form submission flow (network request + success message) on
  the deployed `/lp` page
- [ ] **Product:** Confirm `/lp` is the intended public URL (vs. root) and update any outbound links
  (ads, social bios, README) accordingly; monitor waitlist conversions

---

## Success Metric (Validate Stage Exit)

**Goal:** 20+ waitlist signups within 2 weeks of going live.

**Tracking:**
- Google Form: Response count visible in Responses tab
- Formspree: Email notifications + dashboard count
- Apps Script: Row count in Google Sheet

---

## Privacy & Compliance Notes

- No email data stored on FinFlow servers (all three options keep data with user or on free tier)
- All forms are HTTPS (Google, Formspree, and Apps Script deployments use HTTPS by default)
- Landing page has privacy note: "100% Privacy • No email sharing • Unsubscribe anytime"
- Unsubscribe: Users can email or manually remove their row from the Sheet (Option C)

---

## References

- Landing page: `marketing/landing/index.html` (served at `/lp` — see routing section above)
- Routing config: `vercel.json` (repo root)
- Ticket: FF-MKT-1 (TEAM_BOARD.md)
- Gates: design-expert, a11y-audit, seo-specialist, cost-validator — all CLEAR; waitlist wiring is
  DONE; owner's one remaining action is a live end-to-end test (see Deployment Checklist above)
