import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import type { Invoice, BusinessType, InvoiceItem } from '../context/FinanceContext';

interface ShareInvoiceParams {
  invoice: Invoice;
  clientPhone?: string;
  /**
   * @deprecated kept for back-compat. F-1 removed the public Drive link from the
   * WhatsApp flow — the actual PDF is shared instead — so this is no longer embedded
   * in the message. Still accepted so callers don't have to change.
   */
  driveUrl?: string;
  businessName: string;
  businessType: BusinessType;
  /** The rendered invoice PDF. Required to share the document as a real attachment. */
  pdfBlob?: Blob;
}

function formatDateIL(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatILS(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function docTypeLabel(type: BusinessType): string {
  return type === 'EsekPatur' ? 'קבלה' : 'חשבונית מס';
}

function buildItemsList(items: InvoiceItem[]): string {
  return items
    .map(item => {
      const lineTotal = item.quantity * item.unitPrice;
      const qty = item.quantity > 1 ? ` × ${item.quantity}` : '';
      return `    • ${item.description}${qty} — ${formatILS(lineTotal)}`;
    })
    .join('\n');
}

function buildWhatsAppMessage(params: ShareInvoiceParams): string {
  const { invoice, businessName, businessType } = params;
  const docType = docTypeLabel(businessType);
  const itemsList = buildItemsList(invoice.items);
  const subtotal = invoice.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const hasVat = invoice.taxRate > 0;

  const lines = [
    `שלום ${invoice.clientName},`,
    ``,
    `מצורפת *${docType}* מ*${businessName}*.`,
    ``,
    `*מספר מסמך:* ${invoice.id}`,
    `*תאריך הפקה:* ${formatDateIL(invoice.date)}`,
    ``,
    `*פירוט:*`,
    itemsList,
  ];

  if (hasVat) {
    lines.push(``, `    סה״כ לפני מע״מ: ${formatILS(subtotal)}`);
    lines.push(`    מע״מ (${invoice.taxRate}%): ${formatILS(subtotal * invoice.taxRate / 100)}`);
  }

  lines.push(
    ``,
    `*סה״כ לתשלום: ${formatILS(invoice.total)}*`,
    ``,
    `תודה רבה על שיתוף הפעולה!`,
    `_${businessName}_`,
  );

  return lines.join('\n');
}

/** Converts a Blob to a base64 string (no data: prefix) for Capacitor Filesystem. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function normalizeIsraeliPhone(clientPhone: string): string {
  const digits = clientPhone.replace(/\D/g, '');
  return digits.startsWith('972')
    ? digits
    : digits.startsWith('0')
      ? `972${digits.slice(1)}`
      : `972${digits}`;
}

/**
 * F-1 — Shares the invoice as a real PDF file instead of a public Drive link, so
 * removing world-read permission doesn't break WhatsApp delivery.
 *
 * Behaviour by platform:
 * - Native (Capacitor iOS/Android): writes the PDF into the app's cache directory and
 *   opens the OS share sheet (`@capacitor/share`) with the file attached and the
 *   message pre-filled. The user picks WhatsApp (or any app); WhatsApp receives the
 *   actual PDF — no Drive link, no unauthenticated exposure.
 * - Web with the Web Share API + file support (Android Chrome PWA): same native-style
 *   share sheet via `navigator.share({ files })`.
 * - Web without file-share support (most desktop browsers): opens the `wa.me` deep
 *   link with the message text and downloads the PDF locally so the user can attach it
 *   manually. No public link is ever generated.
 */
export async function shareInvoice(params: ShareInvoiceParams): Promise<void> {
  const { clientPhone, pdfBlob, invoice } = params;
  const message = buildWhatsAppMessage(params);
  const filename = `invoice_${invoice.id}.pdf`;

  // 1. Native: write the PDF to cache and open the OS share sheet with the file.
  if (Capacitor.isNativePlatform() && pdfBlob) {
    const base64 = await blobToBase64(pdfBlob);
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: filename,
      text: message,
      url: written.uri,
      dialogTitle: filename,
    });
    return;
  }

  // 2. Web with file-capable Web Share API (e.g. Android Chrome).
  if (pdfBlob && typeof navigator !== 'undefined' && 'canShare' in navigator) {
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: message, title: filename });
      return;
    }
  }

  // 3. Web fallback: open WhatsApp with the text and download the PDF to attach.
  if (pdfBlob) {
    const objectUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }

  if (clientPhone) {
    const phone = normalizeIsraeliPhone(clientPhone);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
