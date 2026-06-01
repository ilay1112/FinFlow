import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon,
  Receipt,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  FileText,
  UserPlus
} from 'lucide-react';
import { 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  isWithinInterval, 
  parseISO, 
  startOfYear, 
  endOfYear,
  format,
  eachMonthOfInterval,
  subYears
} from 'date-fns';
import { useFinance } from '../context/FinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { cn } from '../utils/utils';

import { calculateProgressiveTax } from '../utils/utils';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

type TimeRange = 'CurrentMonth' | 'CurrentYear';

interface TrendBadgeProps {
  change: number;
  reverse?: boolean;
  timeRange: TimeRange;
  isRtl: boolean;
  t: (key: string) => string;
}

const TrendBadge = ({ change, reverse = false, timeRange, isRtl, t }: TrendBadgeProps) => {
  const isNeutral = Math.abs(change) < 0.1;
  const isPositive = reverse ? change < 0 : change > 0;
  const colorClass = isNeutral ? "text-slate-400" : isPositive ? "text-green-600" : "text-red-600";
  const Icon = isNeutral ? Minus : isPositive ? ArrowUpRight : ArrowDownRight;

  const comparisonText = timeRange === 'CurrentMonth' 
    ? t('dashboard.vs_last_month') 
    : t('dashboard.vs_last_year');

  return (
    <p className={cn("text-[10px] md:text-xs flex items-center mt-1 font-medium", colorClass)}>
      <Icon className={cn("h-3 w-3 me-1", isRtl && "scale-x-[-1]")} />
      {isNeutral ? t('dashboard.no_change') : `${Math.abs(change).toFixed(1)}% ${comparisonText}`}
    </p>
  );
};

