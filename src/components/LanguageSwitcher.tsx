import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
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
      className="flex items-center gap-2 px-2 h-9 text-slate-500 hover:text-slate-900"
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-bold uppercase tracking-wider">
        {i18n.language === 'en' ? 'HE' : 'EN'}
      </span>
    </Button>
  );
}
