import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import * as googleDrive from '../services/googleDrive';

export type BusinessType = 'EsekPatur' | 'EsekMorshe' | 'Company';

export interface BusinessSettings {
  name: string;
  idNumber: string;
  address: string;
  phone: string;
  email: string;
  type: BusinessType;
}

export interface Expense {
  id: string;
  date: string;
  vendor: string;
  category: string;
  amount: number;
  receiptStatus: 'Uploaded' | 'Missing';
  receiptName?: string;
  receiptUrl?: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalBilled: number;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  taxRate: number;
  total: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
}

interface FinanceContextType {
  expenses: Expense[];
  clients: Client[];
  invoices: Invoice[];
  categories: string[];
  taxRate: number;
  businessSettings: BusinessSettings;
  isLoading: boolean;
  isSyncing: boolean;
  isInitialized: boolean;
  syncError: string | null;
  addExpense: (expense: Omit<Expense, 'id'>) => Expense;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addClient: (client: Omit<Client, 'id' | 'totalBilled'>) => Client;
  updateClient: (id: string, updates: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  addInvoice: (invoice: Omit<Invoice, 'id' | 'total'>) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  addCategory: (category: string) => void;
  deleteCategory: (category: string) => void;
  setTaxRate: (rate: number) => void;
  updateBusinessSettings: (settings: BusinessSettings) => void;
  uploadReceipt: (file: File, expenseId: string, metadata?: { vendor: string; date: string }) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const DEFAULT_CATEGORIES = ['Software', 'Rent', 'Supplies', 'Marketing', 'Utilities', 'Travel', 'Other'];

const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  name: '',
  idNumber: '',
  address: '',
  phone: '',
  email: '',
  type: 'EsekPatur'
};

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accessToken, isAuthenticated } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [taxRate, setTaxRate] = useState<number>(20);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const driveFileId = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  // Initial Load from LocalStorage (Fallback)
  useEffect(() => {
    const loadLocalData = () => {
      try {
        const savedExpenses = localStorage.getItem('finance_expenses');
        const savedCategories = localStorage.getItem('finance_categories');
        const savedClients = localStorage.getItem('finance_clients');
        const savedInvoices = localStorage.getItem('finance_invoices');
        const savedTaxRate = localStorage.getItem('finance_tax_rate');
        const savedSettings = localStorage.getItem('finance_business_settings');

        if (savedExpenses) setExpenses(JSON.parse(savedExpenses));
        if (savedCategories) setCategories(JSON.parse(savedCategories));
        if (savedClients) setClients(JSON.parse(savedClients));
        if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
        if (savedTaxRate) setTaxRate(Number(savedTaxRate));
        if (savedSettings) setBusinessSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Failed to load finance data from localStorage:', error);
      }
    };

    requestAnimationFrame(loadLocalData);
  }, []);

  // Sync from Google Drive on Authentication
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      const syncFromDrive = async () => {
        setIsLoading(true);
        try {
          const fileId = await googleDrive.initAppState(accessToken);
          driveFileId.current = fileId;
          const driveData = await googleDrive.fetchAppState(accessToken, fileId);
          
          setExpenses((driveData.expenses || []) as unknown as Expense[]);
          setCategories(driveData.categories || DEFAULT_CATEGORIES);
          setClients((driveData.clients || []) as unknown as Client[]);
          setInvoices((driveData.invoices || []) as unknown as Invoice[]);
          setTaxRate(driveData.taxRate ?? 20);
          setBusinessSettings((driveData.businessSettings || DEFAULT_BUSINESS_SETTINGS) as unknown as BusinessSettings);
          
          isInitialLoad.current = false;
        } catch (error) {
          const err = error as Error;
          console.error('Drive Sync Error:', err);
          setSyncError(`Drive Sync Error: ${err.message || 'Unknown error'}`);
        } finally {
          setIsLoading(false);
          setIsInitialized(true);
        }
      };
      syncFromDrive();
    }
  }, [isAuthenticated, accessToken]);

  // Persistent LocalStorage and Auto-Save to Drive
  useEffect(() => {
    // Always save to localStorage as backup
    try {
      localStorage.setItem('finance_expenses', JSON.stringify(expenses));
      localStorage.setItem('finance_categories', JSON.stringify(categories));
      localStorage.setItem('finance_clients', JSON.stringify(clients));
      localStorage.setItem('finance_invoices', JSON.stringify(invoices));
      localStorage.setItem('finance_tax_rate', taxRate.toString());
      localStorage.setItem('finance_business_settings', JSON.stringify(businessSettings));
    } catch (storageError) {
      console.warn('Could not save finance data to localStorage', storageError);
    }

    // Save to Drive if authenticated and not during initial fetch
    if (isAuthenticated && accessToken && driveFileId.current && !isInitialLoad.current) {
      const timer = setTimeout(async () => {
        setIsSyncing(true);
        try {
          await googleDrive.saveAppState(accessToken, driveFileId.current!, {
            expenses, categories, clients, invoices, taxRate, businessSettings
          });
          setSyncError(null);
        } catch (error) {
          console.error('Drive Save Error:', error);
          setSyncError('Sync delayed: Network or quota issue. Data saved locally.');
        } finally {
          setIsSyncing(false);
        }
      }, 1000); // Debounce saves
      return () => clearTimeout(timer);
    }
  }, [expenses, categories, clients, invoices, taxRate, businessSettings, isAuthenticated, accessToken]);

  const addExpense = (expense: Omit<Expense, 'id'> & { id?: string }) => {
    const newExpense = { ...expense, id: expense.id || uuidv4() };
    setExpenses(prev => [newExpense, ...prev]);
    return newExpense;
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteExpense = async (id: string) => {
    const expense = expenses.find(e => e.id === id);
    if (expense?.receiptUrl && isAuthenticated && accessToken) {
      try {
        const fileId = expense.receiptUrl.match(/\/d\/(.+?)\//)?.[1];
        if (fileId) {
          await googleDrive.deleteFile(accessToken, fileId);
          console.log('Receipt file deleted from Drive');
        }
      } catch (error) {
        console.error('Failed to delete receipt file from Drive:', error);
      }
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const addClient = (client: Omit<Client, 'id' | 'totalBilled'>) => {
    const newClient = { ...client, id: uuidv4(), totalBilled: 0 };
    setClients(prev => [...prev, newClient]);
    return newClient;
  };

  const updateClient = (id: string, updates: Partial<Client>) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    if (updates.name) {
      setInvoices(prev => prev.map(inv => 
        inv.clientId === id ? { ...inv, clientName: updates.name! } : inv
      ));
    }
  };

  const deleteClient = (id: string) => {
    setClients(prev => prev.filter(c => c.id !== id));
  };

  const addInvoice = (invoice: Omit<Invoice, 'id' | 'total'>) => {
    const subtotal = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * (invoice.taxRate / 100);
    const total = subtotal + taxAmount;
    
    // Calculate next sequential ID based on currently synced invoices
    const nextNumber = invoices.reduce((max, inv) => {
      const match = inv.id.match(/\d+/);
      const num = match ? parseInt(match[0], 10) : 0;
      return num > max ? num : max;
    }, 3999) + 1;

    const newInvoice = { ...invoice, id: `INV-${nextNumber}`, total };
    
    setInvoices(prev => [newInvoice, ...prev]);
    setClients(prev => prev.map(c => 
      c.id === invoice.clientId ? { ...c, totalBilled: c.totalBilled + total } : c
    ));
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id === id) {
        const updated = { ...inv, ...updates };
        const subtotal = updated.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const taxAmount = subtotal * (updated.taxRate / 100);
        updated.total = subtotal + taxAmount;
        return updated;
      }
      return inv;
    }));
  };

  const deleteInvoice = (id: string) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  const addCategory = (category: string) => {
    setCategories(prev => prev.includes(category) ? prev : [...prev, category]);
  };

  const deleteCategory = (category: string) => {
    setCategories(prev => prev.filter(c => c !== category));
  };

  const setTaxRateHandler = (rate: number) => setTaxRate(rate);

  const updateBusinessSettings = (settings: BusinessSettings) => setBusinessSettings(settings);

  const uploadReceipt = async (file: File, expenseId: string, metadata?: { vendor: string; date: string }) => {
    if (!isAuthenticated || !accessToken) return;
    
    setIsSyncing(true);
    try {
      // Use provided metadata or fall back to finding in state
      let uploadMetadata = metadata;
      if (!uploadMetadata) {
        const expense = expenses.find(e => e.id === expenseId);
        uploadMetadata = {
          vendor: expense?.vendor || 'Unknown',
          date: expense?.date || new Date().toISOString().split('T')[0]
        };
      }

      const url = await googleDrive.uploadReceiptToDrive(accessToken, file, uploadMetadata);
      
      updateExpense(expenseId, { 
        receiptStatus: 'Uploaded', 
        receiptUrl: url,
        receiptName: file.name
      });
    } catch (error) {
      console.error('Receipt Upload Error:', error);
      setSyncError('Failed to upload receipt to Drive.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <FinanceContext.Provider value={{ 
      expenses, clients, invoices, categories, taxRate, businessSettings,
      isLoading, isSyncing, isInitialized, syncError,
      addExpense, updateExpense, deleteExpense, addClient, updateClient, deleteClient, 
      addInvoice, updateInvoice, deleteInvoice, addCategory, deleteCategory, 
      setTaxRate: setTaxRateHandler, updateBusinessSettings, uploadReceipt
    }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
