import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import { cn } from '../utils/utils';

export function LanguageSwitcher({ mini = false }: { mini?: boolean }) {
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
      className={cn(
        "flex items-center transition-all active:scale-95 text-slate-700 hover:text-slate-900",
        mini ? "h-8 w-8 p-0 justify-center" : "gap-2 px-2 h-9"
      )}
    >
      <div className="flex items-center gap-2">
        <img 
          src={i18n.language === 'he' ? "https://flagcdn.com/w40/il.png" : "https://flagcdn.com/w40/us.png"} 
          alt={i18n.language === 'he' ? "Israel flag" : "USA flag"}
          width="20"
          height="14"
          loading="eager"
          className="h-3.5 w-auto rounded-sm shadow-sm"
        />
        {!mini && (
          <span className="text-xs font-black uppercase tracking-widest border-s ps-2 border-slate-200">
            {i18n.language === 'he' ? 'HE' : 'EN'}
          </span>
        )}
      </div>
    </Button>
  );
}
