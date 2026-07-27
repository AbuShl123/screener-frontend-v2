/**
 * Resolve a translation KEY carried in data — a Zod validation message stored as a
 * namespaced key like 'validation:password.tooShort' — into display text in the active
 * language (§6.3 of the i18n plan: key-as-message, translate-at-render).
 *
 * A schema is a module-level constant evaluated once at import, before any language is
 * picked, so the message can't be translated where it's *defined* — only where the field
 * error is *rendered*. This hook is that render-time resolver, shared by every form.
 *
 * The key is a runtime string (not a literal), so it can't satisfy i18next's compile-time
 * key union; the one unavoidable cast for that is isolated here rather than at each field.
 * Returns `undefined` for an absent message so it can feed an optional `error` prop directly.
 */

import { useTranslation } from 'react-i18next';

export function useValidationError(): (key?: string) => string | undefined {
  const { t } = useTranslation();
  // The key is a runtime string, not a literal, so it can't satisfy i18next's typed key
  // union — this `any` is the single, isolated cast the module doc refers to. The `ns:`
  // prefix in the key (e.g. 'validation:…') routes it regardless of the default namespace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (key) => (key ? (t(key as any) as string) : undefined);
}
