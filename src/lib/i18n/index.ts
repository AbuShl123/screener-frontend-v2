/**
 * The i18n singleton. Same shape as our other framework-agnostic module-level singletons
 * (`session.ts`, `feedClient.ts`): created once at import, imported for its side effect from
 * `main.tsx` before `<App/>` renders. No Zustand store for language — react-i18next holds the
 * active language inside the instance and re-renders `useTranslation` subscribers on
 * `changeLanguage`.
 *
 * Two languages of static chrome are small enough to bundle synchronously, so there's no
 * Suspense/loading dance: every namespace for every locale is embedded in the `resources`
 * map below and shipped in the main bundle.
 */

import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { config } from '@/config/env';
import {
  NAMESPACES,
  DEFAULT_NAMESPACE,
  SUPPORTED_LOCALES,
  detectionOptions,
  resolveLocale,
} from './config';

// English resources — also the canonical key set for the compile-time typing in i18next.d.ts.
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enOrderbook from './locales/en/orderbook.json';
import enBilling from './locales/en/billing.json';
import enSettings from './locales/en/settings.json';
import enLanding from './locales/en/landing.json';
import enValidation from './locales/en/validation.json';

import ruCommon from './locales/ru/common.json';
import ruAuth from './locales/ru/auth.json';
import ruOrderbook from './locales/ru/orderbook.json';
import ruBilling from './locales/ru/billing.json';
import ruSettings from './locales/ru/settings.json';
import ruLanding from './locales/ru/landing.json';
import ruValidation from './locales/ru/validation.json';

/** Bundled resources, keyed `locale → namespace`. Keep in lockstep with NAMESPACES/SUPPORTED_LOCALES. */
export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    orderbook: enOrderbook,
    billing: enBilling,
    settings: enSettings,
    landing: enLanding,
    validation: enValidation,
  },
  ru: {
    common: ruCommon,
    auth: ruAuth,
    orderbook: ruOrderbook,
    billing: ruBilling,
    settings: ruSettings,
    landing: ruLanding,
    validation: ruValidation,
  },
} as const;

export const i18n = createInstance();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // `en` is the fallback floor; the detector picks the active language above it.
    fallbackLng: config.defaultLocale,
    supportedLngs: [...SUPPORTED_LOCALES],
    // Only match on the base language ('ru-RU' → 'ru'); we ship no region variants.
    load: 'languageOnly',
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    detection: detectionOptions,
    interpolation: {
      // React already escapes interpolated values — double-escaping would corrupt them.
      escapeValue: false,
    },
    // No Suspense: everything is bundled, so there is never a loading state to fall back to.
    react: { useSuspense: false },
  });

/** Reflect the active locale onto <html lang> — set now and on every language change. */
function syncDocumentLang(language: string): void {
  document.documentElement.lang = resolveLocale(language);
}

syncDocumentLang(i18n.language);
i18n.on('languageChanged', syncDocumentLang);

// Public surface — import i18n infra from the `@/lib/i18n` barrel.
export {
  SUPPORTED_LOCALES,
  NAMESPACES,
  DEFAULT_NAMESPACE,
  LOCALE_STORAGE_KEY,
  isLocale,
  resolveLocale,
  type Locale,
  type Namespace,
} from './config';
export { formatDate } from './format';

export default i18n;
