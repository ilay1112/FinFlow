import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import * as googleDrive from '../services/googleDrive';
import {
  computeTotals,
  allocateInvoiceId,
  seedDocCounters,
  recordsPayment,
  validatePayments,
  isAccountingDocument,
} from '../utils/invoiceMath';
import { getCashLimit } from '../config/taxConfig';
import { DEFAULT_BUSINESS_SETTINGS, DEFAULT_CATEGORIES } from '../config/defaults';
import { normalizeAppState } from '../utils/appStateSchema';
import { clearFinanceCache, FINANCE_PENDING_SAVE_KEY, FINANCE_PENDING_SHARDS_KEY } from '../utils/financeCache';
import { authService, isAuthError } from '../services/auth';
import type { ShardName, Manifest } from '../services/googleDrive';

/**
 * FF-DATA-4e — the set of names a "dirty" save cycle can reference: the four
 * entity shards plus the manifest itself (dirty whenever businessSettings/
 * categories change, or whenever an entity shard's write needs its manifest
 * index entry updated — see flushToDrive below).
 */
type DirtyShard = ShardName | 'manifest';
const ALL_DIRTY_SHARD_NAMES: readonly DirtyShard[] = ['invoices', 'expenses', 'clients', 'bookingAgents', 'manifest'];
const ENTITY_SHARD_ORDER: readonly ShardName[] = ['invoices', 'expenses', 'clients', 'bookingAgents'];

function isDirtyShardName(value: unknown): value is DirtyShard {
  return typeof value === 'string' && (ALL_DIRTY_SHARD_NAMES as readonly string[]).includes(value);
}

/** Reads the durable set of still-pending shard names left over from a prior
 * session (e.g. a crash mid-partial-save) — see FINANCE_PENDING_SHARDS_KEY. */
function loadPendingShardsFromStorage(): Set<DirtyShard> {
  try {
    const raw = localStorage.getItem(FINANCE_PENDING_SHARDS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isDirtyShardName));
  } catch {
    return new Set();
  }
}

export type BusinessType = 'EsekPatur' | 'EsekMorshe' | 'Company';
export type DocumentType = 'TaxInvoice' | 'Receipt' | 'TaxInvoiceReceipt' | 'TransactionInvoice';

/** How the customer paid for the document. */
export type PaymentMethod = 'Cash' | 'Digital' | 'Card' | 'BankWire';

/**
 * How much of an expense's input VAT may be reclaimed:
 * - `full` → 100% (standard business purchase backed by a tax invoice)
 * - `two_thirds` → 2/3 (vehicles; 1/3 treated as private)
 * - `none` → 0 (entertainment/כיבוד, private, or non-tax-invoice purchases)
 */
export type VatDeductibility = 'full' | 'two_thirds' | 'none';

/**
 * VAT treatment of an issued document for VAT reporting:
 * - `standard` → standard-rated sale (taxRate usually 18; lands in Doch Maam Field 1/4)
 * - `zero_rated` → export / Eilat-zone sale (taxRate 0; Field 2; input VAT still recoverable)
 * - `exempt` → exempt sale (Field 3; does not support input-VAT recovery)
 */
export type VatTreatment = 'standard' | 'zero_rated' | 'exempt';

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
  /**
   * VAT filing cadence. Default 'bimonthly'. Auto-suggested as 'monthly' when
   * annual turnover crosses the monthly-filing threshold or PCN874 applies.
   */
  vatReportingPeriod?: 'monthly' | 'bimonthly';
  /**
   * Whether the business is on cash basis for VAT (advisor-set). Default false =
   * accrual. Controls the output-VAT recognition date (§4, §9 Q2 — advisor-confirm).
   */
  vatCashBasis?: boolean;
  /**
   * Whether the business files a detailed VAT return (PCN874 / דיווח מפורט). Default
   * false. Detailed filers get an extra payment deadline (the 23rd); inferring this
   * purely from a monthly cadence is wrong, so it is an explicit advisor-set flag. A
   * suggestion to enable it is shown once annual turnover crosses the relevant ceiling.
   */
  isDetailedFiler?: boolean;
}

