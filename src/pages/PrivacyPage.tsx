import { CreditCard, Lock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function PrivacyPage() {
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
            <Lock className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900">Privacy Policy</h1>
            <p className="text-slate-500 text-sm mt-0.5">מדיניות פרטיות</p>
          </div>
        </div>

        {/* English */}
        <section className="bg-white rounded-2xl border p-8 space-y-6" dir="ltr">
          <h2 className="text-lg font-bold text-indigo-600 border-b pb-3">English</h2>

          <div className="space-y-5 text-slate-600 leading-relaxed">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Zero Data Storage</h3>
              <p>FinFlow is built on a private-first architecture. We do not store, process, or transmit your financial data, receipts, or personal information to our own servers. Everything stays in your browser and your personal Google Drive.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Google OAuth & Drive Access</h3>
              <p>We request access to your Google Drive solely to read and write the application data file (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">app_data.json</code>) and receipts folder inside a dedicated <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">FinFlow Data</code> folder. We request access to Gmail solely to send invoice emails on your behalf when you explicitly trigger the send action.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">No Third-Party Sharing</h3>
              <p>We do not share, sell, or transfer your data to any third parties. Your credentials and financial records never leave your Google account.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Your Responsibility</h3>
              <p>Since we do not hold your data, you are solely responsible for the management, backup, and security of your files within your Google Drive account. We cannot recover lost data or deleted files.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Cookies & Analytics</h3>
              <p>FinFlow does not use cookies or any analytics tracking. We have no visibility into how you use the application.</p>
            </div>
          </div>
        </section>

        {/* Hebrew */}
        <section className="bg-white rounded-2xl border p-8 space-y-6" dir="rtl">
          <h2 className="text-lg font-bold text-indigo-600 border-b pb-3">עברית</h2>

          <div className="space-y-5 text-slate-600 leading-relaxed">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">אפס אחסון נתונים</h3>
              <p>FinFlow נבנתה על ארכיטקטורה של פרטיות תחילה. אנחנו לא שומרים, מעבדים או מעבירים את הנתונים הפיננסיים, הקבלות או המידע האישי שלך לשרתים שלנו. הכל נשאר בדפדפן שלך וב-Google Drive האישי שלך.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Google OAuth וגישה ל-Drive</h3>
              <p>אנחנו מבקשים גישה ל-Google Drive שלך אך ורק לצורך קריאה וכתיבה של קובץ נתוני האפליקציה ותיקיית הקבלות בתוך תיקייה ייעודית בשם <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">FinFlow Data</code>. אנחנו מבקשים גישה ל-Gmail אך ורק לשליחת חשבוניות במייל בשמך, כאשר אתה מפעיל פעולה זו באופן מפורש.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">אין שיתוף עם צד שלישי</h3>
              <p>אנחנו לא משתפים, מוכרים או מעבירים את הנתונים שלך לצדדים שלישיים. פרטי הכניסה והרישומים הפיננסיים שלך לעולם אינם עוזבים את חשבון Google שלך.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">אחריות מלאה</h3>
              <p>מאחר שאנחנו לא מחזיקים בנתונים שלך, אתה האחראי הבלעדי לניהול, הגיבוי והאבטחה של הקבצים שלך בחשבון ה-Google Drive שלך. אין לנו אפשרות לשחזר נתונים שאבדו או קבצים שנמחקו.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">עוגיות ואנליטיקס</h3>
              <p>FinFlow אינה משתמשת בעוגיות (cookies) או בכלי מעקב אנליטיים כלשהם. אין לנו שום נראות לגבי אופן השימוש שלך באפליקציה.</p>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-slate-400 pb-8">Last updated: June 2026</p>
      </main>
    </div>
  );
}
