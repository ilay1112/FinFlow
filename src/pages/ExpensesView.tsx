import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Plus, 
  Search, 
  Download,
  Trash2,
  Edit2,
  Eye,
  ExternalLink,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Upload,
  Settings2,
  Filter
} from 'lucide-react';
import { useFinance, type Expense } from '../context/FinanceContext';
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

const SortIcon = ({ column, sortConfig }: { column: SortKey; sortConfig: { key: SortKey; direction: SortDirection } }) => {
  if (sortConfig.key !== column) return <ArrowUpDown className="ms-2 h-4 w-4" />;
  return sortConfig.direction === 'asc' ? <ArrowUp className="ms-2 h-4 w-4" /> : <ArrowDown className="ms-2 h-4 w-4" />;
};

export default function ExpensesView() {
  const { t, i18n } = useTranslation();
  const { expenses, categories, addExpense, updateExpense, deleteExpense, addCategory, deleteCategory, uploadReceipt } = useFinance();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
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
    isTaxDeductible: true,
    receiptStatus: 'Missing' as 'Uploaded' | 'Missing',
    receiptName: '',
    receiptUrl: ''
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
      setFormData({
        date: expense.date,
        vendor: expense.vendor,
        category: expense.category,
        amount: expense.amount.toString(),
        isTaxDeductible: expense.isTaxDeductible,
        receiptStatus: expense.receiptStatus,
        receiptName: expense.receiptName || '',
        receiptUrl: expense.receiptUrl || ''
      });
    } else {
      setEditingExpense(null);
      const defaultCategory = categories.length > 0 ? categories[0] : 'Other';
      setFormData({
        date: new Date().toISOString().split('T')[0],
        vendor: '',
        category: defaultCategory,
        amount: '',
        isTaxDeductible: true,
        receiptStatus: 'Missing',
        receiptName: '',
        receiptUrl: ''
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

    const data = {
      ...formData,
      amount,
    };

    let expenseId = editingExpense?.id;
    try {
      if (editingExpense) {
        updateExpense(editingExpense.id, data);
      } else {
        expenseId = uuidv4();
        addExpense({ ...data, id: expenseId } as Expense);
      }

      // Close modal immediately for better UX
      setIsModalOpen(false);

      if (selectedFile && expenseId) {
        console.log('Uploading receipt...');
        // We don't await here to let the modal close immediately
        // but FinanceContext will still track the 'isSyncing' state
        uploadReceipt(selectedFile, expenseId);
      }

      setSelectedFile(null);
      console.log('Expense saved successfully');
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const exportToCSV = () => {
    const headers = [t('common.date'), t('expenses.vendor'), t('expenses.category'), t('common.amount'), t('expenses.tax_deductible'), t('expenses.receipt')];
    const rows = filteredExpenses.map(e => [
      e.date,
      e.vendor,
      e.category,
      e.amount,
      e.isTaxDeductible ? 'Yes' : 'No',
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

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
      style: 'currency', 
      currency: 'ILS' 
    }).format(value);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="bg-white border-s-4 border-s-primary">
          <CardContent className="pt-4 md:pt-6">
            <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('dashboard.total_expenses')}</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">{formatCurrency(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('common.total')}: {filteredExpenses.length}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-white border-s-4 border-s-green-500">
          <CardContent className="pt-4 md:pt-6">
            <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('expenses.tax_deductible')}</p>
            <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-2">
              {formatCurrency(filteredExpenses.filter(e => e.isTaxDeductible).reduce((sum, e) => sum + e.amount, 0))}
            </p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1">{t('expenses.tax_deductible')}</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-s-4 border-s-amber-500 sm:col-span-2 md:col-span-1">
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
        <div className="space-y-4">
          <div className="aspect-[3/4] w-full bg-slate-50 rounded-lg border overflow-hidden relative group">
            {viewingReceipt?.receiptUrl ? (
              <>
                {/* 
                  We use the Google Docs Viewer with the 'srcid' parameter for maximum compatibility.
                  The URL extraction logic finds the file ID from the webViewLink.
                */}
                {(() => {
                  const fileId = viewingReceipt.receiptUrl.match(/\/d\/(.+?)\//)?.[1];
                  if (fileId) {
                    return (
                      <iframe 
                        src={`https://drive.google.com/file/d/${fileId}/preview`}
                        className="w-full h-full border-none"
                        title={viewingReceipt.receiptName}
                        allow="autoplay"
                      />
                    );
                  }
                  return (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <FileText className="h-16 w-16 text-slate-300 mb-4" />
                      <p className="text-sm text-slate-500">Preview not available for this link format.</p>
                      <Button asChild variant="outline" size="sm" className="mt-4">
                        <a href={viewingReceipt.receiptUrl} target="_blank" rel="noopener noreferrer">
                          Open Directly <ExternalLink className="ms-2 h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  );
                })()}
                
                {/* Overlay Action Button (Visible on Hover for easier direct access) */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button asChild size="sm" variant="secondary" className="shadow-lg backdrop-blur-md bg-white/80">
                    <a href={viewingReceipt.receiptUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
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
            {viewingReceipt?.receiptUrl && (
              <Button asChild className="gap-2 h-11 md:h-10 order-1 sm:order-2 font-bold">
                <a href={viewingReceipt.receiptUrl} download={viewingReceipt.receiptName}>
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
        title={editingExpense ? t('expenses.edit_expense') : t('expenses.add_expense')}
      >
        <div className="max-h-[80vh] md:max-h-[85vh] overflow-y-auto px-1 scrollbar-hide">
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
                onChange={(e) => setFormData({...formData, category: e.target.value})}
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

            <div className="flex items-center gap-2 py-2">
              <input 
                type="checkbox" 
                id="deductible" 
                checked={formData.isTaxDeductible}
                onChange={(e) => setFormData({...formData, isTaxDeductible: e.target.checked})}
                className="h-5 w-5 md:h-4 md:w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <label htmlFor="deductible" className="text-sm font-medium text-slate-700 select-none">
                {t('expenses.tax_deductible')}
              </label>
            </div>

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
