import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Calculator, Info, AlertTriangle, Download, CalendarClock, FileWarning } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useCurrencyFormatter } from '../utils/format';
import { getVatRate, getAllocationThreshold, getVatMonthlyFilingThreshold } from '../config/taxConfig';
import { computeYtdTurnover } from '../utils/invoiceMath';
import {
  buildAllVatReports,
  buildVatReportCsv,
  periodKeyString,
  periodDeadlines,
  periodMonthRange,
  type VatReport,
  type VatPeriodType,
  type BlockedReason,
  type CashBasisApproxReason,
} from '../utils/vatReport';

/** Localized human label for a period, e.g. "Jan–Feb 2026" / "ינואר–פברואר 2026". */
function usePeriodLabel() {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-US';
  return (report: VatReport): string => {
    const { startMonth, endMonth } = periodMonthRange(report.period);
    const fmt = (m: number) =>
      new Date(report.period.year, m - 1, 1).toLocaleDateString(locale, { month: 'short' });
    if (startMonth === endMonth) return `${fmt(startMonth)} ${report.period.year}`;
    return `${fmt(startMonth)}–${fmt(endMonth)} ${report.period.year}`;
  };
}

const BLOCKED_REASON_KEY: Record<BlockedReason, string> = {
  no_tax_invoice: 'vat.reason_no_tax_invoice',
  missing_supplier_allocation: 'vat.reason_missing_supplier_allocation',
  non_deductible: 'vat.reason_non_deductible',
};

const CASH_BASIS_APPROX_REASON_KEY: Record<CashBasisApproxReason, string> = {
  from_sent_at: 'vat.cash_approx_from_sent_at',
  fallback_invoice_date: 'vat.cash_approx_fallback_invoice_date',
};

/**
 * Annual turnover (₪) above which a detailed VAT return (PCN874 / דיווח מפורט) is
 * typically required, so we surface a suggestion to enable `isDetailedFiler`. This
 * is a soft prompt only — the user/advisor confirms and toggles the flag.
 */
const DETAILED_FILER_TURNOVER_CEILING = 500000;

