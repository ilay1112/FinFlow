import React from 'react';
import { useTranslation } from 'react-i18next';
import { type Invoice, type BusinessSettings } from '../../context/FinanceContext';
import { computeTotals, DOCUMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS, recordsPayment, paymentLinesOf } from '../../utils/invoiceMath';
import { useCurrencyFormatter } from '../../utils/format';

interface InvoiceTemplateProps {
  invoice: Invoice;
  business: BusinessSettings;
  /**
   * Legal copy designation (מקור / העתק). Israeli tax invoices must be marked as
   * an original or a copy. Defaults to the original.
   */
  copyType?: 'original' | 'copy';
}

// Helper to force LTR direction for numbers/IDs in RTL context
const Ltr = ({ children }: { children: React.ReactNode }) => (
  <span dir="ltr" className="inline-block">{children}</span>
);

/**
 * High-fidelity HTML template for the invoice.
 * We use explicit dir="ltr" and inline-block on numbers to ensure 
 * html2canvas captures them in the correct order, even in Hebrew RTL mode.
 */
export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({ invoice, business, copyType = 'original' }) => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'he';

  const { subtotal, taxAmount } = computeTotals(invoice.items, invoice.taxRate);

  const formatCurrency = useCurrencyFormatter();

  // Payment block: only documents that record receipt of payment (Receipt /
  // TaxInvoiceReceipt) show how the money was tendered. Lines are resolved lazily —
  // a legacy single `paymentMethod` maps to one full-total line (paymentLinesOf).
  const paymentLines = recordsPayment(invoice.documentType) ? paymentLinesOf(invoice) : [];

  return (
    <div 
      id="invoice-template"
      className="p-16 bg-white w-[210mm] min-h-[297mm] text-slate-900 font-sans relative"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ fontFamily: 'Heebo, sans-serif' }}
    >
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 uppercase tracking-tight">
          {invoice.documentType
            ? t(DOCUMENT_TYPE_LABELS[invoice.documentType])
            : business.type === 'EsekPatur' ? t('invoices.receipt_title')
            : t('invoices.tax_invoice_title')}
        </h1>
        {/* מקור / העתק — mandatory original/copy designation on a tax invoice. */}
        <p className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-500">
          {copyType === 'copy' ? t('invoices.copy_label') : t('invoices.original_label')}
        </p>
      </div>

      {/* Info Sections */}
      <div className="grid grid-cols-2 gap-8 mb-12">
        {/* Business Info */}
        <div className="text-start">
          <h2 className="text-xl font-bold mb-2 text-slate-900">{business.name}</h2>
          <p className="text-sm text-slate-600">
            {t('profile.id_number')}: <Ltr>{business.idNumber}</Ltr>
          </p>
          <p className="text-sm text-slate-600">{business.address}</p>
          <p className="text-sm text-slate-600">
            {business.email} | <Ltr>{business.phone}</Ltr>
          </p>
        </div>

        {/* Invoice Metadata */}
        <div className="text-end">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900">
              {t('invoices.invoice_id')}: <Ltr>{invoice.id}</Ltr>
            </p>
            <p className="text-sm font-bold text-slate-900">
              {t('common.date')}: <Ltr>{invoice.date}</Ltr>
            </p>
            <p className="text-sm font-bold text-slate-900">
              {t('invoices.due_date')}: <Ltr>{invoice.dueDate}</Ltr>
            </p>
            {paymentLines.length > 0 ? (
              // Payment-recording document: one row per tendered method. A single
              // line naturally reads like the old single-method display.
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">{t('invoices.payments')}:</p>
                {paymentLines.map(line => (
                  <p key={line.id} className="text-sm font-bold text-slate-900">
                    {t(PAYMENT_METHOD_LABELS[line.method])} — <Ltr>{formatCurrency(line.amount)}</Ltr>
                  </p>
                ))}
              </div>
            ) : (
              // Back-compat: a non-payment document that still carries a legacy
              // single paymentMethod renders the old single line exactly as before.
              invoice.paymentMethod && (
                <p className="text-sm font-bold text-slate-900">
                  {t('invoices.payment_method')}: {t(PAYMENT_METHOD_LABELS[invoice.paymentMethod])}
                </p>
              )
            )}
            {invoice.allocationNumber && (
              <p className="text-sm font-bold text-slate-900">
                {t('invoices.allocation_number')}: <Ltr>{invoice.allocationNumber}</Ltr>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Client Info */}
      <div className="mb-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
        <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">{t('invoices.client')}</p>
        <p className="text-xl font-bold text-slate-900">{invoice.clientName}</p>
        {invoice.clientIdNumber && (
          <p className="text-sm text-slate-600 mt-1">
            {t('profile.id_number')}: <Ltr>{invoice.clientIdNumber}</Ltr>
          </p>
        )}
      </div>

      {/* Table */}
      <div className="mb-12 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-indigo-600 text-white text-xs uppercase">
              <th className="p-4 text-start font-bold tracking-wider">{t('invoices.item_description')}</th>
              <th className="p-4 text-center w-24 font-bold tracking-wider">{t('invoices.qty')}</th>
              <th className="p-4 text-end w-32 font-bold tracking-wider">{t('invoices.price')}</th>
              <th className="p-4 text-end w-32 font-bold tracking-wider">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {invoice.items.map((item, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                <td className="p-4 font-medium text-slate-700">{item.description}</td>
                <td className="p-4 text-center text-slate-600 font-mono">
                  <Ltr>{item.quantity}</Ltr>
                </td>
                <td className="p-4 text-end text-slate-600 font-mono whitespace-nowrap">
                  <Ltr>{formatCurrency(item.unitPrice)}</Ltr>
                </td>
                <td className="p-4 text-end font-bold text-slate-900 font-mono whitespace-nowrap">
                  <Ltr>{formatCurrency(item.quantity * item.unitPrice)}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex flex-col items-end gap-3">
        <div className="w-full max-w-xs space-y-3">
          {business.type !== 'EsekPatur' && (
            <>
              <div className="flex justify-between text-sm text-slate-500 font-medium">
                <span>{t('invoices.subtotal')}</span>
                <Ltr>{formatCurrency(subtotal)}</Ltr>
              </div>
              <div className="flex justify-between text-sm text-slate-500 font-medium">
                <span>{t('invoices.tax')} (<Ltr>{invoice.taxRate}</Ltr>%)</span>
                <Ltr>{formatCurrency(taxAmount)}</Ltr>
              </div>
            </>
          )}
          <div className="flex justify-between text-3xl font-black border-t-2 border-slate-900 pt-6 mt-2 text-slate-900">
            <span>{t('common.total')}</span>
            <Ltr>{formatCurrency(invoice.total)}</Ltr>
          </div>
        </div>
      </div>

      {/* Notes — optional free text from the issuer. Preserves the user's line breaks. */}
      {invoice.notes && (
        <div className="mt-12 text-start">
          <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-1">{t('invoices.notes')}</p>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-16 left-16 right-16 text-center border-t pt-8">
        {business.type === 'EsekPatur' && (
          <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-lg mx-auto">
            {t('profile.type_help')}
          </p>
        )}
      </div>
    </div>
  );
};
