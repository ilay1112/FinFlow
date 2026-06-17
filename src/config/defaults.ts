import type { BusinessSettings } from '../context/FinanceContext';

/**
 * Single source of truth for the app's default workspace data, shared by the three
 * places that need to seed/fall back to it: the React state (FinanceContext), the
 * new-workspace Drive seed (googleDrive `DEFAULT_STATE`), and the untrusted-file
 * normalizer (appStateSchema). Keeping one copy stops the shapes from drifting —
 * the settings object must carry the VAT/filing fields the calc + reports rely on.
 */

export const DEFAULT_CATEGORIES: string[] = [
  'Software',
  'Rent',
  'Supplies',
  'Marketing',
  'Utilities',
  'Travel',
  'Other',
];

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  name: '',
  idNumber: '',
  address: '',
  phone: '',
  email: '',
  type: 'EsekPatur',
  vatReportingPeriod: 'bimonthly',
  vatCashBasis: false,
  isDetailedFiler: false,
};
