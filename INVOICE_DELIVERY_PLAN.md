# Invoice Delivery Feature — Implementation Plan

## Overview

Send invoice PDFs directly to customers via Email (Gmail API) or WhatsApp/native share sheet.
Constraints: no backend server, Google Drive as the sole database, existing Google OAuth.

---

## Codebase Context

- Auth: `@capgo/capacitor-social-login` v8.3.22, `@capacitor/android` v8.3.4
- Scopes already added via `scopes` array in `src/services/auth.ts:60–65` (same pattern used for `drive.file`)
- Access token returned from login is a standard Google OAuth2 Bearer token — works with any Google API
- iOS not set up yet — Android + Web only for now
- PDF generation: `jsPDF` + `html2canvas` in `src/services/pdf/invoice-service.ts`

---

## Capacitor Compatibility Notes

### Scopes
Adding `gmail.send` follows the exact same pattern already used for `drive.file`. No native file changes required.

### Android
| Question | Answer |
|---|---|
| `AndroidManifest.xml` changes? | No — `INTERNET` already declared |
| `google-services.json` changes? | No — Gmail is not a Firebase service |
| `capacitor.config.ts` changes? | No — SocialLogin already configured |
| SHA-1 fingerprint changes? | No — tied to app signature, not scopes |
| New consent screen for users? | Yes, once — on next login after scope is added |
| GIS Credential Manager supports `gmail.send`? | Yes at login time; incremental auth after login is not supported by the plugin |

### iOS (future)
When iOS is added it will need:
1. Separate iOS OAuth client in Google Cloud Console
2. `iOSClientId` in `SocialLogin.initialize()` in `auth.ts`
3. Reverse client ID as URL scheme in `Info.plist` (Xcode)
4. Gmail API enabled for the iOS client in Cloud Console

### Web Share API
`navigator.share({ files: [...] })` works on Android via Capacitor — opens native OS share sheet with PDF as a real file attachment. Graceful fallback on desktop.

---

## Prerequisites (One-Time, Outside Code)

1. Google Cloud Console → APIs & Services → Library → **enable Gmail API**
2. OAuth consent screen → Scopes → **add `https://www.googleapis.com/auth/gmail.send`**
3. No new OAuth client needed — existing web client covers both Drive and Gmail

---

## Phase 1 — Auth Scope Update

**File:** `src/services/auth.ts`

### Changes
- Add `https://www.googleapis.com/auth/gmail.send` to the `scopes` array in `loginWithGoogle()` (line 60–65)
- Add a `getValidAccessToken()` helper:
  1. Call `SocialLogin.isAccessTokenExpired()`
  2. If expired → call `SocialLogin.refresh({ provider: 'google' })`
  3. Return the fresh token string

```typescript
// scopes array in loginWithGoogle()
scopes: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',  // ADD THIS
]
```

**Native file changes:** None  
**User impact:** One-time Google consent screen on next login

---

## Phase 2 — PDF Upload to Google Drive

**File:** `src/services/googleDrive.ts`

### Changes
- Add `Invoices/` subfolder to the Drive folder structure alongside `Business App Receipts/`
- Add `uploadInvoicePDF(invoiceId: string, pdfBlob: Blob): Promise<string>`:
  - Mirrors `uploadReceiptToDrive()` pattern already in the file
  - Calls existing `setPublicPermission()` on the uploaded file
  - Returns the shareable Drive URL (`https://drive.google.com/file/d/{fileId}/view`)
- Cache the URL: skip re-upload if `invoice.pdfUrl` already exists

**Invoice type additions** (wherever Invoice interface is defined):
```typescript
pdfUrl?: string;   // shareable Drive link to the PDF
sentAt?: string;   // ISO timestamp of last send
```

**Why this phase first:** The Drive URL enables the WhatsApp fallback link and email body, and serves as a save-point before delivery.

---

## Phase 3 — Gmail Service

**New file:** `src/services/gmail.ts`

