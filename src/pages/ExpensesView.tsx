import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrencyFormatter } from '../utils/format';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Download,
  Trash2,
  Edit2,
  Eye,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Upload,
  Settings2,
  Filter,
  Loader2
} from 'lucide-react';
import { useFinance, type Expense, type VatDeductibility } from '../context/FinanceContext';
import { authService } from '../services/auth';
import { downloadDriveFileBlob, extractDriveFileId } from '../services/googleDrive';
import { getVatRate } from '../config/taxConfig';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { AlertDialog } from '../components/ui/AlertDialog';
import { CategoryManagerModal } from '../components/ui/CategoryManagerModal';
import { cn } from '../utils/utils';
import { v4 as uuidv4 } from 'uuid';

type SortKey = 'date' | 'vendor' | 'category' | 'amount';
type SortDirection = 'asc' | 'desc';

/**
 * Suggest an input-VAT deductibility class from the expense category (§6, §7).
 * Vehicles/travel → two_thirds (1/3 private); entertainment/hospitality → none.
 * Always user-overridable — this is only the default the form pre-selects.
 */
const suggestDeductibility = (category: string): VatDeductibility => {
  const c = category.toLowerCase();
  if (c.includes('vehicle') || c.includes('travel') || c.includes('רכב') || c.includes('נסיע')) {
    return 'two_thirds';
  }
  if (
    c.includes('entertainment') ||
    c.includes('hospitality') ||
    c.includes('כיבוד') ||
    c.includes('אירוח')
  ) {
    return 'none';
  }
  return 'full';
};

const SortIcon = ({ column, sortConfig }: { column: SortKey; sortConfig: { key: SortKey; direction: SortDirection } }) => {
  if (sortConfig.key !== column) return <ArrowUpDown className="ms-2 h-4 w-4" />;
  return sortConfig.direction === 'asc' ? <ArrowUp className="ms-2 h-4 w-4" /> : <ArrowDown className="ms-2 h-4 w-4" />;
};

