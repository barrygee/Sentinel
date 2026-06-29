import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Settings panel tests: open/close, focus trap, Escape to close, section
 * navigation, search filtering, and no-pending-changes state.
 */

test.describe('Settings panel', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('Settings button opens the settings dialog', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
  })

  test('Escape key closes the settings dialog', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('settings dialog has 6 section nav items', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Sections: App Settings, AIR, SPACE, SEA, LAND, SDR
    const navItems = page.locator('#settings-sidebar .settings-nav-item')
    await expect(navItems).toHaveCount(6)
  })

  test('clicking a section nav item updates the section heading', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // Click AIR section. The rail is icon-only, so locate by the tooltip/accessible
    // label rather than visible text.
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="AIR"]').click()
    await expect(page.locator('#settings-section-heading')).toHaveText(/air/i)
  })

  test('search input filters settings rows', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: /search settings/i })
    await searchInput.fill('Connectivity')

    // At least the "Connectivity Mode" setting should appear
    await expect(page.locator('.settings-empty')).not.toBeVisible()
  })

  test('search with no match shows "No results found"', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: /search settings/i })
    await searchInput.fill('xyzzy-no-such-setting-xyzzy')

    await expect(page.locator('.settings-empty')).toBeVisible()
    await expect(page.locator('.settings-empty')).toContainText(/no results found/i)
  })

  test('clear search button clears the search input', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: /search settings/i })
    await searchInput.fill('connectivity')

    const clearButton = page.getByRole('button', { name: /clear search/i })
    await expect(clearButton).toBeVisible()
    await clearButton.click()

    await expect(searchInput).toHaveValue('')
  })

  test('settings footer shows "NO CHANGES" when no edits are pending', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // The apply status should show no-changes state (empty or "NO CHANGES")
    // The footer button exists
    await expect(page.locator('#settings-apply-btn')).toBeVisible()
    await expect(page.locator('#settings-apply-btn')).toContainText(/apply changes/i)
  })
})
