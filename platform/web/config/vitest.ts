/**
 * Shared Vitest settings for the @sentinel/* web packages: Vue SFC support,
 * jsdom, the shared test setup (jest-axe matcher, in-memory storage) and the
 * 100% coverage gate every package ships at, matching the SPA's.
 */
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { maplibreContourAlias } from './vite.ts'

const sharedTestSetup = fileURLToPath(new URL('./test-setup.ts', import.meta.url))

/**
 * Builds a package's Vitest config; tests and sources live under `src/`.
 *
 * @param packageUrl `import.meta.url` of the package's vitest.config.ts, so
 *   dependency aliases resolve from that package.
 */
export function sentinelPackageVitestConfig(packageUrl: string) {
  return defineConfig({
    plugins: [vue()],
    resolve: { alias: maplibreContourAlias(packageUrl) },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [sharedTestSetup],
      include: ['src/**/*.{test,spec}.{ts,vue}'],
      restoreMocks: true,
      // jest-axe runs a full DOM audit per assertion; under parallel load these
      // can exceed the 5s default on a busy machine.
      testTimeout: 20000,
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'text', 'html', 'lcov'],
        include: ['src/**/*.{ts,vue}'],
        // src/testing holds test doubles other packages' specs import, not product code.
        exclude: ['src/**/*.d.ts', 'src/**/*.{test,spec}.{ts,vue}', 'src/testing/**'],
        thresholds: {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  })
}
