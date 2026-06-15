import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Wait for the Sentinel shell to fully hydrate before making assertions.
 *
 * The domain-navigation `<nav aria-label="Domains">` is the canonical signal:
 * it is rendered synchronously by App.vue only once Vue has mounted and the
 * router has settled on a route. The `<main id="main">` landmark is also
 * awaited (via `toBeAttached` rather than `toBeVisible` — the main element
 * collapses to zero height because its children are positioned absolutely).
 *
 * Extract from `a11y.spec.ts` so every spec can import a single shared gate
 * rather than duplicating the same two-line pattern.
 */
export async function waitForShellHydration(page: Page): Promise<void> {
  await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible()
  await expect(page.locator('main#main')).toBeAttached()
}
