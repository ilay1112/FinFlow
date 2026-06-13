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
} from 'lucide-react';
import { useFinance, type Invoice } from '../context/FinanceContext';
import { generateInvoicePDF } from '../services/pdf/invoice-service';
import { InvoiceTemplate } from '../services/pdf/InvoiceTemplate';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { AlertDialog } from '../components/ui/AlertDialog';
import { Input } from '../components/ui/Input';
import { SendInvoiceModal } from '../components/SendInvoiceModal';

export default function InvoicesView() {
  const { t, i18n } = useTranslation();
  const { invoices, updateInvoice, deleteInvoice, businessSettings } = useFinance();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isRefundAlertOpen, setIsRefundAlertOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [invoiceToRefund, setInvoiceToRefund] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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

  // Analytics
  const totalPaid = invoices.filter(i => i.status === 'Paid').reduce((sum, i) => sum + i.total, 0);
  const totalOutstanding = invoices.filter(i => i.status === 'Sent').reduce((sum, i) => sum + i.total, 0);
  const totalOverdue = invoices.filter(i => i.status === 'Overdue').reduce((sum, i) => sum + i.total, 0);
  const totalRefunded = invoices.filter(i => i.status === 'Refunded').reduce((sum, i) => sum + i.total, 0);

  const handleOpenDeleteAlert = (id: string) => {
    setInvoiceToDelete(id);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = () => {
    if (invoiceToDelete) {
      deleteInvoice(invoiceToDelete);
      setInvoiceToDelete(null);
    }
  };

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

  const handleDownloadPDF = async (invoice: Invoice) => {
    setIsGeneratingPDF(true);
    setPdfInvoice(invoice);
    
    // Give React a tick to render the template into the portal
    setTimeout(async () => {
      await generateInvoicePDF(invoice, businessSettings, 'invoice-template-portal');
      setIsGeneratingPDF(false);
      setPdfInvoice(null);
    }, 100);
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
      style: 'currency', 
      currency: 'ILS' 
    }).format(value);

  const getStatusBadge = (status: Invoice['status']) => {
    switch (status) {
      case 'Paid': return <Badge variant="success" className="gap-1"><CheckCircle className="h-3 w-3" /> {t('invoices.paid')}</Badge>;
      case 'Refunded': return <Badge variant="outline" className="gap-1 bg-slate-100 text-slate-600 border-slate-200"><RotateCcw className="h-3 w-3" /> {t('invoices.refunded')}</Badge>;
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
                onChange={(e) => setSearchTerm(e.target.value)}
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
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-slate-500 font-medium">{t('expenses.to')}:</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none focus:ring-0 text-slate-900 flex-1 md:flex-none"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                {(startDate || endDate) && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-[10px]"
                    onClick={() => { setStartDate(''); setEndDate(''); }}
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
                  <TableHead className="ps-6 text-start whitespace-nowrap">{t('invoices.invoice_id')}</TableHead>
                  <TableHead className="text-start whitespace-nowrap">{t('invoices.client')}</TableHead>
                  <TableHead className="text-start whitespace-nowrap">{t('common.date')}</TableHead>
                  <TableHead className="text-start whitespace-nowrap">{t('common.amount')}</TableHead>
                  <TableHead className="text-start whitespace-nowrap">{t('common.status')}</TableHead>
                  <TableHead className="text-end pe-6 whitespace-nowrap">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length > 0 ? (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="ps-6 font-medium text-primary whitespace-nowrap">{invoice.id}</TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">{invoice.clientName}</TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-slate-600">
                        {invoice.date}
                      </TableCell>
                      <TableCell className="font-bold text-slate-900 whitespace-nowrap">{formatCurrency(invoice.total)}</TableCell>
                      <TableCell className="whitespace-nowrap">{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-end pe-6">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-blue-600"
                            onClick={() => setSendInvoice(invoice)}
                            title={t('invoices.send_invoice')}
                          >
                            <Mail className="h-5 w-5 md:h-4 md:w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-primary"
                            disabled={isGeneratingPDF}
                            onClick={() => handleDownloadPDF(invoice)}
                            title={t('invoices.download_pdf')}
                          >
                            <FileDown className="h-5 w-5 md:h-4 md:w-4" />
                          </Button>
                          {invoice.status === 'Paid' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-amber-600"
                              onClick={() => handleOpenRefundAlert(invoice)}
                              title={t('invoices.refund')}
                            >
                              <RotateCcw className="h-5 w-5 md:h-4 md:w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-primary"
                            onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
                            title={t('common.edit')}
                          >
                            <Edit2 className="h-5 w-5 md:h-4 md:w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 md:h-8 md:w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleOpenDeleteAlert(invoice.id)}
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
                          </Button>
                        </div>
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
        </CardContent>
      </Card>

      <AlertDialog 
        isOpen={isDeleteAlertOpen}
        onClose={() => setIsDeleteAlertOpen(false)}
        onConfirm={confirmDelete}
        title={t('invoices.delete_title')}
        description={t('invoices.delete_description')}
        confirmText={t('common.delete')}
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
            <InvoiceTemplate invoice={pdfInvoice} business={businessSettings} />
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
