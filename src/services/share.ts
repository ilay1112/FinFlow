import type { Invoice, BusinessType, InvoiceItem } from '../context/FinanceContext';

interface ShareInvoiceParams {
  invoice: Invoice;
  clientPhone?: string;
  driveUrl: string;
  businessName: string;
  businessType: BusinessType;
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
  const { invoice, driveUrl, businessName, businessType } = params;
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
    `לצפייה ב-PDF:`,
    driveUrl,
    ``,
    `תודה רבה על שיתוף הפעולה!`,
    `_${businessName}_`,
  );

  return lines.join('\n');
}

export async function shareInvoice(params: ShareInvoiceParams): Promise<void> {
  const { clientPhone, driveUrl } = params;

  const message = buildWhatsAppMessage(params);

  if (clientPhone) {
    const phone = clientPhone.replace(/\D/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    return;
  }

  // No phone — copy Drive URL to clipboard as fallback
  await navigator.clipboard.writeText(driveUrl);
}
