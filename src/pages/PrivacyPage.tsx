import { CreditCard, Lock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';

const CONTACT_EMAIL = 'ilay1112@gmail.com';

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
          <span className="text-xl font-bold text-slate-900 tracking-tight">tbiz</span>
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
              <h3 className="font-bold text-slate-900">Zero-Server Architecture</h3>
              <p>tbiz is a client-side application built on a privacy-first architecture. We operate no servers and no databases of our own: we do not store, process, or transmit your financial data, receipts, or personal information to any server operated by us. All of your data lives exclusively in your own Google account and on your own device.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Google User Data We Access</h3>
              <p>When you sign in with Google, tbiz requests the following, and only the following, Google user data:</p>
              <ul className="list-disc ps-5 space-y-2">
                <li><span className="font-semibold text-slate-800">Basic profile information</span> — your name, email address, and profile picture (OpenID Connect scopes: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">openid</code>, <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">email</code>, <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">profile</code>).</li>
                <li><span className="font-semibold text-slate-800">Google Drive files created by tbiz only</span> (scope: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">drive.file</code>) — the application data file (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">app_data.json</code>), receipt files you upload, and invoice PDFs the app generates, all inside a dedicated <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">tbiz Data</code> folder. This scope does <span className="font-semibold text-slate-800">not</span> allow tbiz to see, read, or modify any other file in your Drive.</li>
                <li><span className="font-semibold text-slate-800">Gmail — send only</span> (scope: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">gmail.send</code>) — the ability to send an email from your Gmail address. tbiz cannot read, search, modify, or delete any of your emails.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">How We Use Google User Data</h3>
              <ul className="list-disc ps-5 space-y-2">
                <li><span className="font-semibold text-slate-800">Profile information</span> is used only to display which Google account is connected inside the app, and to detect an account switch on a shared device so the previous account's locally cached data can be wiped.</li>
                <li><span className="font-semibold text-slate-800">Google Drive</span> serves as your personal database: tbiz reads and writes your business records (expenses, invoices, clients, settings) to the app data file it created, uploads receipt images/PDFs you choose, and archives invoice PDFs it generates for you. All processing happens locally in your browser or app on your device.</li>
                <li><span className="font-semibold text-slate-800">Gmail send</span> is used exclusively to send an invoice email — with the invoice PDF attached — to a recipient you specify, and only at the moment you explicitly press the send button. tbiz never sends email on its own initiative.</li>
              </ul>
              <p>We use Google user data solely to provide these user-facing features. We do not use it for advertising, we do not sell it, we do not use it to train AI or machine-learning models, and we do not use it for any purpose unrelated to the features described above.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Limited Use Disclosure</h3>
              <p>tbiz's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-800">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Data Sharing</h3>
              <p>We do not share, sell, rent, or transfer your Google user data to any third party. There are no analytics providers, advertising networks, or data brokers involved. Your data is transmitted only:</p>
              <ul className="list-disc ps-5 space-y-2">
                <li>Between your device and <span className="font-semibold text-slate-800">Google's own APIs</span> (Drive, Gmail, OAuth), over encrypted connections, to provide the features above; and</li>
                <li>To an <span className="font-semibold text-slate-800">invoice recipient you explicitly choose</span> — when you press send, the invoice email goes from your own Gmail account to the address you entered, or the invoice PDF is handed to the sharing app (e.g. WhatsApp) you select.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Data Storage &amp; Protection</h3>
              <ul className="list-disc ps-5 space-y-2">
                <li>Your data is stored in <span className="font-semibold text-slate-800">your own Google Drive</span>, protected by your Google account's security. Files tbiz creates are private to your account — the app never makes them publicly accessible or shares them by link.</li>
                <li>A working copy of your data is cached in your browser's local storage <span className="font-semibold text-slate-800">on your device only</span>, so the app works offline. This cache is validated and sanitized before use, and is wiped when you sign out or switch Google accounts.</li>
                <li>All communication with Google APIs uses <span className="font-semibold text-slate-800">HTTPS (TLS encryption)</span>.</li>
                <li>Your Google sign-in token is short-lived, is stored only on your device, and is never transmitted anywhere except to Google's own APIs.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Data Retention &amp; Deletion</h3>
              <p>Because we hold no copy of your data, retention is entirely under your control: your data exists only in your Google Drive and on your device, for as long as you choose to keep it. You can delete it at any time:</p>
              <ul className="list-disc ps-5 space-y-2">
                <li><span className="font-semibold text-slate-800">In the app</span> — delete a business workspace from the Profile page (this permanently deletes its folder and all its files from your Drive), or sign out to clear all locally cached data from your device.</li>
                <li><span className="font-semibold text-slate-800">In Google Drive</span> — delete the <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">tbiz Data</code> folder directly; tbiz keeps no other copy.</li>
                <li><span className="font-semibold text-slate-800">Revoke access</span> — remove tbiz's access to your Google account at any time at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-800">myaccount.google.com/permissions</a>, which immediately terminates all of the app's access to your Google user data.</li>
              </ul>
              <p>For assistance with deletion, or any data request, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline hover:text-indigo-800">{CONTACT_EMAIL}</a>. We respond to requests within 30 days.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Cookies &amp; Analytics</h3>
              <p>tbiz does not use cookies or any analytics or tracking tools. We have no visibility into how you use the application.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">Changes &amp; Contact</h3>
              <p>If this policy changes, the updated version will be posted on this page with a new "last updated" date. Questions about this policy or our data practices: <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline hover:text-indigo-800">{CONTACT_EMAIL}</a>.</p>
            </div>
          </div>
        </section>

        {/* Hebrew */}
        <section className="bg-white rounded-2xl border p-8 space-y-6" dir="rtl">
          <h2 className="text-lg font-bold text-indigo-600 border-b pb-3">עברית</h2>

          <div className="space-y-5 text-slate-600 leading-relaxed">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">ארכיטקטורה ללא שרתים</h3>
              <p>tbiz היא אפליקציית צד-לקוח שנבנתה על ארכיטקטורה של פרטיות תחילה. אנחנו לא מפעילים שרתים או מסדי נתונים משלנו: אנחנו לא שומרים, מעבדים או מעבירים את הנתונים הפיננסיים, הקבלות או המידע האישי שלך לשום שרת שבבעלותנו. כל הנתונים שלך נמצאים אך ורק בחשבון Google שלך ובמכשיר שלך.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">נתוני Google שאליהם אנחנו ניגשים</h3>
              <p>בעת התחברות עם Google, האפליקציה מבקשת גישה לנתונים הבאים בלבד:</p>
              <ul className="list-disc pe-5 space-y-2">
                <li><span className="font-semibold text-slate-800">פרטי פרופיל בסיסיים</span> — שם, כתובת אימייל ותמונת פרופיל (הרשאות OpenID Connect:‏ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">openid</code>,‏ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">email</code>,‏ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">profile</code>).</li>
                <li><span className="font-semibold text-slate-800">קבצי Google Drive שנוצרו על ידי tbiz בלבד</span> (הרשאת <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">drive.file</code>) — קובץ נתוני האפליקציה (<code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">app_data.json</code>), קבצי קבלות שאתה מעלה, וקובצי PDF של חשבוניות שהאפליקציה מפיקה — כולם בתוך תיקייה ייעודית בשם <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">tbiz Data</code>. הרשאה זו <span className="font-semibold text-slate-800">אינה</span> מאפשרת ל-tbiz לראות, לקרוא או לשנות שום קובץ אחר ב-Drive שלך.</li>
                <li><span className="font-semibold text-slate-800">Gmail — שליחה בלבד</span> (הרשאת <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">gmail.send</code>) — היכולת לשלוח אימייל מכתובת ה-Gmail שלך. tbiz אינה יכולה לקרוא, לחפש, לשנות או למחוק אימיילים שלך.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">כיצד אנחנו משתמשים בנתוני Google שלך</h3>
              <ul className="list-disc pe-5 space-y-2">
                <li><span className="font-semibold text-slate-800">פרטי הפרופיל</span> משמשים רק להצגת חשבון Google המחובר בתוך האפליקציה, ולזיהוי החלפת חשבון במכשיר משותף כדי למחוק את הנתונים המקומיים של החשבון הקודם.</li>
                <li><span className="font-semibold text-slate-800">Google Drive</span> משמש כמסד הנתונים האישי שלך: האפליקציה קוראת וכותבת את הרישומים העסקיים שלך (הוצאות, חשבוניות, לקוחות, הגדרות) לקובץ הנתונים שהיא יצרה, מעלה קבלות שבחרת, ומאחסנת קובצי PDF של חשבוניות שהופקו עבורך. כל העיבוד מתבצע מקומית בדפדפן או באפליקציה במכשיר שלך.</li>
                <li><span className="font-semibold text-slate-800">שליחת Gmail</span> משמשת אך ורק לשליחת חשבונית במייל — עם קובץ ה-PDF מצורף — לנמען שאתה מזין, ורק ברגע שאתה לוחץ במפורש על כפתור השליחה. tbiz לעולם אינה שולחת מייל ביוזמתה.</li>
              </ul>
              <p>אנחנו משתמשים בנתוני Google שלך אך ורק לאספקת התכונות המתוארות לעיל. איננו משתמשים בהם לפרסום, איננו מוכרים אותם, איננו משתמשים בהם לאימון מודלי בינה מלאכותית, ואיננו משתמשים בהם לשום מטרה שאינה קשורה לתכונות אלו.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">הצהרת שימוש מוגבל (Limited Use)</h3>
              <p>השימוש של tbiz במידע המתקבל מ-Google APIs והעברתו לכל אפליקציה אחרת עומדים ב<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-800">מדיניות נתוני המשתמש של Google API Services</a>, כולל דרישות השימוש המוגבל (Limited Use).</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">שיתוף נתונים</h3>
              <p>אנחנו לא משתפים, מוכרים, משכירים או מעבירים את נתוני Google שלך לשום צד שלישי. אין מעורבות של ספקי אנליטיקה, רשתות פרסום או סוחרי מידע. הנתונים שלך מועברים אך ורק:</p>
              <ul className="list-disc pe-5 space-y-2">
                <li>בין המכשיר שלך לבין <span className="font-semibold text-slate-800">ה-APIs של Google עצמה</span> (Drive,‏ Gmail,‏ OAuth), בחיבור מוצפן, לצורך אספקת התכונות שלעיל; וכן</li>
                <li>אל <span className="font-semibold text-slate-800">נמען חשבונית שבחרת במפורש</span> — בלחיצה על "שליחה", מייל החשבונית נשלח מחשבון ה-Gmail שלך אל הכתובת שהזנת, או שקובץ ה-PDF מועבר לאפליקציית השיתוף (למשל WhatsApp) שבחרת.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">אחסון והגנה על נתונים</h3>
              <ul className="list-disc pe-5 space-y-2">
                <li>הנתונים שלך מאוחסנים ב-<span className="font-semibold text-slate-800">Google Drive הפרטי שלך</span>, ומוגנים על ידי אבטחת חשבון Google שלך. קבצים ש-tbiz יוצרת הם פרטיים לחשבונך — האפליקציה לעולם אינה הופכת אותם לציבוריים ואינה משתפת אותם בקישור.</li>
                <li>עותק עבודה של הנתונים נשמר באחסון המקומי של הדפדפן <span className="font-semibold text-slate-800">במכשיר שלך בלבד</span>, כדי שהאפליקציה תעבוד גם ללא חיבור. עותק זה עובר אימות וניקוי לפני שימוש, ונמחק בעת התנתקות או החלפת חשבון Google.</li>
                <li>כל התקשורת עם ה-APIs של Google מתבצעת ב-<span className="font-semibold text-slate-800">HTTPS (הצפנת TLS)</span>.</li>
                <li>אסימון ההתחברות (token) שלך הוא קצר-מועד, נשמר רק במכשיר שלך, ולעולם אינו נשלח לשום יעד מלבד ה-APIs של Google עצמה.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">שמירת נתונים ומחיקתם</h3>
              <p>מאחר שאיננו מחזיקים עותק של הנתונים שלך, משך השמירה נתון לשליטתך המלאה: הנתונים קיימים רק ב-Drive שלך ובמכשיר שלך, כל עוד תבחר לשמור אותם. ניתן למחוק אותם בכל עת:</p>
              <ul className="list-disc pe-5 space-y-2">
                <li><span className="font-semibold text-slate-800">מתוך האפליקציה</span> — מחיקת סביבת עסק מעמוד הפרופיל (מוחקת לצמיתות את התיקייה וכל קבציה מה-Drive שלך), או התנתקות שמנקה את כל הנתונים המקומיים מהמכשיר.</li>
                <li><span className="font-semibold text-slate-800">מתוך Google Drive</span> — מחיקת התיקייה <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">tbiz Data</code> ישירות; ל-tbiz אין שום עותק נוסף.</li>
                <li><span className="font-semibold text-slate-800">ביטול הרשאות</span> — הסרת הגישה של tbiz לחשבון Google שלך בכל עת בכתובת <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline hover:text-indigo-800">myaccount.google.com/permissions</a>, המנתקת מיידית את כל גישת האפליקציה לנתוני Google שלך.</li>
              </ul>
              <p>לסיוע במחיקה או לכל בקשה בנוגע לנתונים, ניתן לפנות אלינו: <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline hover:text-indigo-800">{CONTACT_EMAIL}</a>. אנו משיבים לפניות בתוך 30 יום.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">עוגיות ואנליטיקס</h3>
              <p>tbiz אינה משתמשת בעוגיות (cookies) או בכלי מעקב ואנליטיקה כלשהם. אין לנו שום נראות לגבי אופן השימוש שלך באפליקציה.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900">שינויים ויצירת קשר</h3>
              <p>אם מדיניות זו תשתנה, הגרסה המעודכנת תפורסם בעמוד זה עם תאריך עדכון חדש. לשאלות על מדיניות זו או על נוהלי הנתונים שלנו: <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-600 underline hover:text-indigo-800">{CONTACT_EMAIL}</a>.</p>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-slate-400 pb-8">Last updated: July 3, 2026</p>
      </main>
    </div>
  );
}
