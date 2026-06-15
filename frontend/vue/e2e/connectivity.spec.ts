import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Connectivity tests: the "Connectivity Mode" setting is visible in settings,
 * NoUrlOverlay behaviour when no URL is configured vs. when one is provided,
 * and the overlay hiding after settings close with a valid URL.
 */

test.describe('Connectivity', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('"Connectivity Mode" setting is visible in App Settings section', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // The App Settings section should show the "Connectivity Mode" setting
    // It should be visible by default (App Settings is the default section)
    await expect(page.locator('#settings-body')).toContainText(/connectivity mode/i)
  })

  test('NoUrlOverlay appears on Air when settings returns empty online URL', async ({ page }) => {
    await page.route('/api/settings/air', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ onlineDataSourceURL: '' }),
      })
    })

    await page.goto('/air/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
  })

  test('NoUrlOverlay hides when valid URL is returned by settings', async ({ page }) => {
    await page.route('/api/settings/air', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          onlineDataSourceURL: 'http://192.168.1.100:8080/data/aircraft.json',
        }),
      })
    })

    await page.goto('/air/')
    await waitForShellHydration(page)

    // Overlay must not appear when a valid URL is provided
    await expect(page.locator('.no-url-overlay')).not.toBeVisible({ timeout: 5000 })
  })

  test('overlay message references the active mode (online)', async ({ page }) => {
    await page.route('/api/settings/air', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ onlineDataSourceURL: '' }),
      })
    })

    await page.goto('/air/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
    // The message should mention the active mode
    await expect(page.locator('.no-url-overlay-msg')).toContainText(/online/i)
  })

  test('NoUrlOverlay "OPEN SETTINGS" navigates to settings dialog', async ({ page }) => {
    await page.route('/api/settings/sea', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ onlineUrl: '' }),
      })
    })

    await page.goto('/sea/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
    await page.locator('.no-url-overlay-btn').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test('offgrid mode without URL also triggers NoUrlOverlay on Sea', async ({ page }) => {
    // Seed offgrid source override for sea so the offgrid check runs
    await page.addInitScript(() => {
      localStorage.setItem('sentinel_sea_sourceOverride', 'offgrid')
      // No offgrid source set
      localStorage.removeItem('sentinel_sea_offgridSource')
    })

    await page.route('/api/settings/sea', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        // Return a placeholder URL that the overlay logic considers invalid
        body: JSON.stringify({ offgridSource: { url: '' } }),
      })
    })

    await page.goto('/sea/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
  })
})
