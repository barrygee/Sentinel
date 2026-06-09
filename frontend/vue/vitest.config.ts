import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Reuse the app's Vite config (vue plugin + the `@` alias) so tests resolve
// imports exactly like the build does, then layer the test settings on top.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,vue}'],
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'text', 'html', 'lcov'],
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/main.ts',
          'src/router/**',
          'src/types/**',
          'src/**/*.d.ts',
          'src/test/**',
          'src/**/*.{test,spec}.{ts,vue}',
        ],
        // Ratchet floor — set at the harness's current coverage so CI fails on
        // any regression. Each per-domain backfill PR (6a–6f) raises these as it
        // adds tests; phase 6g sets them all to 100.
        thresholds: {
          lines: 8.9,
          functions: 11.5,
          branches: 5.7,
          statements: 8.8,
        },
      },
    },
  }),
)
