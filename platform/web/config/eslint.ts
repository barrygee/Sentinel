/**
 * Shared flat ESLint config for the Sentinel SPA and the @sentinel/* web
 * packages. Formatting is owned by Prettier (eslint-config-prettier disables
 * every stylistic rule that would conflict); ESLint focuses on correctness and
 * bug-prone patterns.
 *
 * A consumer spreads `sentinelEslintBase` and appends its own blocks (the SPA
 * adds its section-boundaries rule), keeping `eslintConfigPrettier` last.
 */
import eslint from '@eslint/js'
import configPrettier from 'eslint-config-prettier'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

/** Every rule set and rule tuning shared by the app and the web packages. */
export const sentinelEslintBase = tseslint.config(
  // Never lint build output, deps, or static assets.
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'coverage/**'],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // Parse <script> blocks in .vue files with the TypeScript parser.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },

  // Project-wide rule tuning for the existing codebase.
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      // TypeScript already resolves identifiers and flags undefined ones, so the
      // core `no-undef` rule is redundant here and only mis-fires on browser/DOM
      // globals and type-only references. Disabling it is the typescript-eslint
      // documented recommendation for TS sources.
      'no-undef': 'off',

      // The map/DOM controls use best-effort `catch {}` deliberately — an
      // operation that may fail when a layer/source isn't ready yet is allowed to
      // no-op. Permit empty catch blocks; still flag other empty blocks (real bugs).
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Allow intentionally-unused identifiers when prefixed with `_`; don't flag
      // unused caught-error bindings (pairs with the best-effort catch style above).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
)

/**
 * No package imports a section (section-containers plan): sections are
 * federation remotes the shell discovers at runtime, so another package
 * importing one would bundle it twice and couple their releases. A section
 * reaches another only through the shell's registries and capabilities.
 * The SPA's composition root opts out explicitly.
 */
export const noSectionImports = {
  files: ['**/*.{ts,vue}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@sentinel/section-*'],
            message:
              'Sections are federation remotes: reach another section through the shell registries and capabilities (@sentinel/shell-api), never by import.',
          },
        ],
      },
    ],
  },
}

/** Prettier compatibility — must come last to win over earlier stylistic rules. */
export const eslintConfigPrettier = configPrettier