### What It Does
1. Calls `getValidAccessToken()` from auth.ts (refreshes if needed)
2. Builds a MIME email (RFC 2822): HTML body + PDF as base64url attachment
3. `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
   with `Authorization: Bearer {token}`
4. On `401 Unauthorized`: calls `SocialLogin.refresh()` once and retries
5. On `403 Forbidden`: surfaces user-friendly prompt to re-login (scope not granted)

### MIME Structure
```
Content-Type: multipart/mixed
├── text/html  →  invoice details + Drive link
└── application/pdf  →  base64url-encoded PDF blob
```

### Public API
```typescript
sendInvoiceEmail(params: {
  to: string;           // recipient email
  invoiceId: string;
  invoiceNumber: string;
  total: string;
  dueDate: string;
  pdfBlob: Blob;
  driveUrl: string;
}): Promise<void>
```

**Why Gmail API over EmailJS:** User is already authenticated with Google — no third-party account, no API key to store, no relay service limits. Email comes from the user's own Gmail address.

---

## Phase 4 — Share Service (WhatsApp)

**New file:** `src/services/share.ts`

### Logic
```
if navigator.canShare({ files: [pdfFile] })
  → navigator.share({ files: [pdfFile], title, text })
    // Native OS share sheet — PDF as real attachment (works on Android via Capacitor)
    // User picks WhatsApp, Telegram, or any app from the sheet

else if client.phone exists
  → open https://wa.me/{phone}?text=...{driveUrl}
    // WhatsApp Web pre-filled with invoice details + Drive link

else
  → copy Drive URL to clipboard + show toast
```

### Public API
```typescript
shareInvoice(params: {
  invoice: Invoice;
  clientPhone?: string;
  driveUrl: string;
  pdfBlob: Blob;
}): Promise<void>
```

---

## Phase 5 — UI: Send Invoice Modal

**New file:** `src/components/SendInvoiceModal.tsx`  
**Edit:** `src/pages/Invoices.tsx` — wire up the currently non-functional "Send" button

### UX Flow
1. User taps "Send" on an invoice → `SendInvoiceModal` opens
2. Modal shows:
   - Client name (read-only)
   - Email field (pre-filled from `clients` store, editable)
   - Phone field (pre-filled from `clients` store, editable)
   - Two action buttons: **Send via Email** and **Send via WhatsApp**
3. On action:
   - Generate PDF blob (or reuse if `pdfUrl` exists)
   - Upload to Drive (Phase 2) → get `driveUrl`
   - Call Gmail service (Phase 3) or Share service (Phase 4)
4. On success:
   - Invoice status → `"Sent"`
   - `invoice.sentAt` → current ISO timestamp
   - Save to Google Drive via `saveAppState()`
   - Modal closes with success toast
5. On error:
   - Show specific error (network, scope denied, etc.)
   - Invoice status unchanged

### i18n
Add send-flow strings to both `en` and `he` translation files.

---

## File Change Summary

| File | Change | Notes |
|---|---|---|
| `src/services/auth.ts` | Edit | Add `gmail.send` scope + `getValidAccessToken()` |
| `src/services/googleDrive.ts` | Edit | Add `Invoices/` folder + `uploadInvoicePDF()` |
| `src/services/gmail.ts` | **New** | Gmail API send with MIME + PDF attachment |
| `src/services/share.ts` | **New** | Web Share API + WhatsApp `wa.me` fallback |
| `src/components/SendInvoiceModal.tsx` | **New** | Send flow UI |
| `src/pages/Invoices.tsx` | Edit | Wire up Send button to modal |
| Invoice type definition | Edit | Add `pdfUrl?`, `sentAt?` fields |
| `src/locales/en.json` | Edit | Add send-flow strings |
| `src/locales/he.json` | Edit | Add send-flow strings (Hebrew) |
| `AndroidManifest.xml` | **None** | INTERNET already present |
| `capacitor.config.ts` | **None** | SocialLogin already configured |
| `google-services.json` | **None** | Not a Firebase service |

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Android user denies Gmail consent on re-login | Medium | Fallback: show Drive link to copy-paste manually |
| Access token expired mid-send | Medium | `getValidAccessToken()` refresh helper |
| Gmail blocked by Google Workspace admin | Low | Clear error: "Your Google account admin has restricted Gmail access" |
| Web Share API unavailable on desktop | High | `wa.me` link always shown as fallback on desktop |
| PDF too large for Gmail (25MB limit) | Very low | jsPDF invoices are typically 100–500KB |
| `gmail.send` scope not granted (user skipped consent) | Medium | Detect 403, prompt re-login with explanation |

---

## Recommended Rollout Order

1. **Phase 2** — Drive PDF upload (safe, self-contained, no new auth scope)
2. **Phase 4** — WhatsApp / Share service (pure frontend, no new auth, high mobile value)
3. **Phase 1** — Add `gmail.send` scope (triggers re-consent for users, do this before Phase 3)
4. **Phase 3** — Gmail service (depends on Phase 1 scope being granted)
5. **Phase 5** — UI modal (integrates all phases, build last)
