import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, MessageCircle, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useFinance, type Invoice } from '../context/FinanceContext';
import { authService } from '../services/auth';
import { generateInvoicePDFBlob, waitForTemplateReady } from '../services/pdf/invoice-service';
import { uploadInvoicePDF } from '../services/googleDrive';
import { sendInvoiceEmail, isValidEmailAddress } from '../services/gmail';
import { shareInvoice } from '../services/share';
import { InvoiceTemplate } from '../services/pdf/InvoiceTemplate';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useCurrencyFormatter } from '../utils/format';
import { resolveCopyType } from '../utils/invoiceMath';

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

type Step = 'idle' | 'generating' | 'uploading' | 'sending' | 'done' | 'error';

const TEMPLATE_ID = 'send-invoice-template-portal';

export function SendInvoiceModal({ invoice, onClose }: Props) {
  const { t } = useTranslation();
  const { clients, businessSettings, activeBusiness, updateInvoice } = useFinance();

  const client = clients.find(c => c.id === invoice.clientId);
  const [email, setEmail] = useState(client?.email || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // Capture the original/copy designation once, when the modal opens, before any
  // send stamps pdfUrl/sentAt — so the rendered template stays stable mid-send.
  const [copyType] = useState(() => resolveCopyType(invoice));

  const formatCurrency = useCurrencyFormatter();

  useEffect(() => {
    if (client) {
      setEmail(client.email || '');
      setPhone(client.phone || '');
    }
  }, [client?.id]);

  const stepLabel = () => {
    if (step === 'generating') return t('invoices.generating_pdf');
    if (step === 'uploading') return t('invoices.uploading_pdf');
    if (step === 'sending') return t('invoices.sending');
    return '';
  };

  // Renders the invoice PDF and ensures it's archived to the owner's Drive. The upload
  // is NOT for sharing (F-1 removed the public link from both the email and WhatsApp
  // paths — the actual PDF bytes are attached/shared directly). It exists so the invoice
  // gets a persisted `pdfUrl`, which `resolveCopyType` reads as the "already issued"
  // signal to stamp originals vs copies. Returns only the PDF blob the senders need.
  async function preparePdf(): Promise<Blob> {
    setStep('generating');
    await waitForTemplateReady();

    const pdfBlob = await generateInvoicePDFBlob(TEMPLATE_ID);
    if (!pdfBlob) throw new Error('PDF generation failed');

    // Already archived once — skip the re-upload but keep the existing pdfUrl signal.
    if (invoice.pdfUrl) {
      return pdfBlob;
    }

    setStep('uploading');
    const token = await authService.getValidAccessToken();
    const folderId = activeBusiness?.id;
    if (!folderId) throw new Error('No active business folder');

    const driveUrl = await uploadInvoicePDF(token, invoice.id, pdfBlob, folderId);
    updateInvoice(invoice.id, { pdfUrl: driveUrl });
    return pdfBlob;
  }

  async function handleSendEmail() {
    const recipient = email.trim();
    // F-2 — validate the recipient at the input boundary before doing any work:
    // a single, well-formed, CR/LF-free address. Blocks email-header injection
    // (e.g. a newline that would smuggle a Bcc: to exfiltrate the PDF).
    if (!isValidEmailAddress(recipient)) {
      setErrorMsg(t('invoices.invalid_email'));
      setStep('error');
      return;
    }
    setErrorMsg('');
    try {
      const pdfBlob = await preparePdf();
      setStep('sending');
      const token = await authService.getValidAccessToken();
      await sendInvoiceEmail({
        to: recipient,
        invoiceId: invoice.id,
        items: invoice.items,
        taxRate: invoice.taxRate,
        total: formatCurrency(invoice.total),
        date: invoice.date,
        dueDate: invoice.dueDate,
        pdfBlob,
        businessName: businessSettings.name,
        accessToken: token,
      });
      updateInvoice(invoice.id, { sentAt: new Date().toISOString() });
      setStep('done');
    } catch (err: any) {
      if (err.message === 'SCOPE_DENIED') {
        setErrorMsg(t('invoices.scope_error'));
      } else if (err.message === 'INVALID_RECIPIENT') {
        setErrorMsg(t('invoices.invalid_email'));
      } else {
        setErrorMsg(err.message || t('invoices.send_error'));
      }
      setStep('error');
    }
  }

  async function handleShareWhatsApp() {
    setErrorMsg('');
    try {
      const pdfBlob = await preparePdf();
      setStep('sending');
      await shareInvoice({
        invoice,
        clientPhone: phone,
        pdfBlob,
        businessName: businessSettings.name,
        businessType: businessSettings.type,
      });
      updateInvoice(invoice.id, { sentAt: new Date().toISOString() });
      setStep('done');
    } catch (err: any) {
      setErrorMsg(err.message || t('invoices.send_error'));
      setStep('error');
    }
  }

  const isBusy = step === 'generating' || step === 'uploading' || step === 'sending';

  return (
    <Modal isOpen title={t('invoices.send_invoice')} onClose={onClose}>
      {/* Hidden template for PDF capture — always rendered while modal is open */}
      <div style={{ position: 'absolute', left: '-10000px', top: '-10000px', zIndex: -1 }}>
        <div id={TEMPLATE_ID}>
          <InvoiceTemplate invoice={invoice} business={businessSettings} copyType={copyType} />
        </div>
      </div>

      {step === 'done' ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="bg-green-100 p-4 rounded-full">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">{t('invoices.send_success')}</p>
            <p className="text-sm text-slate-500 mt-1">{invoice.id} → {email || phone}</p>
          </div>
          <Button className="w-full h-12" onClick={onClose}>{t('common.close')}</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Invoice summary chip */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{invoice.clientName}</p>
              <p className="text-xl font-black text-primary mt-0.5">{formatCurrency(invoice.total)}</p>
            </div>
            <p className="text-sm font-mono text-slate-400">{invoice.id}</p>
          </div>

          {/* Email field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('invoices.recipient_email')}
            </label>
            <Input
              type="email"
              placeholder="client@example.com"
              className="h-12"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Phone field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t('invoices.recipient_phone')}
            </label>
            <Input
              type="tel"
              placeholder="+972501234567"
              className="h-12"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Error message */}
          {step === 'error' && errorMsg && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Loading label */}
          {isBusy && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{stepLabel()}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3 pt-1">
            <Button
              className="h-12 font-bold gap-2"
              onClick={handleSendEmail}
              disabled={isBusy || !email.trim()}
            >
              <Mail className="h-4 w-4" />
              {t('invoices.send_via_email')}
            </Button>
            <Button
              variant="outline"
              className="h-12 font-bold gap-2 border-green-500 text-green-700 hover:bg-green-50"
              onClick={handleShareWhatsApp}
              disabled={isBusy}
            >
              <MessageCircle className="h-4 w-4" />
              {t('invoices.send_via_whatsapp')}
            </Button>
          </div>

          <p className="text-[11px] text-center text-slate-400">{t('invoices.send_invoice_subtitle')}</p>
        </div>
      )}
    </Modal>
  );
}
