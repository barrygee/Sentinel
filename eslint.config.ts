// Flat ESLint config for the repo-root TypeScript helpers tested under tests/.
// This is the legacy standalone-helper context (jest + ts-jest), separate from
// the Vue SPA in frontend/vue (which has its own eslint.config.ts). Formatting is
// owned by Prettier; ESLint focuses on correctness. Loaded via jiti (ESLint >= 9.18).
import eslint from '@eslint/js';
import configPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // The Vue app and backend have their own tooling; only lint root-level helpers.
    {
        ignores: ['node_modules/**', 'frontend/**', 'backend/**', 'coverage/**'],
    },

    eslint.configs.recommended,
    ...tseslint.configs.recommended,

    {
        files: ['**/*.ts'],
        rules: {
            // TypeScript resolves identifiers (incl. jest/node globals via @types);
            // the core no-undef rule is redundant for TS and mis-fires on globals.
            'no-undef': 'off',
            // Allow intentionally-unused identifiers prefixed with `_`.
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

    // CommonJS config files (e.g. jest.config.js) use module/require globals.
    {
        files: ['**/*.{js,cjs}'],
        languageOptions: { sourceType: 'commonjs' },
    },

    // Prettier compatibility — must come last.
    configPrettier,
);
