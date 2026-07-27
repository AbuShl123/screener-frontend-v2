/**
 * Compile-time key safety. Augment i18next's `CustomTypeOptions` with the shape of the `en`
 * resources as the canonical key set, so `t('auth:login.submitt')` is a TYPE ERROR and keys
 * autocomplete. This is load-bearing: `npm run typecheck` is the only automated gate in this
 * repo (no tests, no lint), so the type is what catches a mistyped or drifted key.
 *
 * `en` is the source of truth; any `ru` file that drifts from it surfaces here as a type error.
 */

import type { DEFAULT_NAMESPACE } from './config';
import type { resources } from './index';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: (typeof resources)['en'];
  }
}
