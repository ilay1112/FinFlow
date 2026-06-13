import type { Invoice } from '../context/FinanceContext';

interface ShareInvoiceParams {
  invoice: Invoice;
  clientPhone?: string;
  driveUrl: string;
  pdfBlob: Blob;
}

export async function shareInvoice(params: ShareInvoiceParams): Promise<void> {
  const { invoice, clientPhone, driveUrl, pdfBlob } = params;
  const filename = `invoice_${invoice.id}.pdf`;
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

  // Native OS share sheet — opens WhatsApp, Telegram, etc. with the PDF as a real attachment
  if (navigator.canShare?.({ files: [pdfFile] })) {
    await navigator.share({
      files: [pdfFile],
      title: `Invoice ${invoice.id}`,
      text: `Invoice ${invoice.id} — Total: ₪${invoice.total.toLocaleString()}`,
    });
    return;
  }

  // WhatsApp Web fallback with Drive link
  if (clientPhone) {
    const phone = clientPhone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Invoice ${invoice.id} — Total: ₪${invoice.total.toLocaleString()}\nView PDF: ${driveUrl}`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    return;
  }

  // Last resort: copy Drive URL to clipboard
  await navigator.clipboard.writeText(driveUrl);
}
