// Arabic / English (FR-99, NFR-19). English text is the key; Arabic translations live in ar.ts.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './ar';

const saved = (() => { try { return localStorage.getItem('cp_lang'); } catch { return null; } })();

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar } },
  lng: saved === 'ar' ? 'ar' : 'en',
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export const applyDir = (lng: string) => {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
};
applyDir(i18n.language);
i18n.on('languageChanged', (l) => { applyDir(l); try { localStorage.setItem('cp_lang', l); } catch { /* ignore */ } });

export default i18n;
