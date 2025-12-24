import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
// Note: In production, you might want to load these from a server or use a backend plugin
import enCommon from '../../public/locales/en/common.json';
import koCommon from '../../public/locales/ko/common.json';
import zhCommon from '../../public/locales/zh/common.json';
import jaCommon from '../../public/locales/ja/common.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      ko: { common: koCommon },
      zh: { common: zhCommon },
      ja: { common: jaCommon }
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false // react already safes from xss
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;