export default function DashboardView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isRtl = i18n.language === 'he';
  const { expenses, invoices } = useFinance();
  const [timeRange, setTimeRange] = useState<TimeRange>('CurrentMonth');

  // Calculate Date Intervals based on selection
  const { start, end, prevStart, prevEnd } = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;

    switch (timeRange) {
      case 'CurrentYear':
        start = startOfYear(now);
        end = endOfYear(now);
        prevStart = startOfYear(subYears(now, 1));
        prevEnd = endOfYear(subYears(now, 1));
        break;
      case 'CurrentMonth':
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        prevStart = startOfMonth(subMonths(now, 1));
        prevEnd = endOfMonth(subMonths(now, 1));
        break;
    }
    return { start, end, prevStart, prevEnd };
  }, [timeRange]);

  // Filter Data
  const currentExpenses = expenses.filter(e => isWithinInterval(parseISO(e.date), { start, end }));
  const prevExpenses = expenses.filter(e => isWithinInterval(parseISO(e.date), { start: prevStart, end: prevEnd }));
  
  const currentRevenue = invoices
    .filter(i => i.status === 'Paid' && isWithinInterval(parseISO(i.date), { start, end }))
    .reduce((sum, i) => sum + i.total, 0);
  
  const prevRevenue = invoices
    .filter(i => i.status === 'Paid' && isWithinInterval(parseISO(i.date), { start: prevStart, end: prevEnd }))
    .reduce((sum, i) => sum + i.total, 0);

  const totalExpenses = currentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const prevTotalExpenses = prevExpenses.reduce((sum, e) => sum + e.amount, 0);

  const netProfit = currentRevenue - totalExpenses;
  const prevNetProfit = prevRevenue - prevTotalExpenses;

  // Esek Zair Normative Deduction (30% of revenue)
  const taxableIncome = currentRevenue - (currentRevenue * 0.30);
  const estimatedTax = calculateProgressiveTax(taxableIncome);

  const calculateChange = (current: number, previous: number) => {

    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const revenueChange = calculateChange(currentRevenue, prevRevenue);
  const expenseChange = calculateChange(totalExpenses, prevTotalExpenses);
  const profitChange = calculateChange(netProfit, prevNetProfit);

  const chartData = useMemo(() => {
    const months = eachMonthOfInterval({ start, end });
    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const rev = invoices
        .filter(i => i.status === 'Paid' && isWithinInterval(parseISO(i.date), { start: monthStart, end: monthEnd }))
        .reduce((sum, i) => sum + i.total, 0);
      
      const exp = expenses
        .filter(e => isWithinInterval(parseISO(e.date), { start: monthStart, end: monthEnd }))
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        name: format(month, 'MMM yy'),
        revenue: rev,
        expenses: exp
      };
    });
  }, [invoices, expenses, start, end]);

  const categoryData = currentExpenses.reduce((acc: { name: string; value: number }[], expense) => {
    const existing = acc.find(item => item.name === expense.category);
    if (existing) {
      existing.value += expense.amount;
    } else {
      acc.push({ name: expense.category, value: expense.amount });
    }
    return acc;
  }, []);

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
      style: 'currency', 
      currency: 'ILS' 
    }).format(value);

  const toggleRange = () => {
    setTimeRange(prev => prev === 'CurrentYear' ? 'CurrentMonth' : 'CurrentYear');
  };

  return (
    <div className="space-y-6 md:space-y-8 px-1 md:px-0">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('dashboard.title')}</h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">{t('dashboard.subtitle')}</p>
        </div>

        <div className="bg-white p-1 md:p-1.5 rounded-xl border shadow-sm flex items-center gap-1">
          {(['CurrentMonth', 'CurrentYear'] as TimeRange[]).map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimeRange(range)}
              className="text-[10px] md:text-xs h-9 md:h-8 px-4"
            >
              {range === 'CurrentMonth' ? t('dashboard.current_month') : t('dashboard.current_year')}
            </Button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Button 
          variant="outline" 
          className="h-20 bg-white border-2 border-dashed border-slate-200 hover:border-primary/50 hover:bg-primary/5 group transition-all"
          onClick={() => navigate('/invoices?action=new')}
        >
          <div className="flex flex-col items-center gap-1">
            <FileText className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
            <span className="text-xs font-bold text-slate-600 group-hover:text-primary">{t('dashboard.new_receipt') || 'New Receipt'}</span>
          </div>
        </Button>
        <Button 
          variant="outline" 
          className="h-20 bg-white border-2 border-dashed border-slate-200 hover:border-primary/50 hover:bg-primary/5 group transition-all"
          onClick={() => navigate('/expenses?action=new')}
        >
          <div className="flex flex-col items-center gap-1">
            <Plus className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
            <span className="text-xs font-bold text-slate-600 group-hover:text-primary">{t('dashboard.new_expense') || 'New Expense'}</span>
          </div>
        </Button>
        <Button 
          variant="outline" 
          className="h-20 bg-white border-2 border-dashed border-slate-200 hover:border-primary/50 hover:bg-primary/5 group transition-all col-span-2 sm:col-span-1"
          onClick={() => navigate('/clients?action=new')}
        >
          <div className="flex flex-col items-center gap-1">
            <UserPlus className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
            <span className="text-xs font-bold text-slate-600 group-hover:text-primary">{t('dashboard.new_client') || 'New Client'}</span>
          </div>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card 
          className="border-s-4 border-s-blue-500 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
          onClick={toggleRange}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('dashboard.total_revenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-black text-slate-900">{formatCurrency(currentRevenue)}</div>
            <TrendBadge change={revenueChange} timeRange={timeRange} isRtl={isRtl} t={t} />
          </CardContent>
        </Card>

        <Card 
          className="border-s-4 border-s-amber-500 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
          onClick={toggleRange}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('dashboard.total_expenses')}</CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-black text-slate-900">{formatCurrency(totalExpenses)}</div>
            <TrendBadge change={expenseChange} reverse timeRange={timeRange} isRtl={isRtl} t={t} />
          </CardContent>
        </Card>

        <Card 
          className={cn("border-s-4 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]", netProfit >= 0 ? "border-s-green-500" : "border-s-red-500")}
          onClick={toggleRange}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('dashboard.net_profit')}</CardTitle>
            <TrendingUp className={cn("h-4 w-4", netProfit >= 0 ? "text-green-500" : "text-red-500")} />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-black text-slate-900">{formatCurrency(netProfit)}</div>
            <TrendBadge change={profitChange} timeRange={timeRange} isRtl={isRtl} t={t} />
          </CardContent>
        </Card>

        <Card 
          className="border-s-4 border-s-indigo-500 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]"
          onClick={toggleRange}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-1 md:pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('dashboard.tax_liability')}</CardTitle>
            <Calculator className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-black text-slate-900">{formatCurrency(estimatedTax)}</div>
            <Badge variant="outline" className="mt-2 font-mono text-[9px] md:text-[10px] bg-indigo-50/50 border-indigo-100 text-indigo-700">
              {t('dashboard.progressive_tax')}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base md:text-lg font-bold flex items-center gap-2 text-slate-900">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  {t('dashboard.revenue_vs_expenses')}
                </CardTitle>
                <CardDescription className="text-xs">{t('dashboard.subtitle')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px] p-0 pr-4 md:p-6 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b' }} reversed={isRtl} />
                <YAxis axisLine={false} tickLine={false} orientation={isRtl ? "right" : "left"} tickFormatter={(value) => `₪${value}`} tick={{ fontSize: 9, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', textAlign: isRtl ? 'right' : 'left', fontSize: '11px' }}
                  formatter={(value: unknown) => formatCurrency(Number(value || 0))}
                />
                <Legend iconType="circle" verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', paddingBottom: '20px' }} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('invoices.paid')} barSize={window.innerWidth < 768 ? 15 : 30} />
                <Bar dataKey="expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} name={t('common.expenses')} barSize={window.innerWidth < 768 ? 15 : 30} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-bold flex items-center gap-2 text-slate-900">
              <PieChartIcon className="h-5 w-5 text-indigo-500" />
              {t('dashboard.expenses_by_category')}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-auto md:h-[350px] flex flex-col md:flex-row items-center gap-4 pb-6">
            {categoryData.length > 0 ? (
              <>
                <div className="w-full md:w-1/2 h-[200px] md:h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: unknown) => formatCurrency(Number(value || 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-1/2 space-y-2.5 px-2 md:px-4 overflow-y-auto max-h-[200px] md:max-h-full">
                  {categoryData.sort((a, b) => b.value - a.value).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between group">
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-[11px] md:text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors truncate">{item.name}</span>
                      </div>
                      <span className="text-[11px] md:text-xs font-black text-slate-900 shrink-0">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full h-[200px] flex items-center justify-center text-slate-400 text-sm italic">
                {t('dashboard.no_data')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4 md:py-6">
          <div>
            <CardTitle className="text-base md:text-lg font-bold">{t('dashboard.recent_activity')}</CardTitle>
            <CardDescription className="text-[10px] md:text-xs">{t('dashboard.subtitle')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs">{t('dashboard.view_all')}</Button>
        </CardHeader>
        <CardContent className="px-4 md:px-6 pb-6">
          <div className="space-y-4 md:space-y-6">
            {currentExpenses.length > 0 ? (
              currentExpenses.slice(0, 6).map((expense) => (
                <div key={expense.id} className="flex items-center justify-between group gap-3">
                  <div className="flex items-center gap-3 md:gap-4 flex-1 truncate">
                    <div className="bg-slate-50 md:bg-slate-100 p-2 rounded-lg group-hover:bg-indigo-50 transition-colors shrink-0">
                      <Receipt className="h-4 w-4 md:h-5 md:w-5 text-slate-500 group-hover:text-indigo-500" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs md:text-sm font-bold text-slate-900 truncate">{expense.vendor}</p>
                      <p className="text-[10px] md:text-xs text-slate-500 font-medium truncate">
                        {expense.category} <span className="mx-1 hidden md:inline">•</span> <br className="md:hidden" />
                        {format(parseISO(expense.date), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs md:text-sm font-black text-slate-900">-{formatCurrency(expense.amount)}</p>
                    <Badge variant={expense.receiptStatus === 'Uploaded' ? 'success' : 'warning'} className="text-[9px] md:text-[10px] px-1.5 py-0 h-4 leading-none">
                      {expense.receiptStatus}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm italic">
                {t('dashboard.no_data')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
