// Flat ESLint config for the Sentinel Vue SPA: the shared rules from
// @sentinel/web-config plus the SPA's own section-boundaries rule. Loaded as
// TypeScript via jiti (ESLint >= 9.18).
import { eslintConfigPrettier, sentinelEslintBase } from '@sentinel/web-config/eslint'
import sectionBoundaries from './eslint-rules/sectionBoundaries'

export default [
  ...sentinelEslintBase,

  // The committed SPA bundle Vite emits two levels up.
  { ignores: ['../../frontend/spa-dist/**'] },

  // Section boundaries (section-containers plan, P2): no section imports another,
  // and core imports no section — cross-section needs go through the shell's
  // registries and capabilities. Ownership lives in eslint-rules/sectionOwnership.ts.
  {
    files: ['src/**/*.{ts,vue}'],
    plugins: { sentinel: { rules: { 'section-boundaries': sectionBoundaries } } },
    rules: { 'sentinel/section-boundaries': 'error' },
  },

  // Prettier compatibility — must come last to win over earlier stylistic rules.
  eslintConfigPrettier,
]
