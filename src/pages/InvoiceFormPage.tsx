import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus,
  Search,
  X,
  ArrowRight,
  Briefcase,
  UserPlus,
  ChevronLeft,
} from 'lucide-react';
import { useFinance, type Invoice, type InvoiceItem, type DocumentType } from '../context/FinanceContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useCurrencyFormatter } from '../utils/format';
import { computeTotals, computeCommission } from '../utils/invoiceMath';
import { getVatRate } from '../config/taxConfig';

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  TaxInvoice: 'invoices.doc_tax_invoice',
  Receipt: 'invoices.doc_receipt',
  TaxInvoiceReceipt: 'invoices.doc_tax_invoice_receipt',
  TransactionInvoice: 'invoices.doc_transaction_invoice',
};

interface InvoiceFormData {
  clientId: string;
  documentType: DocumentType;
  bookingAgentId?: string;
  commissionAmount?: number;
  date: string;
  dueDate: string;
  items: (Omit<InvoiceItem, 'unitPrice'> & { unitPrice: number | '' })[];
  taxRate: number;
  status: Invoice['status'];
}

export default function InvoiceFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { invoices, clients, bookingAgents, addInvoice, updateInvoice, businessSettings } = useFinance();

  const editingInvoice = id ? invoices.find(inv => inv.id === id) ?? null : null;
  const isEditing = !!editingInvoice;

  const isPatur = businessSettings.type === 'EsekPatur';

  // 2a — Esek Patur may NOT issue a tax invoice (חשבונית מס). Restrict the
  // available document types to קבלה (Receipt) and חשבון עסקה (TransactionInvoice).
  const allowedDocumentTypes: DocumentType[] = isPatur
    ? ['Receipt', 'TransactionInvoice']
    : ['TaxInvoice', 'Receipt', 'TaxInvoiceReceipt', 'TransactionInvoice'];

  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [agentSearchTerm, setAgentSearchTerm] = useState('');
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<InvoiceFormData>(() => {
    if (editingInvoice) {
      return {
        clientId: editingInvoice.clientId,
        documentType:
          editingInvoice.documentType && allowedDocumentTypes.includes(editingInvoice.documentType)
            ? editingInvoice.documentType
            : (isPatur ? 'Receipt' : 'TaxInvoice'),
        bookingAgentId: editingInvoice.bookingAgentId || '',
        commissionAmount: editingInvoice.commissionAmount || 0,
        date: editingInvoice.date,
        dueDate: editingInvoice.dueDate,
        items: [...editingInvoice.items],
        taxRate: isPatur ? 0 : editingInvoice.taxRate,
        status: editingInvoice.status,
      };
    }
    return {
      clientId: '',
      documentType: isPatur ? 'Receipt' : 'TaxInvoice',
      bookingAgentId: '',
      commissionAmount: 0,
      date: today,
      dueDate: today,
      items: [{ id: Date.now().toString(), description: '', quantity: 1, unitPrice: '' }],
      taxRate: isPatur ? 0 : getVatRate(today),
      status: 'Paid',
    };
  });

  useEffect(() => {
    if (editingInvoice) {
      setClientSearchTerm(editingInvoice.clientName);
      setAgentSearchTerm(editingInvoice.bookingAgentName || '');
    }
  }, []);

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

  const filteredSearchClients = useMemo(() => {
    if (!clientSearchTerm) return clients.slice(0, 5);
    return clients.filter(c =>
      c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(clientSearchTerm.toLowerCase())
    ).slice(0, 5);
  }, [clients, clientSearchTerm]);

  const filteredSearchAgents = useMemo(() => {
    if (!agentSearchTerm) return bookingAgents.slice(0, 5);
    return bookingAgents.filter(a =>
      a.name.toLowerCase().includes(agentSearchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(agentSearchTerm.toLowerCase())
    ).slice(0, 5);
  }, [bookingAgents, agentSearchTerm]);

  // VAT is resolved from the dated config by the invoice's own issue date, so an
  // invoice always uses the rate that legally applied when it was issued.
  const activeTaxRate = isPatur ? 0 : getVatRate(formData.date);
  const { subtotal, taxAmount, total } = computeTotals(
    formData.items.map(item => ({ quantity: item.quantity, unitPrice: Number(item.unitPrice) || 0 })),
    activeTaxRate
  );

  const formatCurrency = useCurrencyFormatter();

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { id: Date.now().toString(), description: '', quantity: 1, unitPrice: '' }],
    });
  };

  const removeItem = (itemId: string) => {
    if (formData.items.length <= 1) return;
    setFormData({ ...formData, items: formData.items.filter(item => item.id !== itemId) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let currentClientId = formData.clientId;
    let currentClientName = '';
    // Snapshot of the customer's tax ID at issue time (1b) — see below.
    let currentClientIdNumber: string | undefined;

    const existingClient = clients.find(c => c.id === currentClientId || c.name === clientSearchTerm);
    if (existingClient) {
      currentClientId = existingClient.id;
      currentClientName = existingClient.name;
      currentClientIdNumber = existingClient.idNumber;
    } else if (clientSearchTerm.trim()) {
      currentClientId = 'casual';
      currentClientName = clientSearchTerm.trim();
    } else {
      return;
    }

    // 2a defense-in-depth: never let a disallowed document type reach state, even
    // if a stale value slipped through (e.g. editing a legacy Patur tax invoice).
    const documentType: DocumentType = allowedDocumentTypes.includes(formData.documentType)
      ? formData.documentType
      : allowedDocumentTypes[0];

    let currentAgentId = formData.bookingAgentId;
    let currentAgentName = '';
    let commission = 0;

    const processedItems = formData.items.map(item => ({
      ...item,
      unitPrice: item.unitPrice === '' ? 0 : item.unitPrice,
    })) as InvoiceItem[];

    const existingAgent = bookingAgents.find(a => a.id === currentAgentId || a.name === agentSearchTerm);
    if (existingAgent) {
      currentAgentId = existingAgent.id;
      currentAgentName = existingAgent.name;
      const sub = processedItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      commission = computeCommission(sub, existingAgent);
    } else if (agentSearchTerm.trim()) {
      currentAgentId = 'custom';
      currentAgentName = agentSearchTerm.trim();
      commission = formData.commissionAmount || 0;
    }

    const invoiceData = {
      clientId: currentClientId,
      clientName: currentClientName,
      // Snapshot the customer's tax ID onto the document at issue time so later
      // edits to the client record never mutate an already-issued legal document.
      clientIdNumber: currentClientIdNumber,
      documentType,
      bookingAgentId: currentAgentId || undefined,
      bookingAgentName: currentAgentName || undefined,
      commissionAmount: commission || undefined,
      date: formData.date,
      dueDate: formData.dueDate,
      items: processedItems,
      taxRate: activeTaxRate,
      status: formData.status,
    };

    if (isEditing && editingInvoice) {
      updateInvoice(editingInvoice.id, invoiceData);
    } else {
      addInvoice(invoiceData);
    }
    navigate('/invoices');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="p-2 -ms-2 rounded-full hover:bg-slate-100 transition-colors text-slate-600"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-900 flex-1">
          {isEditing ? `${t('common.edit')} ${editingInvoice!.id}` : t('invoices.create_invoice')}
        </h1>
      </div>

      {/* Scrollable form body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

          {/* Client */}
          <div className="space-y-1.5 relative" ref={dropdownRef}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoices.client')}</label>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t('invoices.choose_client')}
                className="ps-9 h-12 bg-white"
                value={clientSearchTerm}
                onChange={(e) => { setClientSearchTerm(e.target.value); setIsClientDropdownOpen(true); }}
                onFocus={() => setIsClientDropdownOpen(true)}
                required
              />
            </div>
            {isClientDropdownOpen && (
              <div className="absolute z-[110] top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-xl overflow-hidden">
                <div className="max-h-52 overflow-y-auto">
                  {filteredSearchClients.length > 0 ? (
                    filteredSearchClients.map(client => (
                      <button
                        key={client.id}
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b last:border-0"
                        onClick={() => { setFormData({ ...formData, clientId: client.id }); setClientSearchTerm(client.name); setIsClientDropdownOpen(false); }}
                      >
                        <div className="text-start">
                          <p className="text-sm font-bold text-slate-900">{client.name}</p>
                          <p className="text-[10px] text-slate-500">{client.email}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </button>
                    ))
                  ) : clientSearchTerm ? (
                    <div className="p-4 text-center text-xs text-slate-500">{t('clients.no_clients_found')}</div>
                  ) : null}
                </div>
                <div className="bg-slate-50 p-2 space-y-1 border-t">
                  {clientSearchTerm && !clients.some(c => c.name.toLowerCase() === clientSearchTerm.toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      onClick={() => setIsClientDropdownOpen(false)}
                    >
                      <div className="bg-indigo-100 p-1 rounded"><Plus className="h-3 w-3" /></div>
                      <span>{t('common.continue_with') || 'Continue with'} "{clientSearchTerm}"</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                    onClick={() => navigate(`/clients?action=new&name=${encodeURIComponent(clientSearchTerm)}`)}
                  >
                    <div className="bg-slate-200 p-1 rounded"><UserPlus className="h-3 w-3" /></div>
                    <span>{t('clients.add_client')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Document Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoices.document_type')}</label>
            <select
              className="flex h-12 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={formData.documentType}
              onChange={(e) => setFormData({ ...formData, documentType: e.target.value as DocumentType })}
            >
              {allowedDocumentTypes.map(type => (
                <option key={type} value={type}>{t(DOCUMENT_TYPE_LABELS[type])}</option>
              ))}
            </select>
          </div>

          {/* Status + Date — side by side on mobile too */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('common.status')}</label>
              <select
                className="flex h-12 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Invoice['status'] })}
              >
                <option value="Draft">{t('invoices.draft')}</option>
                <option value="Sent">{t('invoices.sent')}</option>
                <option value="Paid">{t('invoices.paid')}</option>
                <option value="Overdue">{t('invoices.overdue')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoices.issue_date')}</label>
              <Input
                type="date"
                className="h-12 bg-white"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>
          </div>

          {/* Booking Agent */}
          <div className="space-y-1.5 relative" ref={agentDropdownRef}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('common.booking_agents')}</label>
            <div className="relative">
              <Briefcase className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={t('bookingAgents.search_placeholder')}
                className="ps-9 h-12 bg-white"
                value={agentSearchTerm}
                onChange={(e) => { setAgentSearchTerm(e.target.value); setIsAgentDropdownOpen(true); }}
                onFocus={() => setIsAgentDropdownOpen(true)}
              />
            </div>
            {isAgentDropdownOpen && (
              <div className="absolute z-[110] top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-xl overflow-hidden">
                <div className="max-h-52 overflow-y-auto">
                  {filteredSearchAgents.length > 0 ? (
                    filteredSearchAgents.map(agent => (
                      <button
                        key={agent.id}
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b last:border-0"
                        onClick={() => { setFormData({ ...formData, bookingAgentId: agent.id }); setAgentSearchTerm(agent.name); setIsAgentDropdownOpen(false); }}
                      >
                        <div className="text-start">
                          <p className="text-sm font-bold text-slate-900">{agent.name}</p>
                          <p className="text-[10px] text-slate-500">{agent.commissionRate}% Commission</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </button>
                    ))
                  ) : agentSearchTerm ? (
                    <div className="p-4 text-center text-xs text-slate-500">No matching agents found.</div>
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
                        onChange={(e) => setFormData({ ...formData, commissionAmount: parseFloat(e.target.value) || 0 })}
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

          {/* Line Items */}
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('invoices.line_items')}</label>
            <div className="space-y-3">
              {formData.items.map((item, index) => (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={t('invoices.item_description')}
                      className="h-11 flex-1"
                      value={item.description}
                      onChange={(e) => {
                        const items = [...formData.items];
                        items[index].description = e.target.value;
                        setFormData({ ...formData, items });
                      }}
                    />
                    <button
                      type="button"
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                      onClick={() => removeItem(item.id)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-slate-400">{t('invoices.qty')}</p>
                      <Input
                        type="number"
                        placeholder="1"
                        className="h-11"
                        value={item.quantity}
                        onChange={(e) => {
                          const items = [...formData.items];
                          items[index].quantity = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, items });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-slate-400">{t('invoices.price')}</p>
                      <Input
                        type="number"
                        placeholder="0.00"
                        className="h-11"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const items = [...formData.items];
                          items[index].unitPrice = e.target.value === '' ? '' : (parseFloat(e.target.value) || 0);
                          setFormData({ ...formData, items });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-10 border-dashed w-full">
              <Plus className="h-4 w-4 me-1" /> {t('invoices.add_item')}
            </Button>
          </div>

          {/* Totals */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>{t('invoices.subtotal')}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>{t('invoices.tax')} ({activeTaxRate}%)</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between text-xl font-black border-t pt-3 mt-1">
              <span>{t('common.total')}</span>
              <span className="text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Bottom padding so sticky footer doesn't cover content */}
          <div className="h-4" />
        </div>
      </form>

      {/* Sticky footer buttons */}
      <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12"
          onClick={() => navigate('/invoices')}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          className="flex-1 h-12 font-bold"
          onClick={handleSubmit}
        >
          {isEditing ? t('common.save') : t('invoices.create_invoice')}
        </Button>
      </div>
    </div>
  );
}
