import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus,
  Send,
  CheckCircle,
  Clock,
  Search,
  Trash2,
  Edit2,
  DollarSign,
  AlertTriangle,
  FileDown,
  Loader2,
  RotateCcw,
  Mail,
  Ban,
  ReceiptText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useFinance, type Invoice } from '../context/FinanceContext';
import { generateInvoicePDF, waitForTemplateReady } from '../services/pdf/invoice-service';
import { InvoiceTemplate } from '../services/pdf/InvoiceTemplate';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { AlertDialog } from '../components/ui/AlertDialog';
import { Input } from '../components/ui/Input';
import { SendInvoiceModal } from '../components/SendInvoiceModal';
import { RowActions } from '../components/ui/RowActions';
import { TablePagination } from '../components/ui/TablePagination';
import { useCurrencyFormatter } from '../utils/format';
import { resolveCopyType, isAccountingDocument } from '../utils/invoiceMath';

/** Clickable, sortable columns. The default ordering is newest-first by the hidden
 * createdAt timestamp (not a column) — column clicks switch to one of these. */
type SortKey = 'id' | 'clientName' | 'date' | 'total' | 'status';
type SortDirection = 'asc' | 'desc';
type SortState = { key: SortKey | 'createdAt'; direction: SortDirection };

const SortIcon = ({ column, sortConfig }: { column: SortKey; sortConfig: SortState }) => {
  if (sortConfig.key !== column) return <ArrowUpDown className="ms-2 h-4 w-4" />;
  return sortConfig.direction === 'asc' ? <ArrowUp className="ms-2 h-4 w-4" /> : <ArrowDown className="ms-2 h-4 w-4" />;
};

/** Timestamp used to order newest-first: the hidden createdAt, or the document date for
 * legacy rows that predate it. */
const invoiceTimestamp = (i: Invoice): number => {
  const t = i.createdAt ? Date.parse(i.createdAt) : NaN;
  return Number.isNaN(t) ? (Date.parse(i.date) || 0) : t;
};

