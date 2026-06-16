import { useTranslation } from 'react-i18next';

/**
 * Formats a number as Israeli Shekel currency, localized to the given language.
 * Single source of truth for currency rendering across the app.
 */
export function formatCurrency(value: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', {
    style: 'currency',
    currency: 'ILS',
  }).format(value);
}

/** Hook returning a `formatCurrency(value)` bound to the active i18n language. */
export function useCurrencyFormatter() {
  const { i18n } = useTranslation();
  return (value: number) => formatCurrency(value, i18n.language);
}