export interface Expense {
  id: string;
  date: string;
  vendor: string;
  category: string;
  /** KEEP: gross (VAT-inclusive) total actually paid. Unchanged meaning. */
  amount: number;
  receiptStatus: 'Uploaded' | 'Missing';
  receiptName?: string;
  receiptUrl?: string;
  bookingAgentId?: string;
  /** Net (pre-VAT) base of the expense. Optional; if absent, derived from amount + vatRate at read time (see vatReport.ts). */
  netAmount?: number;
  /** VAT rate applied to this expense, %, by the expense date (usually 18; 0 for zero-rated/exempt purchases). */
  vatRate?: number;
  /** VAT portion in ₪ as it appears on the supplier invoice. Optional; derivable. */
  vatAmount?: number;
  /** How much of vatAmount is reclaimable as input VAT. Legacy rows default to 'none' (see migration §8). */
  vatDeductibility?: VatDeductibility;
  /** True only when backed by a valid tax invoice (חשבונית מס) with the supplier's TIN — a precondition for any input-VAT claim. */
  hasValidTaxInvoice?: boolean;
  /** Supplier's allocation number (מספר הקצאה), when the supplier was required to issue one (purchase >= dated threshold, pre-VAT). Missing it blocks the deduction above the threshold. */
  supplierAllocationNumber?: string;
  /** ISO timestamp of when the record was created in the app. Hidden field used only to
   * order lists newest-first reliably (a stable tiebreaker when several rows share a
   * `date`). Absent on legacy rows — callers fall back to `date`. */
  createdAt?: string;
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

/**
 * A single tendered payment of one method. Payment-recording documents (Receipt /
 * TaxInvoiceReceipt) split their total across one or more of these so a large total
 * can be settled with cash + non-cash while the cash portion stays under the Cash
 * Law cap (see src/utils/invoiceMath.ts validatePayments and getCashLimit).
 */
export interface PaymentLine {
  /** Stable id for React keys / row edits. */
  id: string;
  /** Method tendered for this line. */
  method: PaymentMethod;
  /** Gross ₪ tendered via this method; must be > 0. */
  amount: number;
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
  /**
   * @deprecated by `paymentLines`. KEEP for back-compat: legacy single-method docs
   * and non-payment documents (TaxInvoice / TransactionInvoice) may still set/read
   * it. New payment-recording docs write `paymentLines` instead (and may mirror the
   * first/only method here for older readers).
   */
  paymentMethod?: PaymentMethod;
  /**
   * Actual receipt of payment, split by method. Present ONLY on documents that
   * record payment: Receipt and TaxInvoiceReceipt. The sum of amounts must equal
   * `total` (validated in invoiceMath.validatePayments). Absent on TaxInvoice /
   * TransactionInvoice. Optional for back-compat — legacy invoices map lazily via
   * invoiceMath.paymentLinesOf().
   */
  paymentLines?: PaymentLine[];
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
  /**
   * VAT treatment for reporting. Defaults to 'standard' for legacy invoices (see
   * migration §8). 'zero_rated' = export/Eilat (taxRate 0, Doch Maam Field 2);
   * 'exempt' = Field 3. Only meaningful for an Osek Morshe / Company.
   */
  vatTreatment?: VatTreatment;
  /** ISO timestamp of when the document was created in the app. Hidden field used only
   * to order lists newest-first reliably (a stable tiebreaker when several documents
   * share a `date`). Absent on legacy documents — callers fall back to `date`. */
  createdAt?: string;
  /**
   * Set on a receipt (or other document) that was issued from a חשבון עסקה
   * (TransactionInvoice) via the "create receipt from this" flow — points at the
   * source document's id. Used to show the source as נפרע/settled and to keep the
   * quote→payment paper trail. Absent on documents created directly.
   */
  sourceInvoiceId?: string;
  /**
   * Free-text note entered by the issuer (e.g. payment terms, a thank-you line).
   * Optional and purely informational — rendered on the PDF when present. Trimmed
   * empty strings are stored as undefined.
   */
  notes?: string;
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
  /**
   * True when local edits exist that have NOT been confirmed saved to Drive (a save
   * failed, or the session is expired). Durable across reload via localStorage, so the
   * UI can always warn the user their changes aren't backed up yet.
   */
  hasUnsyncedChanges: boolean;
  /** Mirror of AuthContext.sessionExpired, surfaced here for the data-status UI. */
  sessionExpired: boolean;
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

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accessToken, isAuthenticated, sessionExpired, markSessionExpired } = useAuth();
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

  // FF-DATA-4e — durable set of still-dirty SHARD names, replacing the old single
  // boolean's backing store. Seeded from localStorage so a save that was interrupted
  // (crash, closed tab) mid-partial-save resumes knowing EXACTLY which shards still
  // need pushing, instead of treating "everything" as dirty. `hasUnsyncedChanges`
  // stays the same public boolean (unchanged contract for AppLayout's sync pill):
  // it is simply `true` iff this set is non-empty.
  //
  // Read from localStorage into a plain local (not inside a ref/state initializer
  // callback) so neither `useRef`'s nor `useState`'s initializer reads a ref's
  // `.current` during render (react-hooks/refs) — both are seeded from this same
  // one-time-per-mount value instead.
  const initialPendingShards = loadPendingShardsFromStorage();
  const pendingShardsRef = useRef<Set<DirtyShard>>(initialPendingShards);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(() => initialPendingShards.size > 0);

  // Persists the given dirty-shard set as the new source of truth (ref + localStorage
  // + the public boolean), so all three can never drift apart.
  const persistPendingShards = useCallback((shards: Set<DirtyShard>) => {
    pendingShardsRef.current = shards;
    setHasUnsyncedChanges(shards.size > 0);
    try {
      if (shards.size > 0) {
        localStorage.setItem(FINANCE_PENDING_SHARDS_KEY, JSON.stringify(Array.from(shards)));
        localStorage.setItem(FINANCE_PENDING_SAVE_KEY, '1');
      } else {
        localStorage.removeItem(FINANCE_PENDING_SHARDS_KEY);
        localStorage.removeItem(FINANCE_PENDING_SAVE_KEY);
      }
    } catch (e) {
      console.warn('Could not persist pending-shards flag', e);
    }
  }, []);

  // FF-DATA-4e — per-shard Drive identity (replacing the old single driveFileId/
  // driveVersion pair). Populated once initShardedAppState/migrateLegacyToShards
  // resolves for the active business; the manifest is the consistency anchor (§3),
  // so its file id/version/full last-known body get their own refs.
  const manifestFileIdRef = useRef<string | null>(null);
  const manifestVersionRef = useRef<string | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const shardFileIdsRef = useRef<Partial<Record<ShardName, string>>>({});
  const shardVersionsRef = useRef<Partial<Record<ShardName, string>>>({});

  // FF-DATA-4e/§2 — per-collection "last-seen" refs + the accumulating dirty set,
  // seeded whenever a load/merge-adoption completes (see the auto-save effect
  // below). Every mutator in this file creates a new array/object reference via
  // spread/map/filter (confirmed by reading every mutator below — none mutate in
  // place), so reference inequality is a correct, cheap dirty signal; no deep-equal
  // needed. dirtyShardsRef accumulates across the whole debounce window and is only
  // drained when a flush actually starts (flushToDrive), so a burst of edits to
  // different collections within the same second all get flushed together.
  const prevExpensesRef = useRef<Expense[] | null>(null);
  const prevInvoicesRef = useRef<Invoice[] | null>(null);
  const prevClientsRef = useRef<Client[] | null>(null);
  const prevBookingAgentsRef = useRef<BookingAgent[] | null>(null);
  const prevCategoriesRef = useRef<string[] | null>(null);
  const prevSettingsRef = useRef<BusinessSettings | null>(null);
  const dirtyShardsRef = useRef<Set<DirtyShard>>(new Set());

