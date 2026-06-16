import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import * as googleDrive from '../services/googleDrive';

export type BusinessType = 'EsekPatur' | 'EsekMorshe' | 'Company';
export type DocumentType = 'TaxInvoice' | 'Receipt' | 'TaxInvoiceReceipt' | 'TransactionInvoice';

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
  bookingAgentId?: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  totalBilled: number;
}

export interface BookingAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  commissionRate: number;
  minCommission?: number;
  totalCommissions: number;
  totalPaid: number;
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
  bookingAgentId?: string;
  bookingAgentName?: string;
  commissionAmount?: number;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  taxRate: number;
  total: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Refunded';
  documentType?: DocumentType;
  pdfUrl?: string;
  sentAt?: string;
}

interface FinanceContextType {
  expenses: Expense[];
  clients: Client[];
  invoices: Invoice[];
  categories: string[];
  bookingAgents: BookingAgent[];
  taxRate: number;
  businessSettings: BusinessSettings;
  businesses: googleDrive.BusinessFolder[];
  activeBusiness: googleDrive.BusinessFolder | null;
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
  addBookingAgent: (agent: Omit<BookingAgent, 'id' | 'totalCommissions' | 'totalPaid'>) => BookingAgent;
  updateBookingAgent: (id: string, updates: Partial<BookingAgent>) => void;
  deleteBookingAgent: (id: string) => void;
  addInvoice: (invoice: Omit<Invoice, 'id' | 'total'>) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  addCategory: (category: string) => void;
  deleteCategory: (category: string) => void;
  setTaxRate: (rate: number) => void;
  updateBusinessSettings: (settings: BusinessSettings) => void;
  uploadReceipt: (file: File, expenseId: string, metadata?: { vendor: string; date: string }) => Promise<void>;
  switchBusiness: (businessId: string) => void;
  createBusiness: (name: string) => Promise<void>;
  deleteBusiness: (businessId: string) => Promise<void>;
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
  const [bookingAgents, setBookingAgents] = useState<BookingAgent[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [taxRate, setTaxRate] = useState<number>(20);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  
  const [businesses, setBusinesses] = useState<googleDrive.BusinessFolder[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<googleDrive.BusinessFolder | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const driveFileId = useRef<string | null>(null);
  const driveVersion = useRef<string | null>(null);
  const isInitialLoad = useRef(true);

  // Initial Load from LocalStorage (Fallback)
  useEffect(() => {
    const loadLocalData = () => {
      try {
        const savedExpenses = localStorage.getItem('finance_expenses');
        const savedCategories = localStorage.getItem('finance_categories');
        const savedClients = localStorage.getItem('finance_clients');
        const savedBookingAgents = localStorage.getItem('finance_booking_agents');
        const savedInvoices = localStorage.getItem('finance_invoices');
        const savedTaxRate = localStorage.getItem('finance_tax_rate');
        const savedSettings = localStorage.getItem('finance_business_settings');
        const savedActiveBusiness = localStorage.getItem('finance_active_business');

        if (savedExpenses) setExpenses(JSON.parse(savedExpenses));
        if (savedCategories) setCategories(JSON.parse(savedCategories));
        if (savedClients) setClients(JSON.parse(savedClients));
        if (savedBookingAgents) setBookingAgents(JSON.parse(savedBookingAgents));
        if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
        if (savedTaxRate) setTaxRate(Number(savedTaxRate));
        if (savedSettings) setBusinessSettings(JSON.parse(savedSettings));
        if (savedActiveBusiness) setActiveBusiness(JSON.parse(savedActiveBusiness));
      } catch (error) {
        console.error('Failed to load finance data from localStorage:', error);
      }
    };

    requestAnimationFrame(loadLocalData);
  }, []);

  // Fetch Businesses on Auth
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      const initBusinesses = async () => {
        setIsLoading(true);
        try {
          let list = await googleDrive.listBusinesses(accessToken);
          if (list.length === 0) {
            // Force creation of default if none exist
            await googleDrive.initAppState(accessToken, 'My Business');
            list = await googleDrive.listBusinesses(accessToken);
          }
          setBusinesses(list);
          
          // Select active business
          const savedActive = localStorage.getItem('finance_active_business');
          let targetBusiness = list[0];
          if (savedActive) {
            const parsed = JSON.parse(savedActive);
            const found = list.find(b => b.id === parsed.id);
            if (found) targetBusiness = found;
          }
          
          setActiveBusiness(targetBusiness);
        } catch (error) {
          console.error('Failed to init businesses:', error);
          setSyncError('Failed to load businesses.');
          setIsLoading(false);
        }
      };
      initBusinesses();
    }
  }, [isAuthenticated, accessToken]);

  // Sync Data when Active Business Changes
  useEffect(() => {
    if (isAuthenticated && accessToken && activeBusiness) {
      const syncFromDrive = async () => {
        setIsLoading(true);
        try {
          const { fileId } = await googleDrive.initAppState(accessToken, activeBusiness.name);
          driveFileId.current = fileId;
          const driveData = await googleDrive.fetchAppState(accessToken, fileId);
          driveVersion.current = await googleDrive.getFileVersion(accessToken, fileId);

          setExpenses((driveData.expenses || []) as unknown as Expense[]);
          setCategories(driveData.categories || DEFAULT_CATEGORIES);
          setClients((driveData.clients || []) as unknown as Client[]);
          setBookingAgents((driveData.bookingAgents || []) as unknown as BookingAgent[]);
          setInvoices((driveData.invoices || []) as unknown as Invoice[]);
          setTaxRate(driveData.taxRate ?? 20);
          setBusinessSettings({
            ...DEFAULT_BUSINESS_SETTINGS,
            ...(driveData.businessSettings || {})
          } as BusinessSettings);
          
          localStorage.setItem('finance_active_business', JSON.stringify(activeBusiness));
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
  }, [activeBusiness, isAuthenticated, accessToken]);

  // Persistent LocalStorage and Auto-Save to Drive
  useEffect(() => {
    if (!activeBusiness) return;
    
    // Always save to localStorage as backup
    try {
      localStorage.setItem('finance_expenses', JSON.stringify(expenses));
      localStorage.setItem('finance_categories', JSON.stringify(categories));
      localStorage.setItem('finance_clients', JSON.stringify(clients));
      localStorage.setItem('finance_booking_agents', JSON.stringify(bookingAgents));
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
          const localState = { expenses, categories, clients, invoices, bookingAgents, taxRate, businessSettings };
          const { version, merged } = await googleDrive.saveAppStateGuarded(
            accessToken,
            driveFileId.current!,
            driveVersion.current,
            localState
          );
          driveVersion.current = version;

          // A concurrent write from another device was detected and merged in —
          // adopt the merged result so this device reflects the other's changes.
          if (merged) {
            setExpenses(merged.expenses);
            setCategories(merged.categories);
            setClients(merged.clients);
            setInvoices(merged.invoices);
            setBookingAgents(merged.bookingAgents || []);
          }
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
  }, [expenses, categories, clients, invoices, bookingAgents, taxRate, businessSettings, isAuthenticated, accessToken, activeBusiness]);

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

    if (expense?.bookingAgentId) {
      setBookingAgents(prev => prev.map(a => 
        a.id === expense.bookingAgentId ? { ...a, totalPaid: Math.max(0, (a.totalPaid || 0) - expense.amount) } : a
      ));
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

  const addBookingAgent = (agent: Omit<BookingAgent, 'id' | 'totalCommissions' | 'totalPaid'>) => {
    const newAgent = { ...agent, id: uuidv4(), totalCommissions: 0, totalPaid: 0 };
    setBookingAgents(prev => [...prev, newAgent]);
    return newAgent;
  };

  const updateBookingAgent = (id: string, updates: Partial<BookingAgent>) => {
    setBookingAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    if (updates.name) {
      setInvoices(prev => prev.map(inv => 
        inv.bookingAgentId === id ? { ...inv, bookingAgentName: updates.name! } : inv
      ));
    }
  };

  const deleteBookingAgent = (id: string) => {
    setBookingAgents(prev => prev.filter(a => a.id !== id));
  };

  const addInvoice = (invoice: Omit<Invoice, 'id' | 'total'>) => {
    const subtotal = invoice.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * (invoice.taxRate / 100);
    const total = subtotal + taxAmount;
    
    // Receipts get their own RCPT-XXXX sequence; everything else uses INV-XXXX
    const isReceipt = invoice.documentType === 'Receipt';
    const prefix = isReceipt ? 'RCPT' : 'INV';
    const prefixRe = isReceipt ? /^RCPT-(\d+)$/ : /^INV-(\d+)$/;
    const seed = isReceipt ? 0 : 3999;

    const nextNumber = invoices.reduce((max, inv) => {
      const match = inv.id.match(prefixRe);
      const num = match ? parseInt(match[1], 10) : 0;
      return num > max ? num : max;
    }, seed) + 1;

    const newInvoice = { ...invoice, id: `${prefix}-${String(nextNumber).padStart(4, '0')}`, total };
    
    setInvoices(prev => [newInvoice, ...prev]);
    setClients(prev => prev.map(c => 
      c.id === invoice.clientId ? { ...c, totalBilled: c.totalBilled + total } : c
    ));

    if (invoice.bookingAgentId && invoice.commissionAmount) {
      setBookingAgents(prev => prev.map(a => 
        a.id === invoice.bookingAgentId ? { ...a, totalCommissions: a.totalCommissions + invoice.commissionAmount! } : a
      ));
    }
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    let billedAdjustment = 0;
    let clientId = '';
    
    let oldAgentId = '';
    let oldCommission = 0;
    let newAgentId = '';
    let newCommission = 0;
    let hasAgentChange = false;
    let hasCommissionChange = false;

    setInvoices(prev => prev.map(inv => {
      if (inv.id === id) {
        const updated = { ...inv, ...updates };
        clientId = inv.clientId;
        
        oldAgentId = inv.bookingAgentId || '';
        oldCommission = inv.commissionAmount || 0;
        newAgentId = updated.bookingAgentId || '';
        newCommission = updated.commissionAmount || 0;
        
        if (oldAgentId !== newAgentId) {
          hasAgentChange = true;
        } else if (oldCommission !== newCommission) {
          hasCommissionChange = true;
        }

        // Recalculate total if items or taxRate changed
        const subtotal = updated.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const taxAmount = subtotal * (updated.taxRate / 100);
        updated.total = subtotal + taxAmount;

        // Handle totalBilled adjustment for clients
        if (inv.status !== 'Refunded' && updated.status === 'Refunded') {
          billedAdjustment = -updated.total;
        } else if (inv.status === 'Refunded' && updated.status !== 'Refunded') {
          billedAdjustment = updated.total;
        } else if (inv.total !== updated.total && updated.status !== 'Refunded') {
          billedAdjustment = updated.total - inv.total;
        }

        return updated;
      }
      return inv;
    }));

    if (billedAdjustment !== 0 && clientId) {
      setClients(prev => prev.map(c => 
        c.id === clientId ? { ...c, totalBilled: c.totalBilled + billedAdjustment } : c
      ));
    }

    if (hasAgentChange) {
      setBookingAgents(prev => prev.map(a => {
        if (a.id === oldAgentId) {
          return { ...a, totalCommissions: Math.max(0, a.totalCommissions - oldCommission) };
        }
        if (a.id === newAgentId) {
          return { ...a, totalCommissions: a.totalCommissions + newCommission };
        }
        return a;
      }));
    } else if (hasCommissionChange && oldAgentId) {
      const adjustment = newCommission - oldCommission;
      setBookingAgents(prev => prev.map(a => 
        a.id === oldAgentId ? { ...a, totalCommissions: a.totalCommissions + adjustment } : a
      ));
    }
  };

  const deleteInvoice = (id: string) => {
    const invoice = invoices.find(i => i.id === id);
    if (invoice) {
      if (invoice.status !== 'Refunded') {
        setClients(prev => prev.map(c => 
          c.id === invoice.clientId ? { ...c, totalBilled: Math.max(0, c.totalBilled - invoice.total) } : c
        ));
      }
      if (invoice.bookingAgentId && invoice.commissionAmount) {
        setBookingAgents(prev => prev.map(a => 
          a.id === invoice.bookingAgentId ? { ...a, totalCommissions: Math.max(0, a.totalCommissions - invoice.commissionAmount!) } : a
        ));
      }
    }
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
    if (!isAuthenticated || !accessToken || !activeBusiness) return;
    
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

      const url = await googleDrive.uploadReceiptToDrive(accessToken, file, uploadMetadata, activeBusiness.id);
      
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

  const switchBusiness = (businessId: string) => {
    const target = businesses.find(b => b.id === businessId);
    if (target && target.id !== activeBusiness?.id) {
      // The useEffect listening to activeBusiness will handle the fetching
      setActiveBusiness(target);
    }
  };

  const createBusiness = async (name: string) => {
    if (!isAuthenticated || !accessToken) return;
    setIsLoading(true);
    try {
      const { folderId } = await googleDrive.initAppState(accessToken, name);
      // Re-fetch businesses list to get the new folder
      const list = await googleDrive.listBusinesses(accessToken);
      setBusinesses(list);
      const newBusiness = list.find(b => b.id === folderId);
      if (newBusiness) {
        setActiveBusiness(newBusiness);
      }
    } catch (error) {
      console.error('Failed to create business:', error);
      setSyncError('Failed to create new business.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteBusiness = async (businessId: string) => {
    if (!isAuthenticated || !accessToken) return;
    setIsLoading(true);
    try {
      await googleDrive.deleteFile(accessToken, businessId);
      
      const updatedBusinesses = businesses.filter(b => b.id !== businessId);
      setBusinesses(updatedBusinesses);
      
      if (activeBusiness?.id === businessId) {
        if (updatedBusinesses.length > 0) {
          setActiveBusiness(updatedBusinesses[0]);
        } else {
          setActiveBusiness(null);
          // Reset state
          setExpenses([]);
          setClients([]);
          setBookingAgents([]);
          setInvoices([]);
          setBusinessSettings(DEFAULT_BUSINESS_SETTINGS);
          localStorage.removeItem('finance_active_business');
        }
      }
    } catch (error) {
      console.error('Failed to delete business:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <FinanceContext.Provider value={{ 
      expenses, clients, invoices, categories, bookingAgents, taxRate, businessSettings,
      businesses, activeBusiness,
      isLoading, isSyncing, isInitialized, syncError,
      addExpense, updateExpense, deleteExpense, addClient, updateClient, deleteClient, 
      addBookingAgent, updateBookingAgent, deleteBookingAgent,
      addInvoice, updateInvoice, deleteInvoice, addCategory, deleteCategory, 
      setTaxRate: setTaxRateHandler, updateBusinessSettings, uploadReceipt,
      switchBusiness, createBusiness, deleteBusiness
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
