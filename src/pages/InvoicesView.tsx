import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  X, 
  DollarSign,
  AlertTriangle,
  FileDown,
  Loader2,
  UserPlus,
  ArrowRight,
  Briefcase,
  RotateCcw
} from 'lucide-react';
import { useFinance, type Invoice, type InvoiceItem } from '../context/FinanceContext';
import { generateInvoicePDF } from '../services/pdf/invoice-service';
import { InvoiceTemplate } from '../services/pdf/InvoiceTemplate';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { AlertDialog } from '../components/ui/AlertDialog';
import { Input } from '../components/ui/Input';

interface InvoiceFormData {
  clientId: string;
  bookingAgentId?: string;
  commissionAmount?: number;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  taxRate: number;
  status: Invoice['status'];
}

export default function InvoicesView() {
  const { t, i18n } = useTranslation();
  const { invoices, clients, bookingAgents, addInvoice, updateInvoice, deleteInvoice, businessSettings } = useFinance();
  const location = useLocation();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isRefundAlertOpen, setIsRefundAlertOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [invoiceToRefund, setInvoiceToRefund] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Client Search State
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Booking Agent Search State
  const [agentSearchTerm, setAgentSearchTerm] = useState('');
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Handle URL actions (Quick Actions from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action === 'new') {
      handleOpenModal();
      // Remove the parameter after opening
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setIsAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered clients for search
  const filteredSearchClients = useMemo(() => {
    if (!clientSearchTerm) return clients.slice(0, 5);
    return clients.filter(c => 
      c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
    ).slice(0, 5);
  }, [clients, clientSearchTerm]);

  // Filtered agents for search
  const filteredSearchAgents = useMemo(() => {
    if (!agentSearchTerm) return bookingAgents.slice(0, 5);
    return bookingAgents.filter(a => 
      a.name.toLowerCase().includes(agentSearchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(agentSearchTerm.toLowerCase())
    ).slice(0, 5);
  }, [bookingAgents, agentSearchTerm]);

  // PDF Generation State
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfInvoice, setPdfInvoice] = useState<Invoice | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<InvoiceFormData>(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      clientId: '',
      bookingAgentId: '',
      commissionAmount: 0,
      date: today,
      dueDate: today,
      items: [{ id: '1', description: '', quantity: 1, unitPrice: 0 }] as InvoiceItem[],
      taxRate: 0,
      status: 'Sent' as Invoice['status']
    };
  });

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

  const handleOpenModal = (invoice?: Invoice) => {
    const isPatur = businessSettings.type === 'EsekPatur';
    if (invoice) {
      setEditingInvoice(invoice);
      setClientSearchTerm(invoice.clientName);
      setAgentSearchTerm(invoice.bookingAgentName || '');
      setFormData({
        clientId: invoice.clientId,
        bookingAgentId: invoice.bookingAgentId || '',
        commissionAmount: invoice.commissionAmount || 0,
        date: invoice.date,
        dueDate: invoice.dueDate,
        items: [...invoice.items],
        taxRate: isPatur ? 0 : invoice.taxRate,
        status: invoice.status
      });
    } else {
      setEditingInvoice(null);
      setClientSearchTerm('');
      setAgentSearchTerm('');
      const today = new Date().toISOString().split('T')[0];
      setFormData({
        clientId: '',
        bookingAgentId: '',
        commissionAmount: 0,
        date: today,
        dueDate: today,
        items: [{ id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0 }],
        taxRate: isPatur ? 0 : 18,
        status: 'Sent'
      });
    }
    setIsModalOpen(false); // Close first to reset any scroll
    setTimeout(() => setIsModalOpen(true), 10);
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let currentClientId = formData.clientId;
    let currentClientName = '';

    // Check if we have a match in existing clients
    const existingClient = clients.find(c => c.id === currentClientId || c.name === clientSearchTerm);
    
    if (existingClient) {
      currentClientId = existingClient.id;
      currentClientName = existingClient.name;
    } else if (clientSearchTerm.trim()) {
      // Use the free text name without creating a new client in the database
      currentClientId = 'casual'; 
      currentClientName = clientSearchTerm.trim();
    } else {
      // No client selected and no search term
      return;
    }

    // Handle Booking Agent
    let currentAgentId = formData.bookingAgentId;
    let currentAgentName = '';
    let commission = 0;

    const existingAgent = bookingAgents.find(a => a.id === currentAgentId || a.name === agentSearchTerm);
    if (existingAgent) {
      currentAgentId = existingAgent.id;
      currentAgentName = existingAgent.name;
      // Calculate commission based on subtotal
      const subtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      commission = subtotal * (existingAgent.commissionRate / 100);
    } else if (agentSearchTerm.trim()) {
      currentAgentId = 'custom';
      currentAgentName = agentSearchTerm.trim();
      commission = formData.commissionAmount || 0;
    }

    // Explicitly determine tax rate based strictly on the current active business settings
    const activeTaxRate = businessSettings.type === 'EsekPatur' ? 0 : 18;

    const invoiceData = {
      clientId: currentClientId,
      clientName: currentClientName,
      bookingAgentId: currentAgentId || undefined,
      bookingAgentName: currentAgentName || undefined,
      commissionAmount: commission || undefined,
      date: formData.date,
      dueDate: formData.dueDate,
      items: formData.items,
      taxRate: activeTaxRate,
      status: formData.status
    };

    if (editingInvoice) {
      updateInvoice(editingInvoice.id, invoiceData);
    } else {
      addInvoice(invoiceData);
    }
    setIsModalOpen(false);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0 }]
    });
  };

  const removeItem = (id: string) => {
    if (formData.items.length <= 1) return;
    setFormData({
      ...formData,
      items: formData.items.filter(item => item.id !== id)
    });
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
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto h-11 md:h-10">
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
                            onClick={() => handleOpenModal(invoice)}
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

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingInvoice ? `${t('common.edit')} ${editingInvoice.id}` : t('invoices.create_invoice')}
      >
        <div className="max-h-[80vh] md:max-h-[85vh] overflow-y-auto px-1 scrollbar-hide">
          <form onSubmit={handleSubmit} className="space-y-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 relative" ref={dropdownRef}>
                <label className="text-sm font-medium">{t('invoices.client')}</label>
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder={t('invoices.choose_client')}
                    className="ps-9 h-11 md:h-10"
                    value={clientSearchTerm}
                    onChange={(e) => {
                      setClientSearchTerm(e.target.value);
                      setIsClientDropdownOpen(true);
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    required
                  />
                </div>

                {isClientDropdownOpen && (
                  <div className="absolute z-[110] top-full left-0 right-0 mt-1 bg-white rounded-lg border shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto">
                      {filteredSearchClients.length > 0 ? (
                        filteredSearchClients.map(client => (
                          <button
                            key={client.id}
                            type="button"
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b last:border-0"
                            onClick={() => {
                              setFormData({ ...formData, clientId: client.id });
                              setClientSearchTerm(client.name);
                              setIsClientDropdownOpen(false);
                            }}
                          >
                            <div className="text-start">
                              <p className="text-sm font-bold text-slate-900">{client.name}</p>
                              <p className="text-[10px] text-slate-500">{client.email}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-300" />
                          </button>
                        ))
                      ) : clientSearchTerm ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          {t('clients.no_clients_found') || 'No matching clients found.'}
                        </div>
                      ) : null}
                    </div>
                    
                    <div className="bg-slate-50 p-2 space-y-1 border-t">
                      {clientSearchTerm && !clients.some(c => c.name.toLowerCase() === clientSearchTerm.toLowerCase()) && (
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                          onClick={() => setIsClientDropdownOpen(false)}
                        >
                          <div className="bg-indigo-100 p-1 rounded">
                            <Plus className="h-3 w-3" />
                          </div>
                          <span>{t('common.continue_with') || 'Continue with'} "{clientSearchTerm}"</span>
                        </button>
                      )}
                      
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                        onClick={() => navigate(`/clients?action=new&name=${encodeURIComponent(clientSearchTerm)}`)}
                      >
                        <div className="bg-slate-200 p-1 rounded">
                          <UserPlus className="h-3 w-3" />
                        </div>
                        <span>{t('clients.add_client')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('common.status')}</label>
                <select 
                  className="flex h-11 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as Invoice['status']})}
                >
                  <option value="Draft">{t('invoices.draft')}</option>
                  <option value="Sent">{t('invoices.sent')}</option>
                  <option value="Paid">{t('invoices.paid')}</option>
                  <option value="Overdue">{t('invoices.overdue')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 relative" ref={agentDropdownRef}>
                <label className="text-sm font-medium">{t('common.booking_agents')}</label>
                <div className="relative">
                  <Briefcase className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder={t('bookingAgents.search_placeholder')}
                    className="ps-9 h-11 md:h-10"
                    value={agentSearchTerm}
                    onChange={(e) => {
                      setAgentSearchTerm(e.target.value);
                      setIsAgentDropdownOpen(true);
                    }}
                    onFocus={() => setIsAgentDropdownOpen(true)}
                  />
                </div>

                {isAgentDropdownOpen && (
                  <div className="absolute z-[110] top-full left-0 right-0 mt-1 bg-white rounded-lg border shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto">
                      {filteredSearchAgents.length > 0 ? (
                        filteredSearchAgents.map(agent => (
                          <button
                            key={agent.id}
                            type="button"
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b last:border-0"
                            onClick={() => {
                              setFormData({ ...formData, bookingAgentId: agent.id });
                              setAgentSearchTerm(agent.name);
                              setIsAgentDropdownOpen(false);
                            }}
                          >
                            <div className="text-start">
                              <p className="text-sm font-bold text-slate-900">{agent.name}</p>
                              <p className="text-[10px] text-slate-500">{agent.commissionRate}% Commission</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-300" />
                          </button>
                        ))
                      ) : agentSearchTerm ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          No matching agents found.
                        </div>
                      ) : null}
                    </div>
                    
                    <div className="bg-slate-50 p-2 space-y-1 border-t">
                      {agentSearchTerm && !bookingAgents.some(a => a.name.toLowerCase() === agentSearchTerm.toLowerCase()) && (
                        <div className="p-2 space-y-2">
                           <p className="text-[10px] font-bold text-slate-500 uppercase px-1">Custom Commission</p>
                           <Input 
                             type="number"
                             placeholder="Commission Amount (ILS)"
                             className="h-9 text-xs"
                             value={formData.commissionAmount}
                             onChange={(e) => setFormData({...formData, commissionAmount: parseFloat(e.target.value) || 0})}
                           />
                           <button
                             type="button"
                             className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                             onClick={() => setIsAgentDropdownOpen(false)}
                           >
                             <Plus className="h-3 w-3" />
                             <span>Use "{agentSearchTerm}" (Custom)</span>
                           </button>
                        </div>
                      )}
                      
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                        onClick={() => navigate(`/booking-agents?action=new&name=${encodeURIComponent(agentSearchTerm)}`)}
                      >
                        <UserPlus className="h-3 w-3" />
                        <span>Add New Agent</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('invoices.issue_date')}</label>
                <Input type="date" className="h-11 md:h-10" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">{t('invoices.line_items')}</label>
              </div>
              
              <div className="hidden md:flex gap-2 mb-1 px-1">
                <div className="flex-1 text-[10px] font-bold uppercase text-slate-400">{t('invoices.item_description')}</div>
                <div className="w-20 text-[10px] font-bold uppercase text-slate-400">{t('invoices.qty')}</div>
                <div className="w-28 text-[10px] font-bold uppercase text-slate-400">{t('invoices.price')}</div>
                <div className="w-8 shrink-0"></div>
              </div>

              <div className="space-y-4 md:space-y-3">
                {formData.items.map((item, index) => (
                  <div key={item.id} className="flex flex-col md:flex-row gap-3 md:gap-2 items-start md:items-center p-3 md:p-0 bg-slate-50 md:bg-transparent rounded-lg border md:border-0 border-slate-200">
                    <div className="w-full md:flex-1">
                      <label className="md:hidden text-[10px] font-bold uppercase text-slate-400 mb-1 block">{t('invoices.item_description')}</label>
                      <Input 
                        placeholder={t('invoices.item_description')}
                        className="h-11 md:h-10"
                        value={item.description}
                        onChange={(e) => {
                          const items = [...formData.items];
                          items[index].description = e.target.value;
                          setFormData({...formData, items});
                        }}
                      />
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                      <div className="flex-1 md:w-20">
                        <label className="md:hidden text-[10px] font-bold uppercase text-slate-400 mb-1 block">{t('invoices.qty')}</label>
                        <Input 
                          type="number" 
                          placeholder={t('invoices.qty')}
                          className="h-11 md:h-10"
                          value={item.quantity}
                          onChange={(e) => {
                            const items = [...formData.items];
                            items[index].quantity = parseInt(e.target.value) || 0;
                            setFormData({...formData, items});
                          }}
                        />
                      </div>
                      <div className="flex-[2] md:w-28">
                        <label className="md:hidden text-[10px] font-bold uppercase text-slate-400 mb-1 block">{t('invoices.price')}</label>
                        <Input 
                          type="number" 
                          placeholder={t('invoices.price')}
                          className="h-11 md:h-10"
                          value={item.unitPrice}
                          onChange={(e) => {
                            const items = [...formData.items];
                            items[index].unitPrice = parseFloat(e.target.value) || 0;
                            setFormData({...formData, items});
                          }}
                        />
                      </div>
                      <div className="pt-6 md:pt-0">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-11 w-11 md:h-10 md:w-10 text-slate-400 hover:text-red-500 shrink-0"
                          onClick={() => removeItem(item.id)}
                        >
                          <X className="h-5 w-5 md:h-4 md:w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-start">
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-9 md:h-8 border-dashed">
                  <Plus className="h-4 w-4 me-1" /> {t('invoices.add_item')}
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t space-y-4 md:space-y-2">
              <div className="flex justify-between md:justify-end items-center gap-4">
                <div className="flex flex-col items-end">
                  <label className="text-sm font-medium text-slate-500">{t('invoices.tax_rate')}</label>
                  {businessSettings.type === 'EsekPatur' ? (
                    <span className="text-[10px] text-slate-400 font-medium">({t('profile.type_patur')})</span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">(Fixed)</span>
                  )}
                </div>
                <div className="w-24 md:w-28">
                  <Input 
                    type="number" 
                    placeholder="0" 
                    className="h-11 md:h-10 bg-slate-50 text-slate-500 cursor-not-allowed opacity-80"
                    value={businessSettings.type === 'EsekPatur' ? 0 : 18}
                    readOnly
                    disabled
                  />
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 md:gap-1">
                <div className="flex justify-between w-full md:w-64 text-sm text-slate-500 px-1">
                  <span>{t('invoices.subtotal')}</span>
                  <span>{formatCurrency(formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0))}</span>
                </div>
                <div className="flex justify-between w-full md:w-64 text-sm text-slate-500 px-1">
                  <span>{t('invoices.tax')} ({businessSettings.type === 'EsekPatur' ? 0 : 18}%)</span>
                  <span>
                    {formatCurrency(
                      formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) * ((businessSettings.type === 'EsekPatur' ? 0 : 18) / 100)
                    )}
                  </span>
                </div>
                <div className="flex justify-between w-full md:w-64 text-xl md:text-2xl font-black border-t pt-4 md:pt-2 mt-2 md:mt-1 px-1">
                  <span>{t('common.total')}</span>
                  <span className="text-primary font-bold">
                    {formatCurrency(
                      formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0) * (1 + (businessSettings.type === 'EsekPatur' ? 0 : 18) / 100)
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="h-11 md:h-10 order-2 sm:order-1">
                {t('common.cancel')}
              </Button>
              <Button type="submit" className="h-11 md:h-10 px-8 order-1 sm:order-2 font-bold">
                {editingInvoice ? t('common.save') : t('invoices.create_invoice')}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

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
