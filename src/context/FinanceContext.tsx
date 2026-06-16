import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import * as googleDrive from '../services/googleDrive';
import { computeTotals, allocateInvoiceId, seedDocCounters } from '../utils/invoiceMath';

export type BusinessType = 'EsekPatur' | 'EsekMorshe' | 'Company';
export type DocumentType = 'TaxInvoice' | 'Receipt' | 'TaxInvoiceReceipt' | 'TransactionInvoice';

/** How the customer paid for the document. */
export type PaymentMethod = 'Cash' | 'Digital' | 'Card' | 'BankWire';

export interface BusinessSettings {
  name: string;
  idNumber: string;
  address: string;
  phone: string;
  email: string;
  type: BusinessType;
  /**
   * Persisted, monotonic gapless counter per legal document type (1a). The next
   * document of a given type is `(docCounters[type] ?? 0) + 1` — never derived
   * from the invoices array, so a delete/cancel never frees a number and a Drive
   * sync race can't double-allocate (the increment goes through the same
   * optimistic-concurrency save guard as every other state change).
   */
  docCounters?: Partial<Record<DocumentType, number>>;
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
  /** Israeli tax ID (ע.מ / ח.פ / ת.ז). Required on tax invoices for business customers. */
  idNumber?: string;
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
  /** Snapshot of the customer's tax ID at issue time (1b) — never re-derived from the client record. */
  clientIdNumber?: string;
  bookingAgentId?: string;
  bookingAgentName?: string;
  commissionAmount?: number;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  taxRate: number;
  total: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Refunded' | 'Cancelled';
  documentType?: DocumentType;
  /** How the customer paid. Optional for backward-compat with pre-field invoices. */
  paymentMethod?: PaymentMethod;
  pdfUrl?: string;
  sentAt?: string;
  /**
   * ISO timestamp of the first time a PDF was generated for this document (download
   * or send). Drives the legal מקור / העתק designation: the first issue is the
   * original, every later one is a copy.
   */
  firstIssuedAt?: string;
  /**
   * Israeli allocation number (מספר הקצאה) from the ITA, legally required on a tax
   * invoice at/above the dated threshold for the buyer to deduct input VAT.
   *
   * There is no backend, so this is captured manually (INTERIM flow): the issuer
   * obtains the number from the ITA portal and enters it on the invoice form. A
   * future server-side integration can populate it automatically at issue time.
   */
  allocationNumber?: string;
}

