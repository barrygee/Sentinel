import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Wait for the Sentinel shell to fully hydrate before making assertions.
 *
 * The top nav is the canonical signal: App.vue renders it synchronously only
 * once Vue has mounted and the router has settled on a route. The shape of that
 * nav is viewport-dependent, so accept either form:
 *  - desktop (>768px): the domain-navigation `<nav aria-label="Domains">`.
 *  - mobile (≤768px): that nav is `display:none` (so it drops out of the
 *    accessibility tree and `getByRole('navigation')` can't match it); the
 *    hamburger `Toggle navigation menu` button is shown in its place.
 * Waiting on either keeps the gate valid at any viewport — without it, every
 * mobile-viewport spec hangs on a nav that is intentionally hidden.
 *
 * The `<main id="main">` landmark is also awaited (via `toBeAttached` rather
 * than `toBeVisible` — the main element collapses to zero height because its
 * children are positioned absolutely).
 *
 * Extract from `a11y.spec.ts` so every spec can import a single shared gate
 * rather than duplicating the same two-line pattern.
 */
export async function waitForShellHydration(page: Page): Promise<void> {
  const domainsNav = page.getByRole('navigation', { name: /domains/i })
  const mobileMenuButton = page.getByRole('button', { name: /toggle navigation menu/i })
  await expect(domainsNav.or(mobileMenuButton).first()).toBeVisible()
  await expect(page.locator('main#main')).toBeAttached()
}
