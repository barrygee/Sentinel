import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Sea/Land scaffolding and NoUrlOverlay tests.
 *
 * Sea and Land are partially-implemented domains — they render a MapLibre map
 * with an accessible region name. These tests confirm the map region label is
 * present and that the NoUrlOverlay triggers when no URL is configured.
 */

test.describe('Sea/Land scaffolding', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('Sea domain map has accessible region label', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    const mapRegion = page.getByRole('region', { name: /sea domain map/i })
    await expect(mapRegion).toBeAttached()
  })

  test('Land domain map has accessible region label', async ({ page }) => {
    await page.goto('/land/')
    await waitForShellHydration(page)

    const mapRegion = page.getByRole('region', { name: /land domain map/i })
    await expect(mapRegion).toBeAttached()
  })

  test('NoUrlOverlay appears on Sea when connectivity mode is online but no URL is set', async ({
    page,
  }) => {
    // Seed offline mode so we control the URL check path.
    // The component reads from localStorage; with no URL set it should show.
    await page.addInitScript(() => {
      // Remove any stored online URL for sea so the overlay triggers
      localStorage.removeItem('sentinel_sea_onlineDataUrl')
      // Set connectivity mode to online
      localStorage.removeItem('sentinel_sea_sourceOverride')
    })

    // Return no URL from the settings API for sea
    await page.route('/api/settings/sea', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ onlineDataUrl: '' }),
      })
    })

    await page.goto('/sea/')
    await waitForShellHydration(page)

    // The NoUrlOverlay "OPEN SETTINGS" button should appear
    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.no-url-overlay-btn')).toBeVisible()
    await expect(page.locator('.no-url-overlay-btn')).toContainText(/open settings/i)
  })

  test('NoUrlOverlay "OPEN SETTINGS" button opens the settings dialog', async ({ page }) => {
    // Return empty URL from settings API to force overlay
    await page.route('/api/settings/sea', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ onlineDataUrl: '' }),
      })
    })

    await page.goto('/sea/')
    await waitForShellHydration(page)

    // Wait for the overlay to appear (async check after fetch)
    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
    await page.locator('.no-url-overlay-btn').click()

    // The settings dialog should open
    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })
})