interface FinanceContextType {
  expenses: Expense[];
  clients: Client[];
  invoices: Invoice[];
  categories: string[];
  bookingAgents: BookingAgent[];
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
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  
  const [businesses, setBusinesses] = useState<googleDrive.BusinessFolder[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<googleDrive.BusinessFolder | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const driveFileId = useRef<string | null>(null);
  const driveVersion = useRef<string | null>(null);
  // Id of the workspace whose data is currently loaded into state. Persistence is
  // gated on this matching activeBusiness, so during a workspace switch we never
  // write the previous workspace's data into the new workspace's app_data.json.
  const loadedBusinessId = useRef<string | null>(null);

  // Initial Load from LocalStorage (Fallback)
  useEffect(() => {
    const loadLocalData = () => {
      try {
        const savedExpenses = localStorage.getItem('finance_expenses');
        const savedCategories = localStorage.getItem('finance_categories');
        const savedClients = localStorage.getItem('finance_clients');
        const savedBookingAgents = localStorage.getItem('finance_booking_agents');
        const savedInvoices = localStorage.getItem('finance_invoices');
        const savedSettings = localStorage.getItem('finance_business_settings');
        const savedActiveBusiness = localStorage.getItem('finance_active_business');

        if (savedExpenses) setExpenses(JSON.parse(savedExpenses));
        if (savedCategories) setCategories(JSON.parse(savedCategories));
        if (savedClients) setClients(JSON.parse(savedClients));
        if (savedBookingAgents) setBookingAgents(JSON.parse(savedBookingAgents));
        if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
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

          const loadedInvoices = (driveData.invoices || []) as unknown as Invoice[];
          setExpenses((driveData.expenses || []) as unknown as Expense[]);
          setCategories(driveData.categories || DEFAULT_CATEGORIES);
          setClients((driveData.clients || []) as unknown as Client[]);
          setBookingAgents((driveData.bookingAgents || []) as unknown as BookingAgent[]);
          setInvoices(loadedInvoices);
          const loadedSettings = {
            ...DEFAULT_BUSINESS_SETTINGS,
            ...(driveData.businessSettings || {})
          } as BusinessSettings;
          // 1a migration: seed the gapless per-type counters from existing documents
          // the first time we load a workspace that predates them, so the next
          // document continues each series without reusing a number.
          setBusinessSettings({
            ...loadedSettings,
            docCounters: seedDocCounters(loadedInvoices, loadedSettings.docCounters),
          });
          
          localStorage.setItem('finance_active_business', JSON.stringify(activeBusiness));
          // Mark this workspace's data as loaded — only now is it safe to persist.
          loadedBusinessId.current = activeBusiness.id;
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
    // Skip persisting until the in-memory state actually belongs to the active
    // workspace. During a switch the previous workspace's data is still in state
    // until syncFromDrive finishes loading; persisting here would leak it into the
    // newly selected workspace's app_data.json (and localStorage cache).
    if (loadedBusinessId.current !== activeBusiness.id) return;

    // Always save to localStorage as backup
    try {
      localStorage.setItem('finance_expenses', JSON.stringify(expenses));
      localStorage.setItem('finance_categories', JSON.stringify(categories));
      localStorage.setItem('finance_clients', JSON.stringify(clients));
      localStorage.setItem('finance_booking_agents', JSON.stringify(bookingAgents));
      localStorage.setItem('finance_invoices', JSON.stringify(invoices));
      localStorage.setItem('finance_business_settings', JSON.stringify(businessSettings));
    } catch (storageError) {
      console.warn('Could not save finance data to localStorage', storageError);
    }

    // Save to Drive if authenticated
    if (isAuthenticated && accessToken && driveFileId.current) {
      const timer = setTimeout(async () => {
        setIsSyncing(true);
        try {
          const localState = { expenses, categories, clients, invoices, bookingAgents, businessSettings };
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
  }, [expenses, categories, clients, invoices, bookingAgents, businessSettings, isAuthenticated, accessToken, activeBusiness]);

  const addExpense = (expense: Omit<Expense, 'id'> & { id?: string }) => {
    const newExpense = { ...expense, id: expense.id || uuidv4() };
    setExpenses(prev => [newExpense, ...prev]);
    return newExpense;
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteExpense = async (id: string) => {
    // NOTE (6a / 7-year retention): this hard-deletes the expense and its Drive
    // receipt file. Receipts are retention-significant vouchers; deletion is kept
    // available for now (lower stakes than issued tax documents) but is gated
    // behind a confirm in the UI. If full compliance is required later, switch
    // this to a soft-retain/archive flow like issued invoices.
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
    const { total } = computeTotals(invoice.items, invoice.taxRate);

    // 1a — allocate the next gapless number from the persisted per-type counter,
    // never from the invoices array. Seed the counter from existing documents on
    // first use (defensive; the Drive load path also seeds on migration). The
    // updated counters are written into businessSettings so the increment is
    // persisted through the same optimistic-concurrency save guard, preventing a
    // concurrent device from double-allocating the same number.
    const counters = seedDocCounters(invoices, businessSettings.docCounters);
    const { id, counters: nextCounters } = allocateInvoiceId(counters, invoice.documentType);

    // For a TaxInvoice / TaxInvoiceReceipt whose pre-VAT subtotal is at/above the
    // dated allocation threshold (see getAllocationThreshold in src/config/taxConfig.ts),
    // an allocation number (מספר הקצאה) is legally required from the ITA. With no
    // backend, this is captured manually on the invoice form and flows through on the
    // `invoice` payload below. A future server-side integration can fetch it in real
    // time at this seam before the document is issued.

    const newInvoice: Invoice = { ...invoice, id, total };

    setInvoices(prev => [newInvoice, ...prev]);
    setBusinessSettings(prev => ({ ...prev, docCounters: nextCounters }));
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
        updated.total = computeTotals(updated.items, updated.taxRate).total;

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

  /**
   * 6a — issued tax documents (anything not in Draft) must be RETAINED (7-year
   * rule) and keep occupying their gapless sequence number, so they are never
   * hard-deleted: they transition to `Cancelled` instead. Only Drafts — which are
   * not yet legal documents — may be hard-removed.
   */
  const deleteInvoice = (id: string) => {
    const invoice = invoices.find(i => i.id === id);
    if (!invoice) return;

    // Reverse this document's contribution to client billing / agent commissions
    // unless it was already excluded (Refunded/Cancelled never counted).
    const alreadyExcluded = invoice.status === 'Refunded' || invoice.status === 'Cancelled';
    if (!alreadyExcluded) {
      setClients(prev => prev.map(c =>
        c.id === invoice.clientId ? { ...c, totalBilled: Math.max(0, c.totalBilled - invoice.total) } : c
      ));
      if (invoice.bookingAgentId && invoice.commissionAmount) {
        setBookingAgents(prev => prev.map(a =>
          a.id === invoice.bookingAgentId ? { ...a, totalCommissions: Math.max(0, a.totalCommissions - invoice.commissionAmount!) } : a
        ));
      }
    }

    if (invoice.status === 'Draft') {
      // Not a legal document yet — safe to hard-delete.
      setInvoices(prev => prev.filter(inv => inv.id !== id));
    } else {
      // Issued document — retain it, just mark it cancelled.
      setInvoices(prev => prev.map(inv =>
        inv.id === id ? { ...inv, status: 'Cancelled' } : inv
      ));
    }
  };

  const addCategory = (category: string) => {
    setCategories(prev => prev.includes(category) ? prev : [...prev, category]);
  };

  const deleteCategory = (category: string) => {
    setCategories(prev => prev.filter(c => c !== category));
  };

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
      expenses, clients, invoices, categories, bookingAgents, businessSettings,
      businesses, activeBusiness,
      isLoading, isSyncing, isInitialized, syncError,
      addExpense, updateExpense, deleteExpense, addClient, updateClient, deleteClient, 
      addBookingAgent, updateBookingAgent, deleteBookingAgent,
      addInvoice, updateInvoice, deleteInvoice, addCategory, deleteCategory, 
      updateBusinessSettings, uploadReceipt,
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
