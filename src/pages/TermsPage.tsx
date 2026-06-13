import { CreditCard, Info, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b flex items-center justify-between px-6 md:px-12 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-primary rounded-lg p-1.5">
            <CreditCard className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">FinFlow</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 text-slate-500">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 space-y-12">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-3 rounded-2xl">
            <Info className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900">Terms of Service</h1>
            <p className="text-slate-500 text-sm mt-0.5">תנאי שימוש</p>
          </div>
        </div>

        {/* English */}
        <section className="bg-white rounded-2xl border p-8 space-y-6" dir="ltr">
          <h2 className="text-lg font-bold text-indigo-600 border-b pb-3">English</h2>

          <div className="space-y-5 text-slate-600 leading-relaxed">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Free to Use</h3>
              <p>FinFlow is an open-source freeware project. It is 100% free to use for personal and commercial business purposes without any subscription fees, now and in the future.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">No Warranty</h3>
              <p>This software is provided "as is", without warranty of any kind, express or implied. This includes but is not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">No Liability</h3>
              <p>The developers shall not be liable for any claims, damages, financial losses, data loss, or other liability arising from the use or inability to use this application, even if advised of the possibility of such damages.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Tax & Financial Advice</h3>
              <p>FinFlow provides simplified tax estimates for informational purposes only. It does not constitute professional tax or financial advice. Always consult a licensed accountant or tax professional for official filings.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Open Source</h3>
              <p>The source code is available on GitHub under an open-source license. You are free to inspect, fork, and contribute to the project.</p>
            </div>
          </div>
        </section>

        {/* Hebrew */}
        <section className="bg-white rounded-2xl border p-8 space-y-6" dir="rtl">
          <h2 className="text-lg font-bold text-indigo-600 border-b pb-3">עברית</h2>

          <div className="space-y-5 text-slate-600 leading-relaxed">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">חופשי לשימוש</h3>
              <p>FinFlow הוא פרויקט קוד פתוח (freeware). הוא חופשי לשימוש ב-100% למטרות אישיות ועסקיות מסחריות ללא כל דמי מנוי, עכשיו ובעתיד.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">העדר אחריות</h3>
              <p>תוכנה זו מסופקת "כמות שהיא" (as is), ללא כל אחריות מכל סוג שהוא, מפורשת או משתמעת. זה כולל, אך אינו מוגבל ל, אחריות לסחירות, התאמה למטרה מסוימת, או אי-הפרה.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">העדר חבות</h3>
              <p>המפתחים לא יהיו אחראים לכל תביעה, נזק, הפסד כספי, אובדן נתונים או חבות אחרת הנובעת מהשימוש או חוסר היכולת להשתמש באפליקציה זו, אפילו אם הם קיבלו הודעה על האפשרות לנזקים כאלה.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">ייעוץ מס וכספי</h3>
              <p>FinFlow מספקת הערכות מס מפושטות למטרות מידע בלבד. היא אינה מהווה ייעוץ מס או פיננסי מקצועי. יש להתייעץ תמיד עם רואה חשבון מוסמך לגבי דיווחים רשמיים.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">קוד פתוח</h3>
              <p>קוד המקור זמין ב-GitHub תחת רישיון קוד פתוח. אתה חופשי לבדוק, לפצל (fork) ולתרום לפרויקט.</p>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-slate-400 pb-8">Last updated: June 2026</p>
      </main>
    </div>
  );
}
