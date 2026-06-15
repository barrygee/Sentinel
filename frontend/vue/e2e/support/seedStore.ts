import type { Page } from '@playwright/test'

/**
 * Helpers to pre-seed localStorage values BEFORE `page.goto()`.
 *
 * Pinia stores read localStorage synchronously at construction time (during
 * the app's `main.ts` import chain). An `addInitScript` call installs the
 * seed before any JavaScript runs, so the store picks it up on its first
 * read rather than seeing the default. This is the only reliable way to
 * control initial store state without touching application code.
 *
 * Usage:
 *   await seedAirReplayEnabled(page, true)
 *   await page.goto('/air/')
 */

/**
 * Seed the `airReplayEnabled` localStorage flag.
 * The air store reads `localStorage.getItem('airReplayEnabled') === '1'`
 * synchronously on construction. Seeding before goto ensures the REPLAY
 * tab renders in the sidebar rail.
 */
export async function seedAirReplayEnabled(page: Page, enabled: boolean): Promise<void> {
  await page.addInitScript(
    (value: string) => {
      localStorage.setItem('airReplayEnabled', value)
    },
    enabled ? '1' : '0',
  )
}

/**
 * Seed the map-sidebar open/closed state in sessionStorage.
 * MapSidebar reads `sessionStorage.getItem('sentinel_sidebar_open') === '1'`.
 */
export async function seedSidebarOpen(page: Page, open: boolean): Promise<void> {
  await page.addInitScript(
    (value: string | null) => {
      if (value) {
        sessionStorage.setItem('sentinel_sidebar_open', value)
      } else {
        sessionStorage.removeItem('sentinel_sidebar_open')
      }
    },
    open ? '1' : null,
  )
}

/**
 * Seed the per-domain sidebar tab map.
 * MapSidebar reads `sentinel_sidebar_tab_by_domain` from localStorage.
 * Pass a partial map e.g. `{ space: 'passes' }` to restore a tab.
 */
export async function seedSidebarTabMap(page: Page, tabMap: Record<string, string>): Promise<void> {
  await page.addInitScript((serialised: string) => {
    localStorage.setItem('sentinel_sidebar_tab_by_domain', serialised)
  }, JSON.stringify(tabMap))
}

/**
 * Seed pre-existing notifications into localStorage.
 * The notifications store reads `localStorage.getItem('notifications')` on init.
 * Each item must conform to the NotificationItem shape (id, type, title, detail, ts).
 */
export async function seedNotifications(
  page: Page,
  items: Array<{
    id: string
    type: string
    title: string
    detail: string
    ts: number
  }>,
): Promise<void> {
  await page.addInitScript((serialised: string) => {
    localStorage.setItem('notifications', serialised)
  }, JSON.stringify(items))
}

/**
 * Clear all Sentinel-related localStorage and sessionStorage keys before a test
 * that must start from a clean slate (no persisted state bleeding in from CI
 * parallel runs or prior tests in the same worker).
 *
 * Called as `page.addInitScript` so the clear runs before any JS.
 */
export async function clearPersistedState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}
