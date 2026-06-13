import type { InvoiceItem } from '../context/FinanceContext';

export interface SendInvoiceEmailParams {
  to: string;
  invoiceId: string;
  items: InvoiceItem[];
  taxRate: number;
  total: string;
  dueDate: string;
  date: string;
  pdfBlob: Blob;
  driveUrl: string;
  businessName: string;
  accessToken: string;
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
    `To: ${params.to}`,
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
  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const taxAmount = subtotal * (params.taxRate / 100);

  const itemRows = params.items.map(item => {
    const lineTotal = item.quantity * item.unitPrice;
    return `
      <tr>
        <td style="padding:10px 14px;border:1px solid #e2e8f0;">${item.description}</td>
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
        <h2 style="margin:0;color:#fff;font-size:20px;">${params.businessName}</h2>
        <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Invoice ${params.invoiceId}</p>
      </div>

      <div style="background:#fff;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;">
        <table style="width:100%;margin-bottom:24px;">
          <tr>
            <td style="color:#64748b;font-size:13px;">Issue Date</td>
            <td style="color:#64748b;font-size:13px;">Due Date</td>
          </tr>
          <tr>
            <td style="font-weight:600;font-size:15px;">${params.date}</td>
            <td style="font-weight:600;font-size:15px;">${params.dueDate}</td>
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
            <td style="padding:12px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:700;font-size:18px;color:#2563eb;">${params.total}</td>
          </tr>
        </table>

        <p style="margin-top:24px;">
          <a href="${params.driveUrl}" style="color:#2563eb;font-weight:600;">View Invoice PDF online</a>
        </p>
      </div>

      <div style="padding:16px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="margin:0;color:#94a3b8;font-size:12px;">Sent via FinFlow &mdash; your business financial tool.</p>
      </div>
    </div>
  `;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<void> {
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
