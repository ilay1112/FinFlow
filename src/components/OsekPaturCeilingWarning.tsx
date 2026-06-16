import { useTranslation } from 'react-i18next';
import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { computeYtdTurnover } from '../utils/invoiceMath';
import { getOsekPaturCeiling } from '../config/taxConfig';
import { useCurrencyFormatter } from '../utils/format';
import { cn } from '../utils/utils';

/** Below this fraction of the ceiling no warning is shown. */
const APPROACHING_RATIO = 0.9;

/**
 * Osek-patur revenue-ceiling monitor. Renders nothing unless the active business
 * is an `EsekPatur` whose year-to-date turnover has reached 90% of that year's
 * exempt-status ceiling. At 90–99% it shows an amber "approaching" warning; at or
 * above 100% a red "exceeded — must register as Osek Murshe" alert.
 *
 * The component is intentionally thin: turnover is computed by the pure
 * `computeYtdTurnover` helper and the ceiling by the date-keyed `getOsekPaturCeiling`.
 */
export default function OsekPaturCeilingWarning() {
  const { t } = useTranslation();
  const { invoices, businessSettings } = useFinance();
  const formatCurrency = useCurrencyFormatter();

  if (businessSettings.type !== 'EsekPatur') return null;

  const year = new Date().getFullYear();
  const turnover = computeYtdTurnover(invoices, year);
  const ceiling = getOsekPaturCeiling(`${year}-12-31`);
  const ratio = ceiling > 0 ? turnover / ceiling : 0;

  if (ratio < APPROACHING_RATIO) return null;

  const exceeded = ratio >= 1;
  const percent = Math.round(ratio * 100);
  const Icon = exceeded ? AlertOctagon : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border p-4 md:p-5',
        exceeded
          ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            'h-5 w-5 shrink-0 mt-0.5',
            exceeded ? 'text-red-600' : 'text-amber-600'
          )}
        />
        <div className="flex-1 space-y-2">
          <p
            className={cn(
              'text-sm font-bold',
              exceeded ? 'text-red-900' : 'text-amber-900'
            )}
          >
            {exceeded
              ? t('taxes.ceiling.exceeded_title')
              : t('taxes.ceiling.approaching_title')}
          </p>
          <p
            className={cn(
              'text-xs leading-relaxed',
              exceeded ? 'text-red-800' : 'text-amber-800'
            )}
          >
            {exceeded
              ? t('taxes.ceiling.exceeded_desc')
              : t('taxes.ceiling.approaching_desc')}
          </p>
          <div
            className={cn(
              'flex flex-wrap gap-x-6 gap-y-1 text-xs font-medium pt-1',
              exceeded ? 'text-red-900' : 'text-amber-900'
            )}
          >
            <span>
              {t('taxes.ceiling.turnover_label')}:{' '}
              <span className="font-bold">{formatCurrency(turnover)}</span>
            </span>
            <span>
              {t('taxes.ceiling.ceiling_label')}:{' '}
              <span className="font-bold">{formatCurrency(ceiling)}</span>
            </span>
            <span>
              {t('taxes.ceiling.usage_label')}:{' '}
              <span className="font-bold">{percent}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
