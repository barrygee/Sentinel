/**
 * Vitest settings for this package's own build helpers. They run in Node, not
 * jsdom, and only the federation chunk guards have specs so far, so coverage is
 * reported without the 100% gate the app packages use.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['*.spec.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      include: ['federation.ts'],
    },
  },
})
