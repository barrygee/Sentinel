import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import {
  clearPersistedState,
  seedSidebarOpen,
  seedSidebarTabMap,
  seedAirReplayEnabled,
} from './support/seedStore'

/**
 * Map sidebar tests: open/close, rail tab switching, domain-specific tabs,
 * REPLAY tab gating, SDR route behaviour, and mobile close affordance.
 */

test.describe('Map sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('sidebar is closed by default on first load', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    // The sidebar panel shifts left when closed (transform: translateX(...))
    // so it is not visible, but it is attached.
    const sidebar = page.locator('#map-sidebar')
    await expect(sidebar).toBeAttached()
    await expect(sidebar).toHaveClass(/msb-hidden/)
  })

  test('footer "Toggle map sidebar" button opens the sidebar panel', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /toggle map sidebar/i }).click()

    const sidebar = page.locator('#map-sidebar')
    await expect(sidebar).not.toHaveClass(/msb-hidden/)
  })

  test('clicking SEARCH rail tab opens sidebar and shows search pane', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    // Use data-tab to target specifically the sidebar rail button, avoiding
    // strict-mode ambiguity with the AirSideMenu "Search" button
    await page.locator('#map-sidebar-rail [data-tab="search"]').click()

    await expect(page.locator('#map-sidebar')).not.toHaveClass(/msb-hidden/)
    await expect(page.locator('#msb-pane-search')).toBeVisible()
  })

  test('clicking ALERTS rail tab opens sidebar and shows alerts pane', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^alerts$/i }).click()

    await expect(page.locator('#map-sidebar')).not.toHaveClass(/msb-hidden/)
    await expect(page.locator('#msb-pane-alerts')).toBeVisible()
  })

  test('clicking TRACKING rail tab opens sidebar and shows tracking pane', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^tracking$/i }).click()

    await expect(page.locator('#map-sidebar')).not.toHaveClass(/msb-hidden/)
    await expect(page.locator('#msb-pane-tracking')).toBeVisible()
  })

  test('PASSES tab is visible on /space/ but hidden on /air/', async ({ page }) => {
    // On /air/ the CSS rule hides the PASSES button via body[data-domain]
    await page.goto('/air/')
    await waitForShellHydration(page)
    // The passes button exists in the DOM but is hidden by CSS on non-space routes
    const passesButtonOnAir = page.locator('[data-tab="passes"]')
    await expect(passesButtonOnAir).not.toBeVisible()

    // Navigate to /space/ — passes tab should now be visible
    await page
      .getByRole('navigation', { name: /domains/i })
      .getByRole('link', { name: /space/i })
      .click()
    await expect(page).toHaveURL(/\/space\//)
    await waitForShellHydration(page)

    await expect(page.locator('[data-tab="passes"]')).toBeVisible()
  })

  test('REPLAY tab is absent when air replay is disabled (default)', async ({ page }) => {
    // Default: airReplayEnabled = false (the key is '0' or absent)
    await page.goto('/air/')
    await waitForShellHydration(page)

    // The REPLAY tab button should not be in the DOM at all when replay is off
    await expect(page.locator('[data-tab="playback"]')).not.toBeVisible()
  })

  test('REPLAY tab appears when airReplayEnabled is seeded to true', async ({ page }) => {
    await seedAirReplayEnabled(page, true)
    // Also stub the settings API to return replayEnabled:true — main.ts reads this
    // and would otherwise override the localStorage seed with false (default)
    await page.route('/api/settings', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          air: { enabled: true, replayEnabled: true },
          space: { enabled: true },
          sea: { enabled: true },
          land: { enabled: true },
          sdr: { enabled: true },
          app: {},
        }),
      })
    })
    await page.goto('/air/')
    await waitForShellHydration(page)

    // With replay enabled: the playback tab button should be present and visible
    await expect(page.locator('[data-tab="playback"]')).toBeVisible()
  })

  test('SDR route hides the main rail and shows the SDR rail', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    // The main MapSidebar rail is hidden by CSS on the SDR route
    const mainRail = page.locator('#map-sidebar-rail')
    // The SDR sidebar rail is visible
    const sdrRail = page.locator('#sdr-sidebar-rail')

    await expect(mainRail).not.toBeVisible()
    await expect(sdrRail).toBeVisible()
  })

  test('active tab persists across reload when sidebar is open', async ({ page }) => {
    await seedSidebarOpen(page, true)
    await seedSidebarTabMap(page, { air: 'alerts' })
    await page.goto('/air/')
    await waitForShellHydration(page)

    // The alerts pane should be active (from persisted tab map)
    await expect(page.locator('#msb-pane-alerts')).toBeVisible()
  })

  test('mobile close button closes the sidebar panel at 375px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    // Pre-seed the sidebar as open so there's no need to click the footer toggle —
    // at 375px the AirFilter accordion header overlaps the footer area making the
    // footer button unreachable even with force:true. Starting with sidebar already
    // open lets the test go straight to asserting the close button.
    await seedSidebarOpen(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)

    // Sidebar should be open from the seeded state
    await expect(page.locator('#map-sidebar')).not.toHaveClass(/msb-hidden/)

    // The mobile close button is inside the sidebar panel — no overlap risk
    await page.getByRole('button', { name: /close panel/i }).click()
    await expect(page.locator('#map-sidebar')).toHaveClass(/msb-hidden/)
  })
})
