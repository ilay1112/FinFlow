import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Mail, 
  Phone, 
  Search, 
  Trash2, 
  Edit2, 
  History,
  Users,
  TrendingUp,
  Wallet,
  Upload,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../utils/utils';
import { useFinance, type BookingAgent } from '../context/FinanceContext';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { AlertDialog } from '../components/ui/AlertDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';

export default function BookingAgentsView() {
  const { t, i18n } = useTranslation();
  const { 
    bookingAgents, 
    invoices, 
    addBookingAgent, 
    updateBookingAgent, 
    deleteBookingAgent,
    addExpense,
    uploadReceipt
  } = useFinance();
  const location = useLocation();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [editingBookingAgent, setEditingBookingAgent] = useState<BookingAgent | null>(null);
  const [bookingAgentToDelete, setBookingAgentToDelete] = useState<string | null>(null);
  const [selectedBookingAgentForHistory, setSelectedBookingAgentForHistory] = useState<BookingAgent | null>(null);
  const [selectedAgentForPayment, setSelectedAgentForPayment] = useState<BookingAgent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Payment Form State
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Handle URL actions (Quick Actions from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const nameParam = params.get('name');
    
    if (action === 'new') {
      setEditingBookingAgent(null);
      setFormData({ 
        name: nameParam || '', 
        email: '', 
        phone: '', 
        commissionRate: '' 
      });
      setIsModalOpen(true);
      
      // Remove the parameter after opening
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    commissionRate: number | '';
  }>({
    name: '',
    email: '',
    phone: '',
    commissionRate: ''
  });

  const filteredBookingAgents = bookingAgents.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Analytics
  const totalCommissionsAll = bookingAgents.reduce((sum, a) => sum + a.totalCommissions, 0);
  const totalPaidAll = bookingAgents.reduce((sum, a) => sum + (a.totalPaid || 0), 0);
  const totalOutstandingAll = Math.max(0, totalCommissionsAll - totalPaidAll);

  const handleOpenModal = (bookingAgent?: BookingAgent) => {
    if (bookingAgent) {
      setEditingBookingAgent(bookingAgent);
      setFormData({
        name: bookingAgent.name,
        email: bookingAgent.email,
        phone: bookingAgent.phone,
        commissionRate: bookingAgent.commissionRate
      });
    } else {
      setEditingBookingAgent(null);
      setFormData({ name: '', email: '', phone: '', commissionRate: '' });
    }
    setIsModalOpen(true);
  };

  const handleOpenDeleteAlert = (id: string) => {
    setBookingAgentToDelete(id);
    setIsDeleteAlertOpen(true);
  };

  const handleOpenHistory = (bookingAgent: BookingAgent) => {
    setSelectedBookingAgentForHistory(bookingAgent);
    setIsHistoryModalOpen(true);
  };

  const handleOpenPayModal = (bookingAgent: BookingAgent) => {
    setSelectedAgentForPayment(bookingAgent);
    setPaymentAmount('');
    setReceiptFile(null);
    setIsPayModalOpen(true);
  };

  const confirmDelete = () => {
    if (bookingAgentToDelete) {
      deleteBookingAgent(bookingAgentToDelete);
      setBookingAgentToDelete(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit = {
      ...formData,
      commissionRate: formData.commissionRate === '' ? 0 : formData.commissionRate
    };
    
    if (editingBookingAgent) {
      updateBookingAgent(editingBookingAgent.id, dataToSubmit);
    } else {
      addBookingAgent(dataToSubmit);
    }
    setIsModalOpen(false);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentForPayment || !paymentAmount) return;

    setIsSubmittingPayment(true);
    try {
      const amount = parseFloat(paymentAmount);
      
      // 1. Add Expense
      const expense = addExpense({
        date: new Date().toISOString().split('T')[0],
        vendor: selectedAgentForPayment.name,
        category: 'Commissions',
        amount: amount,
        receiptStatus: 'Missing',
        bookingAgentId: selectedAgentForPayment.id
      });

      // 2. Upload Receipt if provided
      if (receiptFile) {
        await uploadReceipt(receiptFile, expense.id, {
          vendor: selectedAgentForPayment.name,
          date: expense.date
        });
      }

      // 3. Update Booking Agent totalPaid
      updateBookingAgent(selectedAgentForPayment.id, {
        totalPaid: (selectedAgentForPayment.totalPaid || 0) + amount
      });

      setIsPayModalOpen(false);
    } catch (error) {
      console.error('Payment failed:', error);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
      style: 'currency', 
      currency: 'ILS' 
    }).format(value);

  const bookingAgentInvoices = selectedBookingAgentForHistory 
    ? invoices.filter(inv => inv.bookingAgentId === selectedBookingAgentForHistory.id)
    : [];

  const remainingToPay = selectedAgentForPayment 
    ? (selectedAgentForPayment.totalCommissions - (selectedAgentForPayment.totalPaid || 0)) - (parseFloat(paymentAmount) || 0)
    : 0;

  return (
    <div className="space-y-6 px-1 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('bookingAgents.title')}</h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">{t('bookingAgents.subtitle')}</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto h-11 md:h-10 font-bold">
          <Plus className="h-5 w-5 md:h-4 md:w-4 me-2" /> {t('bookingAgents.add_bookingAgent')}
        </Button>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="border-s-4 border-s-primary">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('bookingAgents.total_bookingAgents')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{bookingAgents.length}</p>
              </div>
              <div className="bg-blue-100 p-2 rounded-full">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-indigo-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('bookingAgents.total_commissions')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalCommissionsAll)}</p>
              </div>
              <div className="bg-indigo-100 p-2 rounded-full">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-green-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('bookingAgents.paid_amount')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalPaidAll)}</p>
              </div>
              <div className="bg-green-100 p-2 rounded-full">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-red-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('bookingAgents.to_pay_amount')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalOutstandingAll)}</p>
              </div>
              <div className="bg-red-100 p-2 rounded-full">
                <Wallet className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 px-4 md:px-6">
          <div className="relative max-w-full md:max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('bookingAgents.search_placeholder')} 
              className="ps-9 h-11 md:h-10" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-6">{t('bookingAgents.name_label')}</TableHead>
                  <TableHead>{t('bookingAgents.email_label')}</TableHead>
                  <TableHead>{t('bookingAgents.phone_label')}</TableHead>
                  <TableHead>{t('bookingAgents.commission_rate_label')}</TableHead>
                  <TableHead>{t('bookingAgents.paid_amount')}</TableHead>
                  <TableHead>{t('bookingAgents.to_pay_amount')}</TableHead>
                  <TableHead className="text-end pe-6">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookingAgents.length > 0 ? (
                  filteredBookingAgents.map((bookingAgent) => (
                    <TableRow key={bookingAgent.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="ps-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                            {bookingAgent.name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-900 truncate max-w-[150px]">{bookingAgent.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[150px]">{bookingAgent.email || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <span>{bookingAgent.phone || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-medium">
                          {bookingAgent.commissionRate}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600">{formatCurrency(bookingAgent.totalPaid || 0)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-red-600">
                          {formatCurrency(Math.max(0, bookingAgent.totalCommissions - (bookingAgent.totalPaid || 0)))}
                        </span>
                      </TableCell>
                      <TableCell className="text-end pe-6">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 gap-1.5 text-xs font-bold text-primary border-primary/20 hover:bg-primary/5"
                            onClick={() => handleOpenPayModal(bookingAgent)}
                          >
                            <Wallet className="h-3.5 w-3.5" /> {t('bookingAgents.pay_agent')}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-primary"
                            onClick={() => handleOpenHistory(bookingAgent)}
                            title={t('bookingAgents.history')}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-primary"
                            onClick={() => handleOpenModal(bookingAgent)}
                            title={t('common.edit')}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                            onClick={() => handleOpenDeleteAlert(bookingAgent.id)}
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-slate-500 italic">
                      {t('common.no_results') || 'No booking agents found'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit BookingAgent Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingBookingAgent ? t('bookingAgents.edit_bookingAgent') : t('bookingAgents.add_bookingAgent')}
      >
        <div className="max-h-[80vh] md:max-h-[85vh] overflow-y-auto px-1 scrollbar-hide">
          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('bookingAgents.name_label')}</label>
              <Input 
                placeholder="e.g. Acme Corp" 
                required 
                className="h-11 md:h-10"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('bookingAgents.email_label')}</label>
                <Input 
                  type="email" 
                  placeholder="billing@bookingAgent.com" 
                  className="h-11 md:h-10"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('bookingAgents.phone_label')}</label>
                <Input 
                  placeholder="(555) 000-0000" 
                  className="h-11 md:h-10"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('bookingAgents.commission_rate_label')}</label>
              <div className="relative">
                <Input 
                  type="number"
                  placeholder="10"
                  required
                  className="h-11 md:h-10 pr-8"
                  value={formData.commissionRate}
                  onChange={(e) => setFormData({...formData, commissionRate: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0)})}
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">%</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="h-11 md:h-10 order-2 sm:order-1">
                {t('common.cancel')}
              </Button>
              <Button type="submit" className="h-11 md:h-10 px-8 order-1 sm:order-2 font-bold">
                {editingBookingAgent ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Pay Agent Modal */}
      <Modal 
        isOpen={isPayModalOpen} 
        onClose={() => setIsPayModalOpen(false)} 
        title={`${t('bookingAgents.pay_agent')}: ${selectedAgentForPayment?.name}`}
      >
        <form onSubmit={handlePaySubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('common.amount')}</label>
            <div className="relative">
              <Input 
                type="number" 
                step="0.01"
                required
                placeholder="0"
                className="h-11 md:h-10 pe-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">₪</span>
            </div>
            <p className={cn(
              "text-xs font-bold transition-colors duration-200", 
              remainingToPay > 0 ? "text-red-600" : "text-green-600"
            )}>
              {t('bookingAgents.to_pay_amount')}: {formatCurrency(remainingToPay)}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('expenses.receipt')}</label>
            <div 
              className={cn(
                "border-2 border-dashed rounded-xl p-6 transition-all duration-200 text-center cursor-pointer group",
                receiptFile ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"
              )}
              onClick={() => document.getElementById('payment-receipt-upload')?.click()}
            >
              <input 
                id="payment-receipt-upload"
                type="file" 
                className="hidden" 
                accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
              {receiptFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-primary/20 p-2 rounded-full">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-bold text-primary truncate max-w-xs">{receiptFile.name}</p>
                  <p className="text-xs text-slate-500">{(receiptFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-slate-100 p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                    <Upload className="h-6 w-6 text-slate-400 group-hover:text-primary" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{t('expenses.drag_drop')}</p>
                  <p className="text-xs text-slate-400">JPG, PNG, PDF</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsPayModalOpen(false)} className="h-11 md:h-10 order-2 sm:order-1">
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              className="h-11 md:h-10 px-8 order-1 sm:order-2 font-bold"
              disabled={isSubmittingPayment || !paymentAmount}
            >
              {isSubmittingPayment ? t('common.syncing') : t('bookingAgents.pay_agent')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Invoice History Modal */}
      <Modal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
        title={`${t('bookingAgents.history')}: ${selectedBookingAgentForHistory?.name}`}
      >
        <div className="space-y-6">
          <div className="max-h-[60vh] md:max-h-[70vh] overflow-y-auto px-1">
            {bookingAgentInvoices.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('invoices.invoice_id')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('common.amount')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingAgentInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs md:text-sm whitespace-nowrap">{inv.date}</TableCell>
                        <TableCell className="font-medium text-primary text-xs md:text-sm whitespace-nowrap">{inv.id}</TableCell>
                        <TableCell className="font-bold text-xs md:text-sm whitespace-nowrap">{formatCurrency(inv.total)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={inv.status === 'Paid' ? 'success' : 'outline'} className="text-[10px]">
                            {t(`invoices.${inv.status.toLowerCase()}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm italic border-2 border-dashed rounded-lg bg-slate-50">
                {t('bookingAgents.no_invoices')}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setIsHistoryModalOpen(false)} className="h-11 md:h-10 w-full sm:w-auto">
              {t('common.close') || 'Close'}
            </Button>
          </div>
        </div>
      </Modal>

      <AlertDialog 
        isOpen={isDeleteAlertOpen}
        onClose={() => setIsDeleteAlertOpen(false)}
        onConfirm={confirmDelete}
        title={t('bookingAgents.delete_title')}
        description={t('bookingAgents.delete_description')}
        confirmText={t('common.delete')}
        variant="destructive"
      />
    </div>
  );
}
