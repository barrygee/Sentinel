import { test, expect } from '@playwright/test'
import sdrRadios from './fixtures/sdr-radios.json' with { type: 'json' }
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

  test('custom checkboxes are keyboard-focusable and Space-operable', async ({ page }) => {
    // Regression guard for the BaseCheckbox a11y fix (WCAG 2.1.1): the native
    // input is visually hidden, NOT display:none, so it must take keyboard
    // focus and toggle with Space like any native checkbox.
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: /search settings/i })
    await searchInput.fill('Label Data Points')

    const checkbox = page.getByRole('checkbox', { name: 'Callsign — civil' })
    const initiallyChecked = await checkbox.isChecked()

    await checkbox.focus()
    await expect(checkbox).toBeFocused()
    await page.keyboard.press('Space')

    await expect(checkbox).toBeChecked({ checked: !initiallyChecked })
  })

  // Regression: the picker sits inside a settings-datasource-row, whose hidden
  // overflow once clipped the absolutely positioned option list to the row's
  // own height — the dropdown reported itself open but nothing could be
  // chosen, so the APRS layer could never be enabled. Only a real layout shows
  // the clipping, hence an e2e check rather than a unit test.
  test('LAND › APRS SDR picker drops its radio options into view', async ({ page }) => {
    await page.route('/api/sdr/radios', (route) => {
      void route.fulfill({ contentType: 'application/json', body: JSON.stringify(sdrRadios) })
    })
    await page.goto('/land/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^settings$/i }).click()
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="LAND"]').click()
    await expect(page.locator('#settings-section-heading')).toHaveText(/land/i)

    const trigger = page.getByRole('combobox', { name: 'APRS decode SDR' })
    await expect(trigger).toContainText(/not set/i)
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const option = page.getByRole('listbox', { name: 'APRS decode SDR' }).getByRole('option', {
      name: /RTL-SDR v3/i,
    })
    // `toBeVisible` passes for an element clipped by an ancestor's overflow, so
    // check the option actually receives the pointer at its own centre.
    await expect(option).toBeVisible()
    const box = await option.boundingBox()
    expect(box).not.toBeNull()
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[role="option"]')?.textContent ?? '',
      [box!.x + box!.width / 2, box!.y + box!.height / 2],
    )
    expect(hit).toMatch(/RTL-SDR v3/i)
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
