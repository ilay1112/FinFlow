import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'en' ? 'he' : 'en';
    i18n.changeLanguage(nextLang);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-2 h-9 text-slate-700 hover:text-slate-900 transition-all active:scale-95"
    >
      <div className="flex items-center gap-2">
        <img 
          src={i18n.language === 'he' ? "https://flagcdn.com/w40/il.png" : "https://flagcdn.com/w40/us.png"} 
          alt={i18n.language === 'he' ? "Israel" : "USA"}
          className="h-3.5 w-auto rounded-sm shadow-sm"
        />
        <span className="text-xs font-black uppercase tracking-widest border-s ps-2 border-slate-200">
          {i18n.language === 'he' ? 'HE' : 'EN'}
        </span>
      </div>
    </Button>
  );
}
