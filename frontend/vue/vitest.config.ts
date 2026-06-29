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
        all: false,
        exclude: [
          'src/main.ts',
          'src/router/**',
          'src/types/**',
          'src/**/*.d.ts',
          'src/test/**',
          'src/**/*.{test,spec}.{ts,vue}',
        ],
        thresholds: {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
      },
    },
  }),
)
