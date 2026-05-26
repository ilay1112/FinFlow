import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type BusinessType = 'EsekPatur' | 'EsekMorshe' | 'Company';

export interface BusinessSettings {
  name: string;
  idNumber: string; // H.P or I.D
  address: string;
  phone: string;
  email: string;
  type: BusinessType;
}

export interface Expense {
  id: string;
  date: string;
  vendor: string;
  category: string; // Changed from union to string
  amount: number;
  isTaxDeductible: boolean;
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
  categories: string[]; // Dynamic categories
  taxRate: number;
  businessSettings: BusinessSettings;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addClient: (client: Omit<Client, 'id' | 'totalBilled'>) => void;
  updateClient: (id: string, updates: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  addInvoice: (invoice: Omit<Invoice, 'id' | 'total'>) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  addCategory: (category: string) => void; // New
  deleteCategory: (category: string) => void; // New
  setTaxRate: (rate: number) => void;
  updateBusinessSettings: (settings: BusinessSettings) => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const DEFAULT_CATEGORIES = ['Software', 'Rent', 'Supplies', 'Marketing', 'Utilities', 'Travel', 'Other'];

const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  name: 'John Doe Financials',
  idNumber: '123456789',
  address: 'Herzl 123, Tel Aviv',
  phone: '050-0000000',
  email: 'john@example.com',
  type: 'EsekPatur'
};

const INITIAL_EXPENSES: Expense[] = [
  { id: uuidv4(), date: '2026-05-01', vendor: 'Google Cloud', category: 'Software', amount: 150.00, isTaxDeductible: true, receiptStatus: 'Uploaded' },
  { id: uuidv4(), date: '2026-05-05', vendor: 'WeWork', category: 'Rent', amount: 1200.00, isTaxDeductible: true, receiptStatus: 'Uploaded' },
  { id: uuidv4(), date: '2026-05-10', vendor: 'Staples', category: 'Supplies', amount: 45.50, isTaxDeductible: true, receiptStatus: 'Missing' },
  { id: uuidv4(), date: '2026-05-15', vendor: 'Meta Ads', category: 'Marketing', amount: 500.00, isTaxDeductible: true, receiptStatus: 'Uploaded' },
  { id: uuidv4(), date: '2026-05-20', vendor: 'Starbucks', category: 'Travel', amount: 12.75, isTaxDeductible: false, receiptStatus: 'Missing' },
];

const INITIAL_CLIENTS: Client[] = [
  { id: uuidv4(), name: 'Acme Corp', email: 'billing@acme.com', phone: '555-0101', address: '123 Business Way, New York', totalBilled: 5000 },
  { id: uuidv4(), name: 'Global Tech', email: 'finance@globaltech.io', phone: '555-0202', address: '456 Innovation Dr, San Francisco', totalBilled: 12500 },
  { id: uuidv4(), name: 'Local Cafe', email: 'hello@localcafe.com', phone: '555-0303', address: '789 Main St, Anytown', totalBilled: 800 },
];

const INITIAL_INVOICES: Invoice[] = [
  { 
    id: 'INV-001', 
    clientId: INITIAL_CLIENTS[0].id, 
    clientName: 'Acme Corp',
    date: '2026-05-01', 
    dueDate: '2026-05-31', 
    items: [{ id: uuidv4(), description: 'Q2 Consulting', quantity: 1, unitPrice: 5000 }],
    taxRate: 0,
    total: 5000,
    status: 'Paid'
  },
  { 
    id: 'INV-002', 
    clientId: INITIAL_CLIENTS[1].id, 
    clientName: 'Global Tech',
    date: '2026-05-15', 
    dueDate: '2026-06-15', 
    items: [{ id: uuidv4(), description: 'Software Development', quantity: 40, unitPrice: 150 }],
    taxRate: 17,
    total: 7020,
    status: 'Sent'
  },
];

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('finance_expenses');
    return saved ? JSON.parse(saved) : INITIAL_EXPENSES;
  });

  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('finance_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('finance_clients');
    const parsed = saved ? JSON.parse(saved) : INITIAL_CLIENTS;
    return parsed.map((c: any) => ({ ...c, address: c.address || '' }));
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem('finance_invoices');
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });

  const [taxRate, setTaxRate] = useState<number>(() => {
    const saved = localStorage.getItem('finance_tax_rate');
    return saved ? Number(saved) : 20;
  });

  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(() => {
    const saved = localStorage.getItem('finance_business_settings');
    return saved ? JSON.parse(saved) : DEFAULT_BUSINESS_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('finance_expenses', JSON.stringify(expenses));
    localStorage.setItem('finance_categories', JSON.stringify(categories));
    localStorage.setItem('finance_clients', JSON.stringify(clients));
    localStorage.setItem('finance_invoices', JSON.stringify(invoices));
    localStorage.setItem('finance_tax_rate', taxRate.toString());
    localStorage.setItem('finance_business_settings', JSON.stringify(businessSettings));
  }, [expenses, categories, clients, invoices, taxRate, businessSettings]);

  const addExpense = (expense: Omit<Expense, 'id'>) => {
    const newExpense = { ...expense, id: uuidv4() };
    setExpenses(prev => [newExpense, ...prev]);
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deleteExpense = (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const addClient = (client: Omit<Client, 'id' | 'totalBilled'>) => {
    const newClient = { ...client, id: uuidv4(), totalBilled: 0 };
    setClients(prev => [...prev, newClient]);
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
    
    const newInvoice = { ...invoice, id: `INV-${Math.floor(1000 + Math.random() * 9000)}`, total };
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
    setCategories(prev => {
      if (prev.includes(category)) return prev;
      return [...prev, category];
    });
  };

  const deleteCategory = (category: string) => {
    setCategories(prev => prev.filter(c => c !== category));
  };

  const setTaxRateHandler = (rate: number) => {
    setTaxRate(rate);
  };

  const updateBusinessSettings = (settings: BusinessSettings) => {
    setBusinessSettings(settings);
  };

  return (
    <FinanceContext.Provider value={{ 
      expenses, clients, invoices, categories, taxRate, businessSettings,
      addExpense, updateExpense, deleteExpense, addClient, updateClient, deleteClient, 
      addInvoice, updateInvoice, deleteInvoice, addCategory, deleteCategory, 
      setTaxRate: setTaxRateHandler, updateBusinessSettings 
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