  // Id of the workspace whose data is currently loaded into state. Persistence is
  // gated on this matching activeBusiness, so during a workspace switch we never
  // write the previous workspace's data into the new workspace's app_data.json.
  const loadedBusinessId = useRef<string | null>(null);
  // Set true whenever we ADOPT remote/merged state into local (a clean Drive load,
  // a load-time merge, or a save-time concurrent-merge adoption). Those setState calls
  // re-fire the auto-save effect even though the USER changed nothing; the effect
  // consumes this once (sets it false) and returns WITHOUT marking dirty or scheduling
  // a flush, so a load can't flicker the unsynced pill or trigger a no-delta Drive write.
  // The next state change is a real edit, finds it false, and persists normally. React 19
  // batches a load's setState calls into a single effect run, so consume-once is correct.
  const justLoadedRef = useRef(false);

  // F-3 — latest in-memory state and the token, mirrored into refs so the logout
  // flush can persist the most recent edits to Drive BEFORE the finance cache is
  // wiped, without re-running the flush effect on every keystroke.
  const latestStateRef = useRef<googleDrive.AppState | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  // True once we have data worth flushing for the loaded workspace.
  const hasPendingDataRef = useRef(false);
  // Retry/backoff bookkeeping for failed Drive saves: a handle to a scheduled retry and
  // the current consecutive-failure count (drives exponential backoff).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  // Indirection so a scheduled retry can call the latest flushToDrive without the
  // callback referencing itself by name (avoids a use-before-declared cycle).
  const flushToDriveRef = useRef<((reason: 'auto' | 'retry' | 'reconnect') => Promise<void>) | null>(null);

  // Keep the flush refs in sync with the latest render's state/token (in an effect,
  // not during render, so reads of these refs at logout always see the freshest data).
  useEffect(() => {
    accessTokenRef.current = accessToken;
    latestStateRef.current = { expenses, categories, clients, invoices, bookingAgents, businessSettings };
  });