export default function ExpensesView() {
  const { t, i18n } = useTranslation();
  const { expenses, categories, addExpense, updateExpense, deleteExpense, addCategory, deleteCategory, uploadReceipt, businessSettings } = useFinance();
  // Input-VAT capture only matters for a VAT-registered business; an Osek Patur
  // pays no VAT and never reclaims input VAT, so the fields are hidden for them.
  const showVatFields = businessSettings.type !== 'EsekPatur';
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Expense | null>(null);
  // Authenticated receipt preview state. Since F-1 made receipts owner-private, the
  // cookie-auth drive.google.com iframe fails for a browser whose default Google
  // account differs from the FinFlow account. We download the bytes with the FinFlow
  // token and render from a same-origin object URL instead (handles image + PDF).
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; isPdf: boolean } | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewError, setReceiptPreviewError] = useState(false);
  const [isNewReceiptAction, setIsNewReceiptAction] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch the receipt bytes authenticated whenever a receipt is opened, and render from
  // an object URL. The URL is revoked when the preview changes or the component unmounts.
  useEffect(() => {
    const url = viewingReceipt?.receiptUrl;
    if (!url) {
      setReceiptPreview(null);
      setReceiptPreviewError(false);
      setReceiptPreviewLoading(false);
      return;
    }

    const fileId = extractDriveFileId(url);
    if (!fileId) {
      setReceiptPreview(null);
      setReceiptPreviewError(true);
      setReceiptPreviewLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setReceiptPreview(null);
    setReceiptPreviewError(false);
    setReceiptPreviewLoading(true);

    (async () => {
      try {
        const token = await authService.getValidAccessToken();
        const blob = await downloadDriveFileBlob(token, fileId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setReceiptPreview({ url: objectUrl, isPdf: blob.type === 'application/pdf' });
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load receipt preview:', error);
        setReceiptPreviewError(true);
      } finally {
        if (!cancelled) setReceiptPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [viewingReceipt?.receiptUrl]);

  // Handle URL actions (Quick Actions from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action === 'new' || action === 'upload') {
      const isUpload = action === 'upload';
      setIsNewReceiptAction(isUpload);
      handleOpenModal();
      
      if (isUpload) {
        // Increased delay to ensure modal and its refs are fully stable before click
        setTimeout(() => {
          fileInputRef.current?.click();
        }, 500);
      }

      // Remove the parameter after opening
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ 
    key: 'date', 
    direction: 'desc' 
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const isRtl = i18n.language === 'he';

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    category: '',
    amount: '',
    receiptStatus: 'Missing' as 'Uploaded' | 'Missing',
    receiptName: '',
    receiptUrl: '',
    // Input-VAT fields (Osek Murshe). `amount` stays gross; these capture the split
    // and deductibility so the VAT report can claim input VAT (§3.1).
    hasValidTaxInvoice: false,
    vatDeductibility: 'full' as VatDeductibility,
    supplierAllocationNumber: ''
  });

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredExpenses = expenses
    .filter(e => {
      const matchesSearch = e.vendor.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           e.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || e.category === categoryFilter;
      
      const expenseDate = new Date(e.date);
      const matchesStartDate = !startDate || expenseDate >= new Date(startDate);
      const matchesEndDate = !endDate || expenseDate <= new Date(endDate);
      
      return matchesSearch && matchesCategory && matchesStartDate && matchesEndDate;
    })
    .sort((a, b) => {
      const factor = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'amount') {
        return (a.amount - b.amount) * factor;
      }
      return (a[sortConfig.key] as string).localeCompare(b[sortConfig.key] as string) * factor;
    });

  const handleOpenModal = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      setIsNewReceiptAction(false);
      setFormData({
        date: expense.date,
        vendor: expense.vendor,
        category: expense.category,
        amount: expense.amount.toString(),
        receiptStatus: expense.receiptStatus,
        receiptName: expense.receiptName || '',
        receiptUrl: expense.receiptUrl || '',
        // §8 read-time defaults: legacy rows default to non-claimable until confirmed.
        hasValidTaxInvoice: expense.hasValidTaxInvoice ?? false,
        vatDeductibility: expense.vatDeductibility ?? 'none',
        supplierAllocationNumber: expense.supplierAllocationNumber || ''
      });
    } else {
      setEditingExpense(null);
      // isNewReceiptAction is handled by the useEffect for URL actions, 
      // but if opened via the '+' button, it should be false.
      if (!isNewReceiptAction) setIsNewReceiptAction(false); 
      
      const defaultCategory = categories.length > 0 ? categories[0] : 'Other';
      setFormData({
        date: new Date().toISOString().split('T')[0],
        vendor: '',
        category: defaultCategory,
        amount: '',
        receiptStatus: 'Missing',
        receiptName: '',
        receiptUrl: '',
        hasValidTaxInvoice: false,
        vatDeductibility: suggestDeductibility(defaultCategory),
        supplierAllocationNumber: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenDeleteAlert = (id: string) => {
    setExpenseToDelete(id);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    if (expenseToDelete) {
      // 6a — deleting an expense also removes its receipt file from Drive
      // (in deleteExpense). Receipts/vouchers are subject to the 7-year retention
      // rule; this destructive action is intentionally kept available for now
      // (lower stakes than issued tax documents) but is gated behind this confirm,
      // which warns about the irreversible deletion of the retained receipt.
      await deleteExpense(expenseToDelete);
      setExpenseToDelete(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting expense:', formData);

    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) {
      console.error('Invalid amount');
      return;
    }

    // Derive the net/VAT split from the gross `amount` at the rate effective on the
    // expense date (§3.1 single source of truth — UI just persists the inputs the
    // calc module needs). For a non-VAT-registered business no split is stored.
    const rate = showVatFields ? getVatRate(formData.date) : 0;
    const vatRate = showVatFields ? rate : undefined;
    const netAmount = showVatFields && rate > 0 ? amount / (1 + rate / 100) : undefined;
    const vatAmount =
      showVatFields && netAmount !== undefined ? amount - netAmount : undefined;

    const data: Omit<Expense, 'id'> = {
      date: formData.date,
      vendor: formData.vendor,
      category: formData.category,
      amount,
      receiptStatus: formData.receiptStatus,
      receiptName: formData.receiptName,
      receiptUrl: formData.receiptUrl,
      // Input-VAT fields are only persisted for a VAT-registered business; an Osek
      // Patur leaves them undefined (the calc module never infers a claim, §3.1/§8).
      ...(showVatFields
        ? {
            vatRate,
            netAmount,
            vatAmount,
            hasValidTaxInvoice: formData.hasValidTaxInvoice,
            vatDeductibility: formData.vatDeductibility,
            supplierAllocationNumber: formData.supplierAllocationNumber.trim() || undefined,
          }
        : {}),
    };

    let expenseId = editingExpense?.id;
    try {
      if (editingExpense) {
        updateExpense(editingExpense.id, data);
      } else {
        expenseId = uuidv4();
        const newExpense: Omit<Expense, 'id'> & { id: string } = { ...data, id: expenseId };
        addExpense(newExpense);
      }

      // Close modal immediately for better UX
      setIsModalOpen(false);

      if (selectedFile && expenseId) {
        console.log('Uploading receipt...');
        // Pass metadata directly to avoid state sync race conditions
        uploadReceipt(selectedFile, expenseId, {
          vendor: formData.vendor,
          date: formData.date
        });
      }

      setSelectedFile(null);
      console.log('Expense saved successfully');
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const exportToCSV = () => {
    const headers = [t('common.date'), t('expenses.vendor'), t('expenses.category'), t('common.amount'), t('expenses.receipt')];
    const rows = filteredExpenses.map(e => [
      e.date,
      e.vendor,
      e.category,
      e.amount,
      e.receiptStatus
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFormData(prev => ({ 
        ...prev, 
        receiptStatus: 'Uploaded', 
        receiptName: file.name
      }));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setFormData(prev => ({ 
        ...prev, 
        receiptStatus: 'Uploaded', 
        receiptName: file.name
      }));
    }
  };

  const formatCurrency = useCurrencyFormatter();

  return (
    <div className="space-y-6 px-1 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('expenses.title')}</h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">{t('expenses.subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="grid grid-cols-2 sm:flex gap-2">
            <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)} className="h-11 md:h-10 text-xs sm:text-sm">
              <Settings2 className="h-4 w-4 me-2" /> {t('expenses.manage_categories')}
            </Button>
            <Button variant="outline" onClick={exportToCSV} className="h-11 md:h-10 text-xs sm:text-sm">
              <Download className="h-4 w-4 me-2" /> {t('expenses.export_csv')}
            </Button>
          </div>
          <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto h-11 md:h-10 font-bold">
            <Plus className="h-5 w-5 md:h-4 md:w-4 me-2" /> {t('expenses.add_expense')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card className="bg-white border-s-4 border-s-primary">
          <CardContent className="pt-4 md:pt-6">
            <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('dashboard.total_expenses')}</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">{formatCurrency(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('common.total')}: {filteredExpenses.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-s-4 border-s-amber-500">
          <CardContent className="pt-4 md:pt-6">
            <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('expenses.missing_receipts')}</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">
              {filteredExpenses.filter(e => e.receiptStatus === 'Missing').length}
            </p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('expenses.missing_receipts')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="space-y-4">
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
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
              <Filter className="h-4 w-4 text-slate-400 shrink-0" />
              <Button 
                variant={categoryFilter === 'All' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setCategoryFilter('All')}
                className="h-9 md:h-8 whitespace-nowrap text-xs font-medium px-4"
              >
                {t('common.all')}
              </Button>
              {categories.map(cat => (
                <Button 
                  key={cat} 
                  variant={categoryFilter === cat ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setCategoryFilter(cat)}
                  className="h-9 md:h-8 whitespace-nowrap text-xs font-medium px-4"
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleSort('date')} className="cursor-pointer hover:text-slate-900 whitespace-nowrap">
                    <div className="flex items-center">{t('common.date')} <SortIcon column="date" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('vendor')} className="cursor-pointer hover:text-slate-900 whitespace-nowrap">
                    <div className="flex items-center">{t('expenses.vendor')} <SortIcon column="vendor" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('category')} className="cursor-pointer hover:text-slate-900 whitespace-nowrap">
                    <div className="flex items-center">{t('expenses.category')} <SortIcon column="category" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort('amount')} className="cursor-pointer hover:text-slate-900 whitespace-nowrap">
                    <div className="flex items-center">{t('common.amount')} <SortIcon column="amount" sortConfig={sortConfig} /></div>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">{t('expenses.receipt')}</TableHead>
                  <TableHead className="text-end whitespace-nowrap">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium whitespace-nowrap">{expense.date}</TableCell>
                      <TableCell className="whitespace-nowrap">{expense.vendor}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="secondary">{expense.category}</Badge>
                      </TableCell>
                      <TableCell className="font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(expense.amount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={expense.receiptStatus === 'Uploaded' ? 'success' : 'warning'}>
                          {expense.receiptStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end whitespace-nowrap">
                        <div className="flex justify-end gap-1">
                          {expense.receiptStatus === 'Uploaded' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-blue-500"
                              onClick={() => setViewingReceipt(expense)}
                              title={t('expenses.view_receipt')}
                            >
                              <Eye className="h-5 w-5 md:h-4 md:w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-primary"
                            onClick={() => handleOpenModal(expense)}
                            title={t('common.edit')}
                          >
                            <Edit2 className="h-5 w-5 md:h-4 md:w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-10 w-10 md:h-8 md:w-8 text-red-400 hover:text-red-600"
                            onClick={() => handleOpenDeleteAlert(expense.id)}
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
                    <TableCell colSpan={6} className="h-24 text-center text-slate-500">
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
        title={t('common.delete')}
        description={t('expenses.delete_description')}
        confirmText={t('common.delete')}
        variant="destructive"
      />

      {/* Receipt Preview Modal */}
      <Modal
        isOpen={!!viewingReceipt}
        onClose={() => setViewingReceipt(null)}
        title={`${t('expenses.receipt')}: ${viewingReceipt?.vendor}`}
      >
        <div className="space-y-4 touch-pan-y overflow-x-hidden">
          <div className="aspect-[3/4] w-full bg-slate-50 rounded-lg border overflow-hidden relative group">
            {viewingReceipt?.receiptUrl ? (
              <>
                {/*
                  F-1 follow-up: receipts are owner-private, so the bytes are fetched with
                  the FinFlow access token (see effect above) and rendered from a same-origin
                  object URL — a PDF in an iframe, an image in an <img>.
                */}
                {receiptPreviewLoading ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Loader2 className="h-10 w-10 mb-4 animate-spin" />
                    <p className="text-sm">{t('expenses.loading_receipt')}</p>
                  </div>
                ) : receiptPreviewError || !receiptPreview ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <FileText className="h-16 w-16 text-slate-300 mb-4" />
                    <p className="text-sm text-slate-500">{t('expenses.receipt_load_error')}</p>
                  </div>
                ) : receiptPreview.isPdf ? (
                  <iframe
                    src={receiptPreview.url}
                    className="w-full h-full border-none"
                    title={viewingReceipt.receiptName}
                  />
                ) : (
                  <img
                    src={receiptPreview.url}
                    className="w-full h-full object-contain"
                    alt={viewingReceipt.receiptName || t('expenses.receipt')}
                  />
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <FileText className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-sm font-medium">{viewingReceipt?.receiptName || 'receipt_sample.pdf'}</p>
                <p className="text-xs mt-2 italic">(Preview not available for mock data)</p>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-sm p-3 bg-slate-50 rounded-lg border">
            <div>
              <p className="text-slate-500">{t('common.amount')}</p>
              <p className="font-bold text-slate-900">{viewingReceipt ? formatCurrency(viewingReceipt.amount) : ''}</p>
            </div>
            <div>
              <p className="text-slate-500 text-end">{t('common.date')}</p>
              <p className="font-medium text-slate-900">{viewingReceipt?.date}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setViewingReceipt(null)} className="h-11 md:h-10 order-2 sm:order-1">
              {t('common.cancel')}
            </Button>
            {viewingReceipt?.receiptUrl && receiptPreview && (
              <Button asChild className="gap-2 h-11 md:h-10 order-1 sm:order-2 font-bold">
                <a href={receiptPreview.url} download={viewingReceipt.receiptName}>
                  <Download className="h-4 w-4" />
                  {t('expenses.download_receipt')}
                </a>
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Category Manager Modal */}
      <CategoryManagerModal 
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onAdd={addCategory}
        onDelete={deleteCategory}
      />

      {/* Add/Edit Expense Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={
          editingExpense 
            ? t('expenses.edit_expense') 
            : isNewReceiptAction 
              ? t('dashboard.new_receipt') 
              : t('expenses.add_expense')
        }
      >
        <div className="max-h-[80vh] md:max-h-[85vh] overflow-y-auto overflow-x-hidden touch-pan-y px-1 scrollbar-hide">
          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('common.date')}</label>
                <Input 
                  type="date" 
                  required 
                  className="h-11 md:h-10"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('common.amount')} ({t('common.currency')})</label>
                <Input 
                  type="number" 
                  step="0.01" 
                  placeholder="0.00" 
                  required 
                  className="h-11 md:h-10"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('expenses.vendor')}</label>
              <Input 
                placeholder="e.g. Amazon, Google, etc." 
                required 
                className="h-11 md:h-10"
                value={formData.vendor}
                onChange={(e) => setFormData({...formData, vendor: e.target.value})}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('expenses.category')}</label>
              <select 
                className="flex h-11 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={formData.category}
                required
                onChange={(e) => setFormData({
                  ...formData,
                  category: e.target.value,
                  // Re-apply the deductibility assist when the category changes,
                  // unless the user already moved off the suggestion for the old one.
                  vatDeductibility:
                    formData.vatDeductibility === suggestDeductibility(formData.category)
                      ? suggestDeductibility(e.target.value)
                      : formData.vatDeductibility,
                })}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div 
              className={cn(
                "p-6 md:p-8 border-2 border-dashed rounded-lg transition-colors flex flex-col items-center justify-center text-center cursor-pointer",
                dragActive ? "border-primary bg-primary/5" : "border-slate-200 bg-slate-50 hover:bg-slate-100",
                formData.receiptStatus === 'Uploaded' && "border-green-500 bg-green-50"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                onChange={handleFileChange}
                accept="image/*,.pdf"
              />
              {formData.receiptStatus === 'Uploaded' ? (
                <>
                  <Badge variant="success" className="mb-2">{t('expenses.file_ready')}</Badge>
                  <p className="text-sm font-medium text-green-700 max-w-[200px] truncate">{formData.receiptName || 'Receipt uploaded'}</p>
                  <p className="text-xs text-green-600 mt-1">{isRtl ? 'לחץ להחלפה' : 'Click to replace'}</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-600">{t('expenses.drag_drop')}</p>
                  <p className="text-xs text-slate-400 mt-1">PDF, PNG, JPG (Max 5MB)</p>
                </>
              )}
            </div>

            {showVatFields && (() => {
              const rate = getVatRate(formData.date);
              const gross = parseFloat(formData.amount);
              const net = !isNaN(gross) && rate > 0 ? gross / (1 + rate / 100) : 0;
              const vat = !isNaN(gross) ? gross - net : 0;
              return (
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-700">{t('expenses.vat.section_title')}</p>
                    <span className="text-xs text-slate-400">{t('expenses.vat.rate_label', { rate })}</span>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={formData.hasValidTaxInvoice}
                      onChange={(e) => setFormData({ ...formData, hasValidTaxInvoice: e.target.checked })}
                    />
                    <span>
                      <span className="text-sm font-medium text-slate-700">{t('expenses.vat.has_tax_invoice')}</span>
                      <span className="block text-xs text-slate-400">{t('expenses.vat.has_tax_invoice_help')}</span>
                    </span>
                  </label>

                  {formData.hasValidTaxInvoice && (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-md bg-white border border-slate-200 p-2">
                          <p className="text-slate-400">{t('expenses.vat.net')}</p>
                          <p className="font-bold text-slate-900">{formatCurrency(net)}</p>
                        </div>
                        <div className="rounded-md bg-white border border-slate-200 p-2">
                          <p className="text-slate-400">{t('expenses.vat.vat')}</p>
                          <p className="font-bold text-slate-900">{formatCurrency(vat)}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">{t('expenses.vat.deductibility')}</label>
                        <select
                          className="flex h-11 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          value={formData.vatDeductibility}
                          onChange={(e) => setFormData({ ...formData, vatDeductibility: e.target.value as VatDeductibility })}
                        >
                          <option value="full">{t('expenses.vat.deductibility_full')}</option>
                          <option value="two_thirds">{t('expenses.vat.deductibility_two_thirds')}</option>
                          <option value="none">{t('expenses.vat.deductibility_none')}</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">{t('expenses.vat.supplier_allocation')}</label>
                        <Input
                          className="h-11 md:h-10"
                          placeholder={t('expenses.vat.supplier_allocation_placeholder')}
                          value={formData.supplierAllocationNumber}
                          onChange={(e) => setFormData({ ...formData, supplierAllocationNumber: e.target.value })}
                        />
                        <p className="text-xs text-slate-400">{t('expenses.vat.supplier_allocation_help')}</p>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="px-8 font-bold">
                {t('common.cancel')}
              </Button>
              <Button type="submit" className="px-8 font-bold">
                {editingExpense ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
