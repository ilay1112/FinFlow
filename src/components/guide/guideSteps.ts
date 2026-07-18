import type { GuideViewId } from '../../utils/guideStorage';

export interface GuideStepContent {
  /** i18n key resolving to the step's short title. */
  titleKey: string;
  /** i18n key resolving to the step's body copy. */
  bodyKey: string;
}

/** Small eyebrow label shown above each step's title (the view's own name). */
export const GUIDE_TITLE_KEYS: Record<GuideViewId, string> = {
  dashboard: 'guide.dashboard.title',
  income: 'guide.income.title',
  invoiceForm: 'guide.invoiceForm.title',
  expenses: 'guide.expenses.title',
  clients: 'guide.clients.title',
  bookingAgents: 'guide.bookingAgents.title',
  taxes: 'guide.taxes.title',
  vat: 'guide.vat.title',
  profile: 'guide.profile.title',
};

/**
 * Per-view step content. Every title/body pair is an i18n key — actual copy lives
 * in `src/i18n/locales/{he,en}.json` under `guide.<viewId>.steps.<stepId>.*` (he/en
 * MUST stay key-parity-equal). Step order here is the order the guide plays in.
 */
export const GUIDE_STEPS: Record<GuideViewId, GuideStepContent[]> = {
  dashboard: [
    { titleKey: 'guide.dashboard.steps.tiles.title', bodyKey: 'guide.dashboard.steps.tiles.body' },
    { titleKey: 'guide.dashboard.steps.period.title', bodyKey: 'guide.dashboard.steps.period.body' },
    { titleKey: 'guide.dashboard.steps.charts.title', bodyKey: 'guide.dashboard.steps.charts.body' },
    { titleKey: 'guide.dashboard.steps.quickActions.title', bodyKey: 'guide.dashboard.steps.quickActions.body' },
  ],
  income: [
    { titleKey: 'guide.income.steps.docTypes.title', bodyKey: 'guide.income.steps.docTypes.body' },
    { titleKey: 'guide.income.steps.statuses.title', bodyKey: 'guide.income.steps.statuses.body' },
    { titleKey: 'guide.income.steps.create.title', bodyKey: 'guide.income.steps.create.body' },
    { titleKey: 'guide.income.steps.receiptFromTransaction.title', bodyKey: 'guide.income.steps.receiptFromTransaction.body' },
    { titleKey: 'guide.income.steps.searchSort.title', bodyKey: 'guide.income.steps.searchSort.body' },
    { titleKey: 'guide.income.steps.pdf.title', bodyKey: 'guide.income.steps.pdf.body' },
  ],
  invoiceForm: [
    { titleKey: 'guide.invoiceForm.steps.clientAndType.title', bodyKey: 'guide.invoiceForm.steps.clientAndType.body' },
    { titleKey: 'guide.invoiceForm.steps.items.title', bodyKey: 'guide.invoiceForm.steps.items.body' },
    { titleKey: 'guide.invoiceForm.steps.payments.title', bodyKey: 'guide.invoiceForm.steps.payments.body' },
    { titleKey: 'guide.invoiceForm.steps.datesStatus.title', bodyKey: 'guide.invoiceForm.steps.datesStatus.body' },
    { titleKey: 'guide.invoiceForm.steps.allocation.title', bodyKey: 'guide.invoiceForm.steps.allocation.body' },
    { titleKey: 'guide.invoiceForm.steps.notes.title', bodyKey: 'guide.invoiceForm.steps.notes.body' },
  ],
  expenses: [
    { titleKey: 'guide.expenses.steps.add.title', bodyKey: 'guide.expenses.steps.add.body' },
    { titleKey: 'guide.expenses.steps.receipt.title', bodyKey: 'guide.expenses.steps.receipt.body' },
    { titleKey: 'guide.expenses.steps.categories.title', bodyKey: 'guide.expenses.steps.categories.body' },
    { titleKey: 'guide.expenses.steps.vat.title', bodyKey: 'guide.expenses.steps.vat.body' },
  ],
  clients: [
    { titleKey: 'guide.clients.steps.overview.title', bodyKey: 'guide.clients.steps.overview.body' },
    { titleKey: 'guide.clients.steps.add.title', bodyKey: 'guide.clients.steps.add.body' },
    { titleKey: 'guide.clients.steps.history.title', bodyKey: 'guide.clients.steps.history.body' },
  ],
  bookingAgents: [
    { titleKey: 'guide.bookingAgents.steps.overview.title', bodyKey: 'guide.bookingAgents.steps.overview.body' },
    { titleKey: 'guide.bookingAgents.steps.commission.title', bodyKey: 'guide.bookingAgents.steps.commission.body' },
    { titleKey: 'guide.bookingAgents.steps.history.title', bodyKey: 'guide.bookingAgents.steps.history.body' },
  ],
  taxes: [
    { titleKey: 'guide.taxes.steps.estimate.title', bodyKey: 'guide.taxes.steps.estimate.body' },
    { titleKey: 'guide.taxes.steps.deductions.title', bodyKey: 'guide.taxes.steps.deductions.body' },
    { titleKey: 'guide.taxes.steps.disclaimer.title', bodyKey: 'guide.taxes.steps.disclaimer.body' },
  ],
  vat: [
    { titleKey: 'guide.vat.steps.periods.title', bodyKey: 'guide.vat.steps.periods.body' },
    { titleKey: 'guide.vat.steps.report.title', bodyKey: 'guide.vat.steps.report.body' },
    { titleKey: 'guide.vat.steps.blocked.title', bodyKey: 'guide.vat.steps.blocked.body' },
    { titleKey: 'guide.vat.steps.export.title', bodyKey: 'guide.vat.steps.export.body' },
  ],
  profile: [
    { titleKey: 'guide.profile.steps.identity.title', bodyKey: 'guide.profile.steps.identity.body' },
    { titleKey: 'guide.profile.steps.workspaces.title', bodyKey: 'guide.profile.steps.workspaces.body' },
    { titleKey: 'guide.profile.steps.sync.title', bodyKey: 'guide.profile.steps.sync.body' },
  ],
};