  // Initial Load from LocalStorage (Fallback)
  useEffect(() => {
    const loadLocalData = () => {
      try {
        // F-7 — the localStorage cache mirrors the untrusted Drive app_data.json and
        // can be edited via DevTools, so validate/normalize it through the same schema
        // (drops malformed records, coerces types, strips __proto__/constructor)
        // before it reaches state.
        const parse = (key: string): unknown => {
          const raw = localStorage.getItem(key);
          if (!raw) return undefined;
          try { return JSON.parse(raw); } catch { return undefined; }
        };

        const cached = normalizeAppState({
          expenses: parse('finance_expenses'),
          categories: parse('finance_categories'),
          clients: parse('finance_clients'),
          bookingAgents: parse('finance_booking_agents'),
          invoices: parse('finance_invoices'),
          businessSettings: parse('finance_business_settings'),
        });

        if (localStorage.getItem('finance_expenses')) setExpenses(cached.expenses);
        if (localStorage.getItem('finance_categories')) setCategories(cached.categories);
        if (localStorage.getItem('finance_clients')) setClients(cached.clients);
        if (localStorage.getItem('finance_booking_agents')) setBookingAgents(cached.bookingAgents || []);
        if (localStorage.getItem('finance_invoices')) setInvoices(cached.invoices);
        if (localStorage.getItem('finance_business_settings')) setBusinessSettings(cached.businessSettings);

        const savedActiveBusiness = localStorage.getItem('finance_active_business');
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
            // Force creation of default if none exist. FF-DATA-4d — a brand-new
            // business goes straight to the split-file layout (manifest + 4 empty
            // shards); no legacy app_data.json is ever created for it.
            await googleDrive.initShardedAppState(accessToken, 'My Business');
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
          if (isAuthError(error)) {
            // Dead token before any workspace loaded: surface the reconnect state
            // (opens the sign-in modal) instead of a bare error.
            markSessionExpired();
          } else {
            setSyncError('Failed to load businesses.');
          }
          setIsLoading(false);
          // With no cached workspace, syncFromDrive never runs, so nothing else flips
          // isInitialized — without this a device with an expired session hangs on the
          // full-screen loader forever and never sees the app or the reconnect modal.
          setIsInitialized(true);
        }
      };
      initBusinesses();
    }
  }, [isAuthenticated, accessToken, markSessionExpired]);

  // FF-DATA-4e — single source of truth for persisting the loaded workspace's state
  // to Drive. Used by the debounced auto-save, the backoff retry, the load-time
  // reconnect flush, and the reconnect effect. Reads the freshest state from
  // latestStateRef so a retry always saves the LATEST edits, and routes through
  // getValidAccessToken() so a near-expiry token is refreshed at the moment of save.
  //
  // Design spec §3 save-cycle ordering (the manifest as consistency anchor):
  //   1. Snapshot + drain the dirty set (this session's accumulator + anything still
  //      durably pending from an earlier interrupted attempt).
  //   2. Flush every dirty ENTITY shard (invoices/expenses/clients/bookingAgents) in
  //      PARALLEL — no cross-shard invariants between them (the one cross-cutting
  //      invariant, docCounters, lives entirely in the manifest).
  //   3. Only once every attempted entity-shard write this cycle has resolved
  //      (success or failure), write the manifest LAST, folding in the shard-index
  //      entries for whichever shards just succeeded plus businessSettings/
  //      categories if 'manifest' itself was dirty — so the manifest never points
  //      at a shard version that doesn't actually exist yet.
  //   4. Whatever failed this cycle (an entity shard OR the manifest) goes back into
  //      the durable dirty set for the next attempt. A shard that succeeded is NEVER
  //      re-added even if the manifest write subsequently fails — it is already
  //      durably saved on Drive; only the manifest's index is stale, and re-trying
  //      the manifest alone needs no shard content, just each shard's current
  //      version, so it is cheap and idempotent no matter how many times retried.
  const flushToDrive = useCallback(async (reason: 'auto' | 'retry' | 'reconnect') => {
    const manifestFileId = manifestFileIdRef.current;
    const state = latestStateRef.current;
    if (!manifestFileId || !state) return;

    // Cancel any pending retry; this attempt supersedes it.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    // Step 1 — snapshot + drain.
    const toFlush = new Set<DirtyShard>([...dirtyShardsRef.current, ...pendingShardsRef.current]);
    dirtyShardsRef.current = new Set();
    if (toFlush.size === 0) return;

    setIsSyncing(true);

    let token: string;
    try {
      token = await authService.getValidAccessToken();
    } catch (error) {
      console.error(`Drive Save Error (${reason}): could not obtain a valid access token`, error);
      persistPendingShards(new Set([...dirtyShardsRef.current, ...toFlush]));
      if (isAuthError(error)) {
        markSessionExpired();
        setSyncError(null);
      } else {
        setSyncError('Sync delayed: changes saved locally, retrying…');
        const attempt = Math.min(retryAttemptRef.current, 5);
        const delay = Math.min(1000 * 2 ** attempt, 60_000);
        retryAttemptRef.current = attempt + 1;
        retryTimerRef.current = setTimeout(() => { void flushToDriveRef.current?.('retry'); }, delay);
      }
      setIsSyncing(false);
      return;
    }

    try {
      const collectionFor = (name: ShardName): (Invoice | Expense | Client | BookingAgent)[] => {
        if (name === 'invoices') return state.invoices;
        if (name === 'expenses') return state.expenses;
        if (name === 'clients') return state.clients;
        return state.bookingAgents || [];
      };

      type ShardOutcome =
        | { name: ShardName; ok: true; version: string; merged: unknown[] | null }
        | { name: ShardName; ok: false; error: unknown };

      // Step 2 — every dirty entity shard, in parallel.
      const attemptShard = async (name: ShardName): Promise<ShardOutcome> => {
        const fileId = shardFileIdsRef.current[name];
        if (!fileId) {
          const error = new Error(`FF-DATA-4e: no known Drive file id yet for shard "${name}"`);
          console.warn(error.message, '— deferring this shard to the next cycle.');
          return { name, ok: false, error };
        }
        try {
          let result: { version: string; merged: unknown[] | null };
          switch (name) {
            case 'invoices':
              result = await googleDrive.saveShardGuarded(
                token, fileId, shardVersionsRef.current.invoices ?? null, collectionFor('invoices') as Invoice[], 'invoices'
              );
              break;
            case 'expenses':
              result = await googleDrive.saveShardGuarded(
                token, fileId, shardVersionsRef.current.expenses ?? null, collectionFor('expenses') as Expense[], 'expenses'
              );
              break;
            case 'clients':
              result = await googleDrive.saveShardGuarded(
                token, fileId, shardVersionsRef.current.clients ?? null, collectionFor('clients') as Client[], 'clients'
              );
              break;
            case 'bookingAgents':
              result = await googleDrive.saveShardGuarded(
                token, fileId, shardVersionsRef.current.bookingAgents ?? null, collectionFor('bookingAgents') as BookingAgent[], 'bookingAgents'
              );
              break;
          }
          return { name, ok: true, version: result.version, merged: result.merged };
        } catch (error) {
          console.error(`Drive Save Error (${reason}): shard "${name}" failed`, error);
          return { name, ok: false, error };
        }
      };

      const entityShardsToFlush = ENTITY_SHARD_ORDER.filter((name) => toFlush.has(name));
      const results = await Promise.all(entityShardsToFlush.map(attemptShard));

      const succeededEntries: Manifest['shards'] = {};
      const failedShards = new Set<DirtyShard>();
      const errors: unknown[] = [];
      let anyMergedAdoption = false;

      for (const r of results) {
        if (r.ok) {
          shardVersionsRef.current[r.name] = r.version;
          succeededEntries[r.name] = {
            fileId: shardFileIdsRef.current[r.name]!,
            version: r.version,
            recordCount: collectionFor(r.name).length,
            updatedAt: new Date().toISOString(),
          };
          if (r.merged) {
            anyMergedAdoption = true;
            switch (r.name) {
              case 'invoices': setInvoices(r.merged as Invoice[]); break;
              case 'expenses': setExpenses(r.merged as Expense[]); break;
              case 'clients': setClients(r.merged as Client[]); break;
              case 'bookingAgents': setBookingAgents(r.merged as BookingAgent[]); break;
            }
          }
        } else {
          failedShards.add(r.name);
          errors.push(r.error);
        }
      }

      // Step 3 — the manifest, written LAST, only after every attempted entity-shard
      // write above has resolved. Dirty if businessSettings/categories changed OR any
      // entity shard just got a new version that needs recording in the shard index.
      const manifestDirtyThisCycle = toFlush.has('manifest') || Object.keys(succeededEntries).length > 0;
      let manifestFailed = false;

      if (manifestDirtyThisCycle) {
        const baseManifest: Manifest =
          manifestRef.current ?? {
            schemaVersion: 2,
            businessSettings: state.businessSettings,
            categories: state.categories,
            shards: {},
          };
        const nextManifest: Manifest = {
          ...baseManifest,
          shards: { ...baseManifest.shards, ...succeededEntries },
          ...(toFlush.has('manifest')
            ? { businessSettings: state.businessSettings, categories: state.categories }
            : {}),
        };
        try {
          const { version, merged } = await googleDrive.saveManifestGuarded(
            token,
            manifestFileId,
            manifestVersionRef.current,
            nextManifest
          );
          manifestVersionRef.current = version;
          manifestRef.current = merged ?? nextManifest;
          if (merged) {
            anyMergedAdoption = true;
            for (const name of ENTITY_SHARD_ORDER) {
              const entry = merged.shards[name];
              if (entry) shardVersionsRef.current[name] = entry.version;
            }
            setBusinessSettings(merged.businessSettings);
            setCategories(merged.categories);
          }
        } catch (error) {
          console.error(`Drive Save Error (${reason}): manifest write failed`, error);
          manifestFailed = true;
          errors.push(error);
        }
      }

      if (anyMergedAdoption) {
        // A concurrent write from another device was detected and merged in for at
        // least one shard or the manifest — adopt it. This is load-induced, not a
        // user edit: gate the auto-save effect so it doesn't re-dirty/re-flush off
        // these setState calls (the merged data is already durably saved by the
        // guarded save(s) above, so skipping the follow-up auto-save loses no write).
        justLoadedRef.current = true;
      }

      // Step 4 — whatever failed this cycle stays/goes back into the durable dirty
      // set, merged with anything the render-time effect accumulated WHILE this
      // flush was in flight (a real edit made during the await window) so it's never
      // clobbered.
      const stillDirtyThisAttempt = new Set<DirtyShard>(failedShards);
      if (manifestDirtyThisCycle && manifestFailed) stillDirtyThisAttempt.add('manifest');
      const finalDirty = new Set<DirtyShard>([...dirtyShardsRef.current, ...stillDirtyThisAttempt]);
      dirtyShardsRef.current = finalDirty;
      persistPendingShards(finalDirty);

      if (finalDirty.size === 0) {
        retryAttemptRef.current = 0;
        setSyncError(null);
      } else if (errors.some(isAuthError)) {
        // Token is dead. Surface the reconnect state; a successful re-auth /
        // foreground refresh will trigger a flush via the reconnect effect below.
        markSessionExpired();
        setSyncError(null);
      } else {
        // Transient (network/quota): schedule an exponential-backoff retry, capped.
        setSyncError('Sync delayed: changes saved locally, retrying…');
        const attempt = Math.min(retryAttemptRef.current, 5);
        const delay = Math.min(1000 * 2 ** attempt, 60_000);
        retryAttemptRef.current = attempt + 1;
        retryTimerRef.current = setTimeout(() => { void flushToDriveRef.current?.('retry'); }, delay);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [persistPendingShards, markSessionExpired]);

  // Keep the ref pointed at the latest flushToDrive for the scheduled-retry indirection.
  useEffect(() => { flushToDriveRef.current = flushToDrive; }, [flushToDrive]);

  // Sync Data when Active Business Changes
  useEffect(() => {
    if (isAuthenticated && accessToken && activeBusiness) {
      const syncFromDrive = async () => {
        setIsLoading(true);

        // Snapshot the local cache that the hydrate effect already loaded into state.
        // This is a PARTICIPANT in the load, not a throwaway: it may hold edits made
        // while the token was dead that never reached Drive. We must never let a stale
        // or empty Drive copy erase it (the data-loss bug). We only treat it as local
        // for THIS workspace — during a workspace switch the in-memory state still
        // belongs to the previous workspace, so we ignore it unless it was already
        // marked loaded for the workspace we're now loading.
        const isSameWorkspaceCache = loadedBusinessId.current === activeBusiness.id;
        const localSnapshot: googleDrive.AppState | null =
          isSameWorkspaceCache && latestStateRef.current ? latestStateRef.current : null;

        try {
          // Use a freshly-validated token (silent refresh if near expiry) rather than
          // the possibly-stale context token, so a load right after resume doesn't 401.
          const token = await authService.getValidAccessToken();

          // FF-DATA-4d/4e — the split-file-aware bootstrap: detects/creates/migrates/
          // resumes per the design spec §4 detection table, then resolves this
          // workspace's manifest + per-shard identity from its returned shard index.
          const initResult = await googleDrive.initShardedAppState(token, activeBusiness.name);
          manifestFileIdRef.current = initResult.manifestFileId;
          manifestVersionRef.current = await googleDrive.getFileVersion(token, initResult.manifestFileId);
          manifestRef.current = initResult.manifest;

          const shardIndex = initResult.manifest.shards;
          shardFileIdsRef.current = {
            invoices: shardIndex.invoices?.fileId,
            expenses: shardIndex.expenses?.fileId,
            clients: shardIndex.clients?.fileId,
            bookingAgents: shardIndex.bookingAgents?.fileId,
          };
          // Seeded directly from the manifest's own shard index rather than a fresh
          // getFileVersion round-trip per shard: the index IS the version as of the
          // manifest's last write, and saveShardGuarded already re-verifies/merges on
          // any mismatch at save time, so this is both correct and cheaper.
          shardVersionsRef.current = {
            invoices: shardIndex.invoices?.version,
            expenses: shardIndex.expenses?.version,
            clients: shardIndex.clients?.version,
            bookingAgents: shardIndex.bookingAgents?.version,
          };

          const [invoicesData, expensesData, clientsData, bookingAgentsData] = await Promise.all([
            shardIndex.invoices ? googleDrive.fetchShard(token, shardIndex.invoices.fileId, 'invoices') : Promise.resolve<Invoice[]>([]),
            shardIndex.expenses ? googleDrive.fetchShard(token, shardIndex.expenses.fileId, 'expenses') : Promise.resolve<Expense[]>([]),
            shardIndex.clients ? googleDrive.fetchShard(token, shardIndex.clients.fileId, 'clients') : Promise.resolve<Client[]>([]),
            shardIndex.bookingAgents ? googleDrive.fetchShard(token, shardIndex.bookingAgents.fileId, 'bookingAgents') : Promise.resolve<BookingAgent[]>([]),
          ]);

          const driveData: googleDrive.AppState = {
            invoices: invoicesData,
            expenses: expensesData,
            clients: clientsData,
            bookingAgents: bookingAgentsData,
            categories: initResult.manifest.categories,
            businessSettings: initResult.manifest.businessSettings,
          };

          // Merge Drive INTO local (union-by-id, local-wins) so a record edited locally
          // is never erased by a Drive copy that lacks it. When there's no same-workspace
          // local cache (clean load / workspace switch), this degenerates to "Drive
          // wins", preserving the original behaviour. The existing save-time merge path
          // is unchanged; this just applies the same reconciliation at LOAD time too.
          const effective: googleDrive.AppState = localSnapshot
            ? googleDrive.mergeAppState(localSnapshot, driveData)
            : driveData;

          // These setState calls are load-induced (clean Drive load or load-time
          // merge), not user edits. Flag the auto-save effect to consume the render
          // they produce without marking dirty / scheduling a flush — a load must not
          // flicker the unsynced pill or write a no-delta app_data.json. Any genuinely
          // pending edits merged in are flushed explicitly via the hasUnsyncedChanges
          // branch below, so this skip never drops a needed write.
          justLoadedRef.current = true;

          const loadedInvoices = (effective.invoices || []) as unknown as Invoice[];
          setExpenses((effective.expenses || []) as unknown as Expense[]);
          setCategories(effective.categories || DEFAULT_CATEGORIES);
          setClients((effective.clients || []) as unknown as Client[]);
          setBookingAgents((effective.bookingAgents || []) as unknown as BookingAgent[]);
          setInvoices(loadedInvoices);
          const loadedSettings = {
            ...DEFAULT_BUSINESS_SETTINGS,
            ...(effective.businessSettings || {})
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
          setSyncError(null);

          // If we merged unsynced local edits back over Drive, flush them now so the
          // dirty flag clears and Drive catches up. If nothing was pending, this is a
          // harmless idempotent save of the reconciled state.
          if (localSnapshot && hasUnsyncedChanges) {
            void flushToDrive('reconnect');
          }
        } catch (error) {
          const err = error as Error;
          console.error('Drive Sync Error:', err);
          // Do NOT overwrite the local cache on a failed fetch — the hydrate already
          // loaded the last good copy, and clobbering it is the executioner half of the
          // data-loss bug. Just surface the failure.
          if (isAuthError(err)) {
            markSessionExpired();
            setSyncError(null);
          } else {
            setSyncError(`Drive Sync Error: ${err.message || 'Unknown error'}`);
          }
          // Keep the local cache authoritative for this workspace so subsequent edits
          // persist and a later successful save can flush them.
          if (localSnapshot) loadedBusinessId.current = activeBusiness.id;
        } finally {
          setIsLoading(false);
          setIsInitialized(true);
        }
      };
      syncFromDrive();
    }
    // flushToDrive/hasUnsyncedChanges are intentionally omitted: this effect must run on
    // workspace/auth changes only, and reads the latest pending state via refs/closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness, isAuthenticated, accessToken]);

  // Persistent LocalStorage and Auto-Save to Drive
  useEffect(() => {
    if (!activeBusiness) return;
    // Skip persisting until the in-memory state actually belongs to the active
    // workspace. During a switch the previous workspace's data is still in state
    // until syncFromDrive finishes loading; persisting here would leak it into the
    // newly selected workspace's app_data.json (and localStorage cache).
    if (loadedBusinessId.current !== activeBusiness.id) return;

    // F-3 — this workspace's data is now live in state; the logout flush may persist it.
    hasPendingDataRef.current = true;

    // Always mirror the latest state to the localStorage backup — safe and desirable on
    // BOTH a real edit and a load adoption (keeps the cache in step with freshly-loaded
    // Drive data). This is unconditional; only the dirty flag + Drive write are gated.
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

    // FF-DATA-4e/§2 — per-collection dirty-tracking via reference inequality. Every
    // mutator in this file creates a new array/object reference via spread/map/
    // filter (confirmed by reading every mutator below — none mutate in place), so
    // reference inequality is a correct, cheap dirty signal; no deep-equal needed.
    // This ALWAYS runs (even on a load/merge-adoption render, below) so prevXRef
    // stays in lockstep with the latest reference; only the "mark dirty + schedule a
    // flush" part is skipped for a load-induced render (the justLoadedRef gate).
    const changedShards = new Set<DirtyShard>();
    if (expenses !== prevExpensesRef.current) { changedShards.add('expenses'); prevExpensesRef.current = expenses; }
    if (invoices !== prevInvoicesRef.current) { changedShards.add('invoices'); prevInvoicesRef.current = invoices; }
    if (clients !== prevClientsRef.current) { changedShards.add('clients'); prevClientsRef.current = clients; }
    if (bookingAgents !== prevBookingAgentsRef.current) { changedShards.add('bookingAgents'); prevBookingAgentsRef.current = bookingAgents; }
    if (categories !== prevCategoriesRef.current || businessSettings !== prevSettingsRef.current) {
      // docCounters lives inside businessSettings, which lives in the manifest —
      // bumped on essentially every addInvoice call, in addition to whichever
      // entity shard changed. Expected: the manifest is tiny, well under the cost
      // of re-uploading a multi-hundred-KB entity shard every time.
      changedShards.add('manifest');
      prevCategoriesRef.current = categories;
      prevSettingsRef.current = businessSettings;
    }

    // Consume-once gate: if this run was triggered by a load/merge adoption (not a
    // user edit), the state matches Drive (or was just persisted by the guarded
    // save(s)), so bail BEFORE marking dirty or scheduling a flush — a load must not
    // flicker the unsynced pill or write a no-delta shard/manifest. React 19 batches
    // the load's setState calls into a single effect run, so one consume covers the
    // whole load (or a partial merge-adoption). The next render is a real edit,
    // finds the flag false, and persists normally.
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      return;
    }

    if (changedShards.size === 0) return;

    // An edit just landed: from Drive's perspective the cache is now ahead until a
    // save confirms. Mark the affected shard(s) pending up front so a crash/close
    // inside the debounce window is still recorded as unsynced (cleared the moment
    // flushToDrive's guarded save(s) succeed).
    for (const shard of changedShards) dirtyShardsRef.current.add(shard);
    persistPendingShards(new Set([...pendingShardsRef.current, ...dirtyShardsRef.current]));

    // Debounced Drive save. We attempt even while sessionExpired so a token that came
    // back (foreground refresh) gets used; flushToDrive re-flags expiry on a real 401.
    if (manifestFileIdRef.current) {
      const timer = setTimeout(() => { void flushToDrive('auto'); }, 1000);
      return () => clearTimeout(timer);
    }
  }, [expenses, categories, clients, invoices, bookingAgents, businessSettings, activeBusiness, flushToDrive, persistPendingShards]);

  // Reconnect flush: whenever we are authenticated, the session is NOT expired, and we
  // still hold unsynced edits for the loaded workspace, push them to Drive. This fires
  // when sessionExpired flips true -> false (foreground-resume token refresh or
  // re-login) and when hasUnsyncedChanges first becomes true while online — recovering
  // pending edits deterministically, without any fixed-interval timer.
  useEffect(() => {
    if (
      isAuthenticated &&
      !sessionExpired &&
      hasUnsyncedChanges &&
      manifestFileIdRef.current &&
      activeBusiness &&
      loadedBusinessId.current === activeBusiness.id
    ) {
      void flushToDrive('reconnect');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExpired, isAuthenticated, hasUnsyncedChanges, activeBusiness]);

  // F-3 — On logout (auth flips true -> false), flush the latest in-memory state to
  // Drive BEFORE wiping the local cache, so a logout within the 1s save debounce can't
  // lose unsynced edits; then purge all finance_* keys and reset in-memory state so the
  // next user on a shared device can't read the previous user's financial data.
  //
  // FF-DATA-4e — best-effort, ONE attempt per still-dirty shard + the manifest (no
  // retry scheduling: the cache is wiped regardless of outcome, so there is nothing
  // left to retry against once this finishes).
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = isAuthenticated;

    if (wasAuthenticated && !isAuthenticated) {
      const flushAndClear = async () => {
        const token = accessTokenRef.current;
        const manifestFileId = manifestFileIdRef.current;
        const state = latestStateRef.current;
        // Best-effort final save of unsynced changes (token is briefly still valid
        // right after logout is requested). Never block the wipe on a failed save.
        if (token && manifestFileId && state && hasPendingDataRef.current) {
          const toFlush = new Set<DirtyShard>([...dirtyShardsRef.current, ...pendingShardsRef.current]);
          const collectionFor = (name: ShardName): (Invoice | Expense | Client | BookingAgent)[] => {
            if (name === 'invoices') return state.invoices;
            if (name === 'expenses') return state.expenses;
            if (name === 'clients') return state.clients;
            return state.bookingAgents || [];
          };
          const succeededEntries: Manifest['shards'] = {};

          for (const name of ENTITY_SHARD_ORDER) {
            if (!toFlush.has(name)) continue;
            const fileId = shardFileIdsRef.current[name];
            if (!fileId) continue;
            try {
              let result: { version: string };
              switch (name) {
                case 'invoices':
                  result = await googleDrive.saveShardGuarded(token, fileId, shardVersionsRef.current.invoices ?? null, collectionFor('invoices') as Invoice[], 'invoices');
                  break;
                case 'expenses':
                  result = await googleDrive.saveShardGuarded(token, fileId, shardVersionsRef.current.expenses ?? null, collectionFor('expenses') as Expense[], 'expenses');
                  break;
                case 'clients':
                  result = await googleDrive.saveShardGuarded(token, fileId, shardVersionsRef.current.clients ?? null, collectionFor('clients') as Client[], 'clients');
                  break;
                case 'bookingAgents':
                  result = await googleDrive.saveShardGuarded(token, fileId, shardVersionsRef.current.bookingAgents ?? null, collectionFor('bookingAgents') as BookingAgent[], 'bookingAgents');
                  break;
              }
              succeededEntries[name] = {
                fileId,
                version: result.version,
                recordCount: collectionFor(name).length,
                updatedAt: new Date().toISOString(),
              };
            } catch (error) {
              console.warn(`Final pre-logout Drive flush failed for shard "${name}"; clearing local cache anyway.`, error);
            }
          }

          if (Object.keys(succeededEntries).length > 0 || toFlush.has('manifest')) {
            const baseManifest: Manifest = manifestRef.current ?? {
              schemaVersion: 2,
              businessSettings: state.businessSettings,
              categories: state.categories,
              shards: {},
            };
            const nextManifest: Manifest = {
              ...baseManifest,
              shards: { ...baseManifest.shards, ...succeededEntries },
              ...(toFlush.has('manifest')
                ? { businessSettings: state.businessSettings, categories: state.categories }
                : {}),
            };
            try {
              await googleDrive.saveManifestGuarded(token, manifestFileId, manifestVersionRef.current, nextManifest);
            } catch (error) {
              console.warn('Final pre-logout Drive flush failed for the manifest; clearing local cache anyway.', error);
            }
          }
        }

        clearFinanceCache();
        manifestFileIdRef.current = null;
        manifestVersionRef.current = null;
        manifestRef.current = null;
        shardFileIdsRef.current = {};
        shardVersionsRef.current = {};
        prevExpensesRef.current = null;
        prevInvoicesRef.current = null;
        prevClientsRef.current = null;
        prevBookingAgentsRef.current = null;
        prevCategoriesRef.current = null;
        prevSettingsRef.current = null;
        dirtyShardsRef.current = new Set();
        loadedBusinessId.current = null;
        hasPendingDataRef.current = false;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        retryAttemptRef.current = 0;
        persistPendingShards(new Set());

        setExpenses([]);
        setCategories(DEFAULT_CATEGORIES);
        setClients([]);
        setBookingAgents([]);
        setInvoices([]);
        setBusinessSettings(DEFAULT_BUSINESS_SETTINGS);
        setBusinesses([]);
        setActiveBusiness(null);
        setIsInitialized(false);
      };
      void flushAndClear();
    }
  }, [isAuthenticated, persistPendingShards]);

  const addExpense = (expense: Omit<Expense, 'id'> & { id?: string }) => {
    const newExpense = { ...expense, id: expense.id || uuidv4(), createdAt: expense.createdAt || new Date().toISOString() };
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

    // Cash Law / multi-payment defense-in-depth: a payment-recording document
    // (Receipt / TaxInvoiceReceipt) that is being ISSUED (non-Draft) must carry
    // payment lines that sum to the total and keep cash under the dated cap. The
    // form already gates this; refuse here so an invalid set can never be persisted
    // even if the UI guard is bypassed. Drafts are not yet legal documents and may
    // be saved partial/unbalanced.
    if (recordsPayment(invoice.documentType) && invoice.status !== 'Draft') {
      const lines = invoice.paymentLines ?? [];
      if (!validatePayments(total, lines, getCashLimit(invoice.date)).ok) {
        console.error('Refusing to add invoice: payment lines invalid (Cash Law / unbalanced).');
        return;
      }
    }

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

    const newInvoice: Invoice = { ...invoice, id, total, createdAt: new Date().toISOString() };

    setInvoices(prev => [newInvoice, ...prev]);
    setBusinessSettings(prev => ({ ...prev, docCounters: nextCounters }));

    // A חשבון עסקה (TransactionInvoice) is a demand/quote, not an accounting event, so
    // it never adds to client billing or agent commissions — only the receipt/tax
    // invoice issued for it does (isAccountingDocument).
    if (isAccountingDocument(invoice.documentType)) {
      setClients(prev => prev.map(c =>
        c.id === invoice.clientId ? { ...c, totalBilled: c.totalBilled + total } : c
      ));

      if (invoice.bookingAgentId && invoice.commissionAmount) {
        setBookingAgents(prev => prev.map(a =>
          a.id === invoice.bookingAgentId ? { ...a, totalCommissions: a.totalCommissions + invoice.commissionAmount! } : a
        ));
      }
    }
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    const target = invoices.find(inv => inv.id === id);
    if (!target) return;

    // The updated document, with its total recomputed from items/taxRate.
    const candidate: Invoice = { ...target, ...updates };
    candidate.total = computeTotals(candidate.items, candidate.taxRate).total;

    // Cash Law / multi-payment defense-in-depth (mirror of addInvoice): an ISSUED
    // (non-Draft) payment-recording document must carry balanced, under-cap payment
    // lines. Refuse the edit otherwise so the form gating cannot be bypassed.
    if (recordsPayment(candidate.documentType) && candidate.status !== 'Draft') {
      const lines = candidate.paymentLines ?? [];
      if (!validatePayments(candidate.total, lines, getCashLimit(candidate.date)).ok) {
        console.error('Refusing to update invoice: payment lines invalid (Cash Law / unbalanced).');
        return;
      }
    }

    setInvoices(prev => prev.map(inv => (inv.id === id ? candidate : inv)));

    // Client totalBilled: a document contributes its total unless it is Refunded or a
    // non-accounting חשבון עסקה. Diffing old vs new contribution handles total, status
    // and documentType changes (incl. switching a doc into/out of חשבון עסקה) uniformly.
    const billedOf = (inv: Invoice) =>
      inv.status !== 'Refunded' && isAccountingDocument(inv.documentType) ? inv.total : 0;
    const billedAdjustment = billedOf(candidate) - billedOf(target);
    if (billedAdjustment !== 0) {
      setClients(prev => prev.map(c =>
        c.id === target.clientId ? { ...c, totalBilled: c.totalBilled + billedAdjustment } : c
      ));
    }

    // Agent commission uses the same contribution model (a חשבון עסקה never accrues
    // commission). Handle the agent staying the same vs. switching agents.
    const oldAgentId = target.bookingAgentId || '';
    const newAgentId = candidate.bookingAgentId || '';
    const oldContrib = isAccountingDocument(target.documentType) ? (target.commissionAmount || 0) : 0;
    const newContrib = isAccountingDocument(candidate.documentType) ? (candidate.commissionAmount || 0) : 0;
    if (oldAgentId === newAgentId) {
      const delta = newContrib - oldContrib;
      if (oldAgentId && delta !== 0) {
        setBookingAgents(prev => prev.map(a =>
          a.id === oldAgentId ? { ...a, totalCommissions: Math.max(0, a.totalCommissions + delta) } : a
        ));
      }
    } else {
      setBookingAgents(prev => prev.map(a => {
        if (a.id === oldAgentId) return { ...a, totalCommissions: Math.max(0, a.totalCommissions - oldContrib) };
        if (a.id === newAgentId) return { ...a, totalCommissions: Math.max(0, a.totalCommissions + newContrib) };
        return a;
      }));
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
    // unless it was already excluded — Refunded/Cancelled never counted, and a
    // non-accounting חשבון עסקה never contributed in the first place.
    const alreadyExcluded =
      invoice.status === 'Refunded' ||
      invoice.status === 'Cancelled' ||
      !isAccountingDocument(invoice.documentType);
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
      // FF-DATA-4d — a brand-new business is created directly in the split-file
      // layout (manifest + 4 empty shards); no legacy app_data.json is ever created.
      const { folderId } = await googleDrive.initShardedAppState(accessToken, name);
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
      isLoading, isSyncing, isInitialized, syncError, hasUnsyncedChanges, sessionExpired,
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