export default function InvoicesView() {
  const { t } = useTranslation();
  const { invoices, updateInvoice, deleteInvoice, businessSettings } = useFinance();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isRefundAlertOpen, setIsRefundAlertOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [invoiceToRefund, setInvoiceToRefund] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Default sort: newest first via the hidden createdAt timestamp.
  const [sortConfig, setSortConfig] = useState<SortState>({ key: 'createdAt', direction: 'desc' });
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  // Handle URL actions (Quick Actions from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action === 'new') {
      navigate('/invoices/new', { replace: true });
    }
  }, [location.search]);

  // PDF Generation State
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfInvoice, setPdfInvoice] = useState<Invoice | null>(null);

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = inv.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         inv.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const invoiceDate = new Date(inv.date);
    const matchesStartDate = !startDate || invoiceDate >= new Date(startDate);
    const matchesEndDate = !endDate || invoiceDate <= new Date(endDate);

    return matchesSearch && matchesStartDate && matchesEndDate;
  });

  // Sort: the chosen column, then always tiebreak by the hidden createdAt timestamp so
  // same-date rows stay newest-first. The default key (createdAt) sorts purely by it.
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    let cmp: number;
    if (sortConfig.key === 'total') cmp = a.total - b.total;
    else if (sortConfig.key === 'createdAt') cmp = invoiceTimestamp(a) - invoiceTimestamp(b);
    else if (sortConfig.key === 'date') cmp = a.date.localeCompare(b.date);
    else if (sortConfig.key === 'id') cmp = a.id.localeCompare(b.id);
    else if (sortConfig.key === 'clientName') cmp = a.clientName.localeCompare(b.clientName);
    else cmp = a.status.localeCompare(b.status);
    if (cmp !== 0) return cmp * dir;
    return invoiceTimestamp(b) - invoiceTimestamp(a);
  });

  // Paginate the sorted result (default 20/page). Clamp the page so a shrunk filter set
  // never lands past the last page.
  const totalRows = sortedInvoices.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedInvoices = sortedInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // A חשבון עסקה (TransactionInvoice) is "settled" (נפרע) once a receipt has been
  // issued from it — i.e. some document links back to it via sourceInvoiceId. Derived
  // (not stored on the source) so an issued demand document is never mutated.
  const settledSourceIds = new Set(
    invoices.map(i => i.sourceInvoiceId).filter((id): id is string => !!id)
  );

  // FF-WEB-4 — a חשבון עסקה may only have ONE non-Cancelled document issued from it
  // (e.g. one קבלה). Cancelling that document frees the source up for a new one, so
  // this set (unlike settledSourceIds above, which is intentionally left as-is for the
  // נפרע/settled badge) excludes Cancelled documents. Used only to hide/disable the
  // "create receipt from this" row action.
  const activeReceiptSourceIds = new Set(
    invoices.filter(i => i.sourceInvoiceId && i.status !== 'Cancelled').map(i => i.sourceInvoiceId as string)
  );

  // Analytics — money KPIs count accounting documents only; a חשבון עסקה
  // (TransactionInvoice) is a demand/quote and never contributes to a money total
  // (it still appears as a row, and shows נפרע once a receipt is issued for it).
  const acct = (i: Invoice) => isAccountingDocument(i.documentType);
  const totalPaid = invoices.filter(i => i.status === 'Paid' && acct(i)).reduce((sum, i) => sum + i.total, 0);
  const totalOutstanding = invoices.filter(i => i.status === 'Sent' && acct(i)).reduce((sum, i) => sum + i.total, 0);
  const totalOverdue = invoices.filter(i => i.status === 'Overdue' && acct(i)).reduce((sum, i) => sum + i.total, 0);
  const totalRefunded = invoices.filter(i => i.status === 'Refunded' && acct(i)).reduce((sum, i) => sum + i.total, 0);

  const handleOpenDeleteAlert = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = () => {
    if (invoiceToDelete) {
      // deleteInvoice hard-deletes Drafts and cancels (retains) issued documents.
      deleteInvoice(invoiceToDelete.id);
      setInvoiceToDelete(null);
    }
  };

  // Issued (non-Draft) documents are cancelled, not deleted — 7-year retention (6a).
  const isIssuedDocument = invoiceToDelete ? invoiceToDelete.status !== 'Draft' : false;

  const handleOpenRefundAlert = (invoice: Invoice) => {
    setInvoiceToRefund(invoice);
    setIsRefundAlertOpen(true);
  };

  const confirmRefund = () => {
    if (invoiceToRefund) {
      updateInvoice(invoiceToRefund.id, { status: 'Refunded' });
      setInvoiceToRefund(null);
    }
  };

  const handleDownloadPDF = (invoice: Invoice) => {
    // Snapshot the invoice from current state so the copy/original designation
    // reflects whether it had already been issued before this click.
    setIsGeneratingPDF(true);
    setPdfInvoice(invoice);
  };

  // Capture the PDF only once the template has actually rendered into the portal —
  // deterministic, replacing the old fixed setTimeout race against React's commit.
  useEffect(() => {
    if (!pdfInvoice) return;
    let cancelled = false;
    (async () => {
      await waitForTemplateReady();
      if (cancelled) return;
      await generateInvoicePDF(pdfInvoice, businessSettings, 'invoice-template-portal');
      // Record the first issue so a later re-download is correctly marked as a copy.
      if (!pdfInvoice.firstIssuedAt) {
        updateInvoice(pdfInvoice.id, { firstIssuedAt: new Date().toISOString() });
      }
      if (!cancelled) {
        setIsGeneratingPDF(false);
        setPdfInvoice(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfInvoice, businessSettings]);

  const formatCurrency = useCurrencyFormatter();

  const getStatusBadge = (status: Invoice['status']) => {
    switch (status) {
      case 'Paid': return <Badge variant="success" className="gap-1"><CheckCircle className="h-3 w-3" /> {t('invoices.paid')}</Badge>;
      case 'Refunded': return <Badge variant="outline" className="gap-1 bg-slate-100 text-slate-600 border-slate-200"><RotateCcw className="h-3 w-3" /> {t('invoices.refunded')}</Badge>;
      case 'Cancelled': return <Badge variant="outline" className="gap-1 bg-slate-100 text-slate-500 border-slate-200"><Ban className="h-3 w-3" /> {t('invoices.cancelled')}</Badge>;
      case 'Sent': return <Badge variant="secondary" className="gap-1"><Send className="h-3 w-3" /> {t('invoices.sent')}</Badge>;
      case 'Overdue': return <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" /> {t('invoices.overdue')}</Badge>;
      default: return <Badge variant="outline">{t('invoices.draft')}</Badge>;
    }
  };

  return (
    <div className="space-y-6 px-1 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('invoices.title')}</h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">{t('invoices.subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/invoices/new')} className="w-full sm:w-auto h-11 md:h-10">
          <Plus className="h-5 w-5 md:h-4 md:w-4 me-2" /> {t('invoices.create_invoice')}
        </Button>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="border-s-4 border-s-green-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('invoices.paid_invoices')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="bg-green-100 p-2 rounded-full">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-amber-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('invoices.total_refunded')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalRefunded)}</p>
              </div>
              <div className="bg-amber-100 p-2 rounded-full">
                <RotateCcw className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-primary">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('invoices.outstanding')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalOutstanding)}</p>
              </div>
              <div className="bg-blue-100 p-2 rounded-full">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-red-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('invoices.overdue')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalOverdue)}</p>
              </div>
              <div className="bg-red-100 p-2 rounded-full">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b space-y-4 md:space-y-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-full md:max-w-sm">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder={t('common.search')} 
                className="ps-9 h-11 md:h-10" 
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              />
            </div>

            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 p-1 md:p-1.5 rounded-lg border text-[11px] md:text-xs w-full md:w-auto">
                <span className="text-slate-500 font-medium ps-2">{t('expenses.from')}:</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none focus:ring-0 text-slate-900 flex-1 md:flex-none"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                />
                <span className="text-slate-500 font-medium">{t('expenses.to')}:</span>
                <input
                  type="date"
                  className="bg-transparent border-none focus:ring-0 text-slate-900 flex-1 md:flex-none"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                />
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}
                  >
                    {t('common.clear')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('id')} className="ps-6 text-start whitespace-nowrap cursor-pointer hover:text-slate-900">
                    <div className="flex items-center">{t('invoices.invoice_id')} <SortIcon column="id" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('clientName')} className="text-start whitespace-nowrap cursor-pointer hover:text-slate-900">
                    <div className="flex items-center">{t('invoices.client')} <SortIcon column="clientName" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('date')} className="text-start whitespace-nowrap cursor-pointer hover:text-slate-900">
                    <div className="flex items-center">{t('common.date')} <SortIcon column="date" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('total')} className="text-start whitespace-nowrap cursor-pointer hover:text-slate-900">
                    <div className="flex items-center">{t('common.amount')} <SortIcon column="total" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('status')} className="text-start whitespace-nowrap cursor-pointer hover:text-slate-900">
                    <div className="flex items-center">{t('common.status')} <SortIcon column="status" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead className="text-end pe-6 whitespace-nowrap">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedInvoices.length > 0 ? (
                  pagedInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="ps-6 font-medium text-primary whitespace-nowrap">{invoice.id}</TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">{invoice.clientName}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-slate-600">
                        {invoice.date}
                      </TableCell>
                      <TableCell className="font-bold text-slate-900 whitespace-nowrap">{formatCurrency(invoice.total)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(invoice.status)}
                          {invoice.documentType === 'TransactionInvoice' && settledSourceIds.has(invoice.id) && (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle className="h-3 w-3" /> {t('invoices.settled')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-end pe-6">
                        <RowActions actions={[
                          // Issue a receipt (קבלה) from a transaction invoice (חשבון עסקה):
                          // opens a new document prefilled with this one's client, items,
                          // price and booking agent — the user only picks a payment method.
                          // FF-WEB-4 — hidden once a non-Cancelled document has already
                          // been issued from this חשבון עסקה (at most one allowed;
                          // Cancelling that document frees it up for a new one).
                          ...(invoice.documentType === 'TransactionInvoice' && !activeReceiptSourceIds.has(invoice.id) ? [{
                            key: 'receipt',
                            icon: ReceiptText,
                            label: t('invoices.create_receipt_from'),
                            inlineClassName: 'hover:text-green-600',
                            onClick: () => navigate(`/invoices/new?fromInvoice=${invoice.id}&as=Receipt`),
                          }] : []),
                          {
                            key: 'send',
                            icon: Mail,
                            label: t('invoices.send_invoice'),
                            inlineClassName: 'hover:text-blue-600',
                            onClick: () => setSendInvoice(invoice),
                          },
                          {
                            key: 'pdf',
                            icon: FileDown,
                            label: t('invoices.download_pdf'),
                            inlineClassName: 'hover:text-primary',
                            disabled: isGeneratingPDF,
                            onClick: () => handleDownloadPDF(invoice),
                          },
                          ...(invoice.status === 'Paid' ? [{
                            key: 'refund',
                            icon: RotateCcw,
                            label: t('invoices.refund'),
                            inlineClassName: 'hover:text-amber-600',
                            onClick: () => handleOpenRefundAlert(invoice),
                          }] : []),
                          {
                            key: 'edit',
                            icon: Edit2,
                            label: t('common.edit'),
                            inlineClassName: 'hover:text-primary',
                            onClick: () => navigate(`/invoices/${invoice.id}/edit`),
                          },
                          {
                            key: 'delete',
                            icon: invoice.status === 'Draft' ? Trash2 : Ban,
                            label: invoice.status === 'Draft' ? t('common.delete') : t('invoices.cancel_document'),
                            destructive: true,
                            inlineClassName: 'text-red-400 hover:text-red-600 hover:bg-red-50',
                            onClick: () => handleOpenDeleteAlert(invoice),
                          },
                        ]} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                      {t('dashboard.no_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {sortedInvoices.length > 0 && (
            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              total={totalRows}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog
        isOpen={isDeleteAlertOpen}
        onClose={() => setIsDeleteAlertOpen(false)}
        onConfirm={confirmDelete}
        title={isIssuedDocument ? t('invoices.cancel_title') : t('invoices.delete_title')}
        description={isIssuedDocument ? t('invoices.cancel_description') : t('invoices.delete_description')}
        confirmText={isIssuedDocument ? t('invoices.cancel_document') : t('common.delete')}
        variant="destructive"
      />

      <AlertDialog 
        isOpen={isRefundAlertOpen}
        onClose={() => setIsRefundAlertOpen(false)}
        onConfirm={confirmRefund}
        title={t('invoices.refund_title')}
        description={t('invoices.refund_description')}
        confirmText={t('invoices.refund')}
        variant="destructive"
      />

      {/* Send Invoice Modal */}
      {sendInvoice && (
        <SendInvoiceModal invoice={sendInvoice} onClose={() => setSendInvoice(null)} />
      )}

      {/* Hidden Portal for PDF Generation */}
      <div
        style={{ position: 'absolute', left: '-10000px', top: '-10000px', zIndex: -100 }}
      >
        <div id="invoice-template-portal">
          {pdfInvoice && (
            <InvoiceTemplate
              invoice={pdfInvoice}
              business={businessSettings}
              copyType={resolveCopyType(pdfInvoice)}
            />
          )}
        </div>
      </div>

      {/* Generation Overlay */}
      {isGeneratingPDF && (
        <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border animate-in zoom-in-95">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">Generating Secure PDF...</p>
          </div>
        </div>
      )}
    </div>
  );
}
