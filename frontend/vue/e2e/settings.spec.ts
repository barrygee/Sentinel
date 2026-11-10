import { test, expect, type Page } from '@playwright/test'
import sdrRadios from './fixtures/sdr-radios.json' with { type: 'json' }
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Settings panel tests: open/close, focus trap, Escape to close, section
 * navigation, search filtering, and no-pending-changes state.
 */

/** The Settings card titled exactly `title` (descriptions can name other settings). */
function settingCard(page: Page, title: string) {
  return page
    .locator('#settings-body .settings-item')
    .filter({ has: page.locator('.settings-item-label', { hasText: new RegExp(`^${title}$`) }) })
}

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

    // Sections: App Settings, AIR, SPACE, SEA, LAND, SDR. SDR Manager has no
    // page of its own in the full app: its cards are on SDR.
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

    // At least the "App Wide Connectivity Mode" setting should appear
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
    await searchInput.fill('Aircraft Label Fields')

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

  test('AIR shows only the data source settings of the mode picked, keeping the others mounted', async ({
    page,
  }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: /^settings$/i }).click()
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="AIR"]').click()
    const offGridSdr = settingCard(page, 'Off Grid ADS-B SDR')
    const onlineSource = settingCard(page, 'Online Data Source')
    const modes = page.getByRole('radiogroup', { name: 'AIR data source mode' })

    await modes.getByRole('radio', { name: 'ONLINE', exact: true }).click()
    await expect(onlineSource).toBeVisible()
    await expect(offGridSdr).toBeHidden()

    await modes.getByRole('radio', { name: 'OFF GRID', exact: true }).click()
    await expect(offGridSdr).toBeVisible()
    await expect(onlineSource).toBeHidden()

    // Hidden, not removed: whatever was picked in it is still there on the way back.
    await modes.getByRole('radio', { name: 'ONLINE', exact: true }).click()
    await expect(offGridSdr).toBeAttached()
    await expect(offGridSdr).toBeHidden()
  })

  test('SPACE fetches TLEs online and imports them off grid', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: /^settings$/i }).click()
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="SPACE"]').click()
    const modes = page.getByRole('radiogroup', { name: 'SPACE data source mode' })
    await modes.getByRole('radio', { name: 'OFF GRID', exact: true }).click()
    await expect(settingCard(page, 'TLE Import')).toBeVisible()
    await expect(settingCard(page, 'Online Data Source')).toBeHidden()
    await expect(settingCard(page, 'TLE Database')).toBeVisible()
    await modes.getByRole('radio', { name: 'ONLINE', exact: true }).click()
    await expect(settingCard(page, 'Online Data Source')).toBeVisible()
    await expect(settingCard(page, 'TLE Import')).toBeHidden()
  })

  test('SPACE TLE category menu paints above the TLE import row beneath it', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: /^settings$/i }).click()
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="SPACE"]').click()
    await expect(page.locator('#settings-section-heading')).toHaveText(/space/i)

    // Each TLE category row is its own stacking context, so without the fix the
    // import row further down painted over the online row's open menu. Only one
    // TLE row shows at a time now, so this guards the menu against anything
    // later in the panel.
    const onlineTrigger = page.locator('.tle-cat-row-ctrl .settings-dropdown-trigger').first()
    await onlineTrigger.scrollIntoViewIfNeeded()
    await onlineTrigger.click()
    const openMenu = page.locator('.tle-cat-row-ctrl .settings-dropdown-menu--open')
    await expect(openMenu).toBeVisible()
    // The whole menu must be on screen for elementFromPoint to see it, and with
    // Space's Source Override above it the menu runs past the bottom unscrolled.
    await openMenu.evaluate((menu) => menu.scrollIntoView({ block: 'center' }))

    // The open menu must be the topmost thing across its whole visible box:
    // nothing later in the panel (the next card or group heading, the TLE
    // Import row when it is shown) may paint over it. Points down the menu's
    // own box are sampled, not each option, because the list scrolls inside
    // the menu and its last options sit below that box until scrolled to.
    const coveredPoints = await openMenu.evaluate((menu) => {
      const box = menu.getBoundingClientRect()
      const samples = [0.1, 0.3, 0.5, 0.7, 0.9].flatMap((down) =>
        [0.2, 0.8].map((across) => ({
          x: box.left + box.width * across,
          y: box.top + box.height * down,
        })),
      )
      return samples
        .filter(({ x, y }) => !menu.contains(document.elementFromPoint(x, y)))
        .map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`)
    })
    expect(coveredPoints).toEqual([])
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

  test('a group heading chevron points right while folded and down while open', async ({
    page,
  }) => {
    await page.goto('/settings/app')
    await waitForShellHydration(page)
    const heading = page.locator('#settings-panel button.settings-group-label').first()
    const chevron = heading.locator('.settings-group-chevron')
    // The computed matrix of the wrapper's turn: identity = the icon's own
    // downward point; (0, -1, 1, 0) = rotated -90deg, pointing right.
    const pointingDown = 'matrix(1, 0, 0, 1, 0, 0)'
    const pointingRight = 'matrix(0, -1, 1, 0, 0, 0)'
    const turn = () => chevron.evaluate((element) => getComputedStyle(element).transform)

    await expect(heading).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(turn).toBe(pointingDown)

    await heading.click()
    await expect(heading).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(turn).toBe(pointingRight)
  })

  test('APPLY CHANGES saves in place: no page reload, Settings stays open on its section', async ({
    page,
  }) => {
    await page.goto('/settings/app')
    await waitForShellHydration(page)
    await expect(page.locator('#settings-panel.settings-panel-visible')).toBeVisible()
    // A marker on window survives only if the page is not reloaded.
    await page.evaluate(() => {
      ;(window as unknown as { __noReload: string }).__noReload = 'kept'
    })
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/api/settings/'))
        writes.push(new URL(request.url()).pathname)
    })

    // The map palette is a radio group (DARK / LIGHT), not buttons.
    await page
      .locator('#settings-panel')
      .getByRole('radio', { name: /^light$/i })
      .click()
    await page.locator('#settings-apply-btn').click()

    await expect(page.locator('#settings-apply-status')).toHaveText('SAVED')
    expect(writes).toContain('/api/settings/app/mapTheme')
    // The change is live, without a reload.
    await expect(page.locator('html')).toHaveAttribute('data-map-theme', 'light')
    await expect(page).toHaveURL(/\/settings\/app$/)
    await expect(page.locator('#settings-panel.settings-panel-visible')).toBeVisible()
    // Give a reload (the old behaviour, after ~1.2 s) every chance to happen.
    await page.waitForTimeout(2000)
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: string }).__noReload),
    ).toBe('kept')
  })
})
