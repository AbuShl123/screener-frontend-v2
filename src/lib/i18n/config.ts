/**
 * Static i18n configuration: the supported-locale set, the namespace list, and the
 * detector options. Deliberately free of the i18next instance itself (that's `index.ts`)
 * so these constants can be imported anywhere — a future language switcher, tests — without
 * pulling in the whole runtime.
 */

import { config } from '@/config/env';

/**
 * The ONE source for the supported locale set. `en` is the default/fallback; `ru` is the
 * second language. Adding a third locale is a folder drop-in under `locales/` plus one
 * entry here — the detector's `supportedLngs`, the `Locale` type, and any switcher all
 * derive from this tuple.
 */
export const SUPPORTED_LOCALES = ['en', 'ru'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Namespaces mirror the feature modules (a feature owns its namespace), plus two
 * cross-cutting ones: `common` (shared component copy) and `validation` (form + rule
 * messages). Bundled synchronously at init — two languages of chrome are small.
 */
export const NAMESPACES = [
  'common',
  'auth',
  'orderbook',
  'billing',
  'settings',
  'landing',
  'validation',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

/** Default namespace when `useTranslation()` is called without an argument. */
export const DEFAULT_NAMESPACE: Namespace = 'common';

/** Namespaced localStorage key for an explicit user language choice (see storage.ts's convention). */
export const LOCALE_STORAGE_KEY = 'screener.locale';

/**
 * Browser-language-detector options. Order: an explicit saved choice wins (`localStorage`),
 * else the browser's language (`navigator`), else the configured default is the floor
 * (`fallbackLng` in index.ts). `caches: ['localStorage']` persists a `changeLanguage` call.
 */
export const detectionOptions = {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: LOCALE_STORAGE_KEY,
  caches: ['localStorage'],
};

/** Whether an arbitrary string is one of our supported locales. */
export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Narrow i18next's active `language` (which can be a region variant like `ru-RU`) to a base `Locale`. */
export function resolveLocale(language: string): Locale {
  const base = language.split('-')[0];
  return isLocale(base) ? base : config.defaultLocale;
}
