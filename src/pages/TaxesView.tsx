import { useTranslation } from 'react-i18next';
import { Calculator, Info, CheckCircle, AlertCircle } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { calculateProgressiveTax, NORMATIVE_DEDUCTION_RATE } from '../utils/utils';
import { useCurrencyFormatter } from '../utils/format';

export default function TaxesView() {
  const { t } = useTranslation();
  const { expenses, invoices } = useFinance();

  const totalRevenue = invoices
    .filter(i => i.status === 'Paid')
    .reduce((sum, i) => sum + i.total, 0);
  
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Israeli Esek Zair Normative Deduction (30% of revenue)
  const deductibleExpenses = totalRevenue * NORMATIVE_DEDUCTION_RATE;
  
  const netProfit = totalRevenue - totalExpenses;
  const taxableIncome = totalRevenue - deductibleExpenses;
  const estimatedTax = calculateProgressiveTax(taxableIncome);

  const formatCurrency = useCurrencyFormatter();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('common.taxes')}</h1>
        <p className="text-slate-500 mt-1">{t('taxes.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Summary Card */}
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="pt-8 pb-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <p className="text-primary-foreground/80 text-sm font-medium uppercase tracking-wider">{t('dashboard.tax_liability')}</p>
                  <h2 className="text-5xl font-bold mt-2">{formatCurrency(estimatedTax)}</h2>
                  <p className="text-primary-foreground/60 text-xs mt-4 flex items-center gap-1">
                    <Info className="h-3 w-3" /> {t('dashboard.progressive_tax')}
                  </p>
                </div>
                <div className="bg-white/10 p-6 rounded-2xl backdrop-blur-md border border-white/20 w-full md:w-auto">
                  <div className="space-y-4">
                    <div className="flex justify-between gap-8">
                      <span className="text-primary-foreground/70 text-sm">{t('taxes.taxable_income')}</span>
                      <span className="font-bold">{formatCurrency(taxableIncome)}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-primary-foreground/70 text-sm">{t('dashboard.net_profit')}</span>
                      <span className="font-bold">{formatCurrency(netProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deductions Tracker */}
          <Card>
            <CardHeader>
              <CardTitle>{t('taxes.deductions_tracker')}</CardTitle>
              <CardDescription>{t('taxes.deductions_subtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500 p-2 rounded-full">
                      <CheckCircle className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-green-900">{t('taxes.total_deductible')}</p>
                      <p className="text-xs text-green-700">{t('taxes.deductible_benefit')}</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-green-900">{formatCurrency(deductibleExpenses)}</span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">
                      {t('taxes.normative_description')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Settings / Adjustments */}
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('taxes.configuration')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-sm font-bold text-slate-700">{t('dashboard.progressive_tax')}</p>
                  <p className="text-xs text-slate-500 mt-2">
                    {t('dashboard.progressive_tax_desc')}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {t('taxes.estimate_warning')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 text-white border-none overflow-hidden">
            <CardContent className="pt-6">
              <Calculator className="h-10 w-10 text-primary mb-4" />
              <h3 className="font-bold text-lg">{t('taxes.export_report')}</h3>
              <p className="text-slate-400 text-sm mt-2">{t('taxes.export_subtitle')}</p>
              <Button className="w-full mt-6 bg-white text-slate-900 hover:bg-slate-100">
                {t('taxes.download_report')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
