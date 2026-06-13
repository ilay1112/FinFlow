import type { Invoice } from '../context/FinanceContext';

interface ShareInvoiceParams {
  invoice: Invoice;
  clientPhone?: string;
  driveUrl: string;
  pdfBlob?: Blob;
}

export async function shareInvoice(params: ShareInvoiceParams): Promise<void> {
  const { invoice, clientPhone, driveUrl } = params;

  // navigator.share({ files }) requires the call to happen synchronously inside
  // a user-gesture handler — it cannot survive the async PDF generation + Drive
  // upload that precedes this call. Go straight to the WhatsApp link instead.

  if (clientPhone) {
    const phone = clientPhone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Invoice ${invoice.id} — Total: ₪${invoice.total.toLocaleString()}\nView PDF: ${driveUrl}`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    return;
  }

  // No phone — copy Drive URL to clipboard as fallback
  await navigator.clipboard.writeText(driveUrl);
}
