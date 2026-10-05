// Flat ESLint config for the Sentinel Vue SPA (the shell): the shared rules from
// @sentinel/web-config. Loaded as TypeScript via jiti (ESLint >= 9.18).
import {
  eslintConfigPrettier,
  noSectionImports,
  sentinelEslintBase,
} from '@sentinel/web-config/eslint'

export default [
  ...sentinelEslintBase,

  // The committed SPA bundle Vite emits two levels up.
  { ignores: ['../../frontend/spa-dist/**'] },

  // The shell imports no section (section-containers plan): sections live in
  // their own packages (services/sections/*/frontend) and reach the shell only
  // through its registries. The composition root that wires them in, and specs
  // that exercise the shell with real sections, are the only exceptions.
  noSectionImports,
  {
    files: ['src/shell/sections.ts', 'src/**/*.spec.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Prettier compatibility — must come last to win over earlier stylistic rules.
  eslintConfigPrettier,
]