export default function VatReportView() {
  const { t } = useTranslation();
  const { invoices, expenses, businessSettings } = useFinance();
  const formatCurrency = useCurrencyFormatter();
  const periodLabel = usePeriodLabel();

  const isPatur = businessSettings.type === 'EsekPatur';
  const cadence: VatPeriodType = businessSettings.vatReportingPeriod ?? 'bimonthly';
  const cashBasis = businessSettings.vatCashBasis ?? false;

  const reports = useMemo(
    () =>
      buildAllVatReports(invoices, expenses, {
        type: cadence,
        cashBasis,
        allocationThresholdFor: getAllocationThreshold,
        standardRateFor: getVatRate,
      }),
    [invoices, expenses, cadence, cashBasis]
  );

  // Default to the most recent CLOSED period (index 1) if it exists, else the latest.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    reports.find(r => periodKeyString(r.period) === selectedKey) ??
    reports[reports.length > 1 ? 1 : 0] ??
    reports[0];

  // Trailing-12-month standard output base, to suggest monthly filing (§5).
  const trailingBase = useMemo(
    () => reports.slice(0, cadence === 'monthly' ? 12 : 6).reduce((s, r) => s + r.taxableSalesBase + r.zeroRatedSales, 0),
    [reports, cadence]
  );
  const monthlyThreshold = getVatMonthlyFilingThreshold(new Date().toISOString().split('T')[0]);
  const suggestMonthly = cadence === 'bimonthly' && trailingBase > monthlyThreshold;

  if (isPatur) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('vat.title')}</h1>
          <p className="text-slate-500 mt-1">{t('vat.subtitle')}</p>
        </div>
        <Card className="border-s-4 border-s-amber-500">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900">{t('vat.patur_title')}</p>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">{t('vat.patur_desc')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exportCsv = () => {
    if (!selected) return;
    // All numbers come from the pure builder, which reuses the SAME math
    // (computeTotals / expenseInputVat / periodFor) as the on-screen Doch Maam —
    // the view only wraps the result in a Blob and triggers the download.
    const csvContent = buildVatReportCsv(selected, t, periodLabel(selected));
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `vat_report_${periodKeyString(selected.period)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const deadlines = selected ? periodDeadlines(selected.period) : null;
  // Detailed filer (PCN874 / דיווח מפורט) is an explicit advisor-set flag — never
  // inferred from cadence. Only detailed filers get the extra 23rd-of-month deadline.
  const isDetailedFiler = businessSettings.isDetailedFiler ?? false;
  // Suggest enabling detailed filing once this year's turnover crosses the ceiling.
  const ytdTurnover = computeYtdTurnover(invoices, new Date().getFullYear());
  const suggestDetailedFiler = !isDetailedFiler && ytdTurnover > DETAILED_FILER_TURNOVER_CEILING;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('vat.title')}</h1>
          <p className="text-slate-500 mt-1">{t('vat.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <select
              className="flex h-11 md:h-10 rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={selected ? periodKeyString(selected.period) : ''}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {reports.map(r => (
                <option key={periodKeyString(r.period)} value={periodKeyString(r.period)}>
                  {periodLabel(r)}
                </option>
              ))}
            </select>
          )}
          <Button onClick={exportCsv} disabled={!selected} className="h-11 md:h-10 font-bold">
            <Download className="h-4 w-4 me-2" /> {t('vat.export')}
          </Button>
        </div>
      </div>

      {suggestMonthly && (
        <Card className="border-s-4 border-s-amber-500">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 leading-relaxed">
                {t('vat.suggest_monthly', { amount: formatCurrency(monthlyThreshold) })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {suggestDetailedFiler && (
        <Card className="border-s-4 border-s-amber-500">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 leading-relaxed">
                {t('vat.suggest_detailed_filer', { amount: formatCurrency(DETAILED_FILER_TURNOVER_CEILING) })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {selected && (
        <>
          {/* Doch Maam card — the 7 summary fields */}
          <Card>
            <CardHeader>
              <CardTitle>{t('vat.doch_maam_title')}</CardTitle>
              <CardDescription>{periodLabel(selected)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Field label={t('vat.field_taxable_sales_base')} value={formatCurrency(selected.taxableSalesBase)} index={1} />
                <Field label={t('vat.field_zero_rated_sales')} value={formatCurrency(selected.zeroRatedSales)} index={2} />
                <Field label={t('vat.field_exempt_sales')} value={formatCurrency(selected.exemptSales)} index={3} />
                <Field label={t('vat.field_output_vat')} value={formatCurrency(selected.outputVat)} index={4} />
                <Field label={t('vat.field_taxable_inputs_base')} value={formatCurrency(selected.taxableInputsBase)} index={5} />
                <Field label={t('vat.field_input_vat')} value={formatCurrency(selected.inputVat)} index={6} />
                <div className={`flex items-center justify-between rounded-lg p-4 mt-2 ${selected.netVat >= 0 ? 'bg-rose-50 border border-rose-100' : 'bg-green-50 border border-green-100'}`}>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">7</p>
                    <p className="text-sm font-bold text-slate-900">{t('vat.field_net_vat')}</p>
                    <p className={`text-xs ${selected.netVat >= 0 ? 'text-rose-600' : 'text-green-600'}`}>
                      {selected.netVat >= 0 ? t('vat.to_pay') : t('vat.refund')}
                    </p>
                  </div>
                  <span className={`text-2xl font-black ${selected.netVat >= 0 ? 'text-rose-700' : 'text-green-700'}`}>
                    {formatCurrency(Math.abs(selected.netVat))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deadline strip */}
          {deadlines && (
            <Card className="bg-slate-900 text-white border-none">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CalendarClock className="h-6 w-6 text-primary shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-bold">{t('vat.deadlines_title')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-sm">
                      <div>
                        <p className="text-slate-400 text-xs">{t('vat.deadline_manual')}</p>
                        <p className="font-bold">{deadlines.manual}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 text-xs">{t('vat.deadline_online')}</p>
                        <p className="font-bold">{deadlines.online}</p>
                      </div>
                      {isDetailedFiler && (
                        <div>
                          <p className="text-slate-400 text-xs">{t('vat.deadline_detailed')}</p>
                          <p className="font-bold">{deadlines.detailed}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 leading-relaxed">{t('vat.deadline_shabbat_note')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warnings panel */}
          {(selected.invoicesMissingAllocation.length > 0 ||
            selected.excludedInputVatItems.length > 0 ||
            selected.cashBasisApproxItems.length > 0) && (
            <Card className="border-s-4 border-s-rose-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-rose-700">
                  <FileWarning className="h-5 w-5" /> {t('vat.warnings_title')}
                </CardTitle>
                <CardDescription>{t('vat.warnings_subtitle')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected.invoicesMissingAllocation.length > 0 && (
                  <div>
                    <p className="text-sm font-bold text-slate-700">{t('vat.missing_allocation_title')}</p>
                    <p className="text-xs text-slate-500 mb-2">{t('vat.missing_allocation_desc')}</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.invoicesMissingAllocation.map(id => (
                        <Link
                          key={id}
                          to={`/invoices/${id}/edit`}
                          className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-md px-2 py-1 transition-colors"
                        >
                          {id}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {selected.excludedInputVatItems.length > 0 && (
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {t('vat.excluded_input_title', { amount: formatCurrency(selected.excludedInputVat) })}
                    </p>
                    <p className="text-xs text-slate-500 mb-2">{t('vat.excluded_input_desc')}</p>
                    <ul className="space-y-1.5">
                      {selected.excludedInputVatItems.map(item => (
                        <li key={item.expenseId} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5">
                          <span className="text-slate-700 font-medium">{item.vendor} · {item.date}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-slate-400">{t(BLOCKED_REASON_KEY[item.reason])}</span>
                            <span className="font-bold text-rose-600">{formatCurrency(item.vat)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.cashBasisApproxItems.length > 0 && (
                  <div>
                    <p className="text-sm font-bold text-slate-700">{t('vat.cash_approx_title')}</p>
                    <p className="text-xs text-slate-500 mb-2">{t('vat.cash_approx_desc')}</p>
                    <ul className="space-y-1.5">
                      {selected.cashBasisApproxItems.map(item => (
                        <li key={item.invoiceId} className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5">
                          <Link
                            to={`/invoices/${item.invoiceId}/edit`}
                            className="text-slate-700 font-medium hover:text-primary transition-colors"
                          >
                            {item.clientName || item.invoiceId} · {item.date}
                          </Link>
                          <span className="text-slate-400">{t(CASH_BASIS_APPROX_REASON_KEY[item.reason])}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Advisor / basis note */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <Calculator className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t('vat.advisor_note', { basis: cashBasis ? t('vat.basis_cash') : t('vat.basis_accrual') })}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** One Doch Maam summary field row with its official field number. */
function Field({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          {index}
        </span>
        <span className="text-sm text-slate-700">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}
