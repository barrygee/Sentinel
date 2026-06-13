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
      // jest-axe runs a full DOM audit per assertion; under the parallel load of
      // the whole suite these can exceed the 5s default on a busy machine.
      testTimeout: 20000,
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
        // Full coverage gate — the backfill is complete (phases 6a–6g), so every
        // source file is exercised. CI fails on any drop below 100%, which keeps
        // new code shipping with its tests rather than eroding the floor.
        thresholds: {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  }),
)
