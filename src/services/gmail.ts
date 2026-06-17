import type { InvoiceItem } from '../context/FinanceContext';
import { computeTotals } from '../utils/invoiceMath';

export interface SendInvoiceEmailParams {
  to: string;
  invoiceId: string;
  items: InvoiceItem[];
  taxRate: number;
  total: string;
  dueDate: string;
  date: string;
  pdfBlob: Blob;
  businessName: string;
  accessToken: string;
}

/**
 * F-2 — Single-address email validation used at the send boundary. Rejects anything
 * with CR/LF/control characters (header-injection vector) and anything that isn't a
 * single, well-formed address. Deliberately conservative: one local@domain, no commas,
 * no display names, no whitespace. This is the trust gate before the recipient is
 * placed into a raw RFC-2822 `To:` header.
 */
export function isValidEmailAddress(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  // No control chars (incl. CR/LF) anywhere.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return false;
  // Exactly one address: no commas/semicolons/whitespace separating multiples.
  if (/[,;\s]/.test(trimmed)) return false;
  // Single local@domain with a dotted TLD; no quotes/angle brackets/display name.
  return /^[^@<>"'()[\]\\,;:\s]+@[^@<>"'()[\]\\,;:\s]+\.[^@<>"'()[\]\\,;:\s]+$/.test(trimmed);
}

/**
 * F-2 — Defense-in-depth: strip CR/LF (and other control chars) from any value placed
 * into a single MIME header line, so a tampered value can never start a new header
 * (e.g. inject `Bcc:`). Applied to every interpolated header value in buildMimeMessage.
 */
function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\x00-\x1f\x7f]/g, '');
}

/**
 * F-4 — HTML-escapes a dynamic value before it is interpolated into the hand-built
 * `text/html` email body. The in-app/PDF path is safe (React escapes JSX); this is the
 * only place untrusted strings reach raw HTML, so every dynamic value must pass through
 * here to prevent markup/link injection into recipients' inboxes.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Encodes a header value that may contain non-ASCII (e.g. Hebrew) using RFC 2047 encoded-word. */
function mimeEncodeHeader(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  return `=?UTF-8?B?${uint8ToBase64(bytes)}?=`;
}

function formatILS(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function buildMimeMessage(params: {
  to: string;
  subject: string;
  htmlBody: string;
  pdfBlob: Blob;
  invoiceId: string;
}): Promise<string> {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const filename = `invoice_${params.invoiceId}.pdf`;
  const encodedSubject = mimeEncodeHeader(params.subject);

  const pdfBytes = new Uint8Array(await params.pdfBlob.arrayBuffer());
  const base64Pdf = uint8ToBase64(pdfBytes);

  const mime = [
    `MIME-Version: 1.0`,
    `To: ${sanitizeHeaderValue(params.to)}`,
    `Subject: ${encodedSubject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    params.htmlBody,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Pdf,
    ``,
    `--${boundary}--`,
  ].join('\r\n');

  const encoder = new TextEncoder();
  const mimeBytes = encoder.encode(mime);
  return uint8ToBase64(mimeBytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function buildHtmlBody(params: SendInvoiceEmailParams): string {
  const { subtotal, taxAmount } = computeTotals(params.items, params.taxRate);

  const itemRows = params.items.map(item => {
    const lineTotal = item.quantity * item.unitPrice;
    return `
      <tr>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;">${escapeHtml(item.description)}</td>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;">${formatILS(item.unitPrice)}</td>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;">${formatILS(lineTotal)}</td>
      </tr>`;
  }).join('');

  const taxRow = params.taxRate > 0 ? `
      <tr>
        <td colspan="3" style="padding:8px 14px;border:1px solid #e2e8f0;text-align:right;color:#64748b;">VAT (${params.taxRate}%)</td>
        <td style="padding:8px 14px;border:1px solid #e2e8f0;text-align:right;color:#64748b;">${formatILS(taxAmount)}</td>
      </tr>` : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1e293b;">
      <div style="background:#2563eb;padding:24px 28px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;color:#fff;font-size:20px;">${escapeHtml(params.businessName)}</h2>
        <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Invoice ${escapeHtml(params.invoiceId)}</p>
      </div>

      <div style="background:#fff;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;">
        <table style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="color:#64748b;font-size:13px;">Issue Date</td>
            <td style="color:#64748b;font-size:13px;">Due Date</td>
          </tr>
          <tr>
            <td style="font-weight:600;font-size:15px;">${escapeHtml(params.date)}</td>
            <td style="font-weight:600;font-size:15px;">${escapeHtml(params.dueDate)}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;">Description</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:center;font-size:12px;text-transform:uppercase;color:#64748b;">Qty</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;">Unit Price</th>
              <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td colspan="3" style="padding:8px 14px;border:1px solid #e2e8f0;text-align:right;color:#64748b;">Subtotal</td>
            <td style="padding:8px 14px;border:1px solid #e2e8f0;text-align:right;color:#64748b;">${formatILS(subtotal)}</td>
          </tr>
          ${taxRow}
          <tr style="background:#eff6ff;">
            <td colspan="3" style="padding:12px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:700;font-size:16px;">Total</td>
            <td style="padding:12px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:700;font-size:18px;color:#2563eb;">${escapeHtml(params.total)}</td>
          </tr>
        </table>

        <p style="margin-top:24px;color:#64748b;font-size:13px;">
          The invoice PDF is attached to this email.
        </p>
      </div>

      <div style="padding:16px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">Sent via FinFlow &mdash; your business financial tool.</p>
      </div>
    </div>
  `;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
  // F-2 — hard gate at the service boundary: never build a MIME message for a
  // recipient that isn't a single, well-formed, CR/LF-free address. This backstops
  // the UI-level validation in SendInvoiceModal even if the call path changes.
  if (!isValidEmailAddress(params.to)) {
    throw new Error('INVALID_RECIPIENT');
  }

  const subject = `Invoice ${params.invoiceId} from ${params.businessName}`;
  const htmlBody = buildHtmlBody(params);

  const raw = await buildMimeMessage({
    to: params.to,
    subject,
    htmlBody,
    pdfBlob: params.pdfBlob,
    invoiceId: params.invoiceId,
  });

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (response.status === 403) {
    throw new Error('SCOPE_DENIED');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gmail API Error: ${err.error?.message || response.status}`);
  }
}
