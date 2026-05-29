import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import he from './locales/he.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he }
    },
    fallbackLng: 'he',
    lng: 'he', // Force default to Hebrew unless overridden by localStorage
    detection: {
      order: ['localStorage'], // Only rely on localStorage, ignore browser language to ensure Hebrew default
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false
    }
  });

// Helper to set document attributes
const updateDocumentAttributes = (lng: string) => {
  document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
};

// Handle RTL transition on language change
i18n.on('languageChanged', (lng) => {
  updateDocumentAttributes(lng);
});

// Initial set based on detected or persisted language
updateDocumentAttributes(i18n.language);

export default i18n;
