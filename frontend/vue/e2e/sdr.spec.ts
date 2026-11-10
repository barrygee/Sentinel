import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import sdrRadios from './fixtures/sdr-radios.json' with { type: 'json' }
import sdrFrequencies from './fixtures/sdr-frequencies.json' with { type: 'json' }
import sdrGroups from './fixtures/sdr-groups.json' with { type: 'json' }
import sdrRecordings from './fixtures/sdr-recordings.json' with { type: 'json' }
import { installFakeSdr } from './support/fakeSdr'

/**
 * SDR domain tests: SDR rail tabs, device combobox, frequency input, Tune/Stop
 * buttons, mode pills, sliders labelled, Recordings pane, and WebSocket stub.
 */

test.describe('SDR domain', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)

    // Stub the SDR WebSocket to avoid hanging connections
    await page.routeWebSocket('/ws/sdr/**', (webSocket) => {
      // Immediately close the stub socket — no hardware, no frames needed
      webSocket.close()
    })
  })

  test('SDR page renders the SdrWaterfall component', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await expect(page.locator('#sdr-page')).toBeAttached()
  })

  test('SDR rail shows 5 tab buttons: radio, frequency-manager, groups, search-ranges, recordings', async ({
    page,
  }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    // The frequency manager is a rail tab again (second, after RADIO); the
    // radio pane's accordion slot now holds FAVOURITES instead.
    const expectedTabs = ['radio', 'frequency-manager', 'groups', 'search-ranges', 'recordings']
    for (const tabId of expectedTabs) {
      await expect(page.locator(`#sdr-sidebar-rail [data-tab="${tabId}"]`)).toBeVisible()
    }
    await expect(page.locator('#sdr-sidebar-rail [data-tab]')).toHaveCount(expectedTabs.length)
  })

  test('SDR rail RADIO tab opens the radio panel pane', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()

    // The radio pane in the sidebar should be active and visible
    await expect(page.locator('#msb-pane-radio')).toBeVisible()
  })

  test('device combobox shows "— select radio —" placeholder when no radio selected', async ({
    page,
  }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    // Navigate to the radio pane
    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    // The device dropdown should show placeholder text
    const deviceDropdown = page.locator('[aria-label="Radio device"]')
    await expect(deviceDropdown).toBeVisible()
    await expect(deviceDropdown).toContainText(/select radio/i)
  })

  test('device combobox opens a listbox with stubbed radio', async ({ page }) => {
    await page.route('/api/sdr/radios', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sdrRadios),
      })
    })

    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    // Click the device combobox to open the listbox
    const deviceDropdown = page.locator('[aria-label="Radio device"]')
    await deviceDropdown.click()

    // The listbox should appear with our stubbed radio
    await expect(page.locator('[role="listbox"][aria-label="Available radios"]')).toBeVisible()
    await expect(page.locator('[role="option"]', { hasText: /RTL-SDR v3/i })).toBeVisible()
  })

  test('frequency input is labelled "Tuned frequency in MHz"', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    const freqInput = page.getByRole('textbox', { name: /tuned frequency in MHz/i })
    await expect(freqInput).toBeAttached()
  })

  test('Tune button is present (and labelled)', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    const tuneButton = page.getByRole('button', { name: /^tune$/i })
    await expect(tuneButton).toBeAttached()
  })

  test('Stop audio button is disabled when not playing', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    const stopButton = page.getByRole('button', { name: /stop audio/i })
    await expect(stopButton).toBeDisabled()
  })

  test('Record button is present and labelled', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    // The record button has aria-label "Record" when not recording
    const recordButton = page.getByRole('button', { name: /^record$/i })
    await expect(recordButton).toBeAttached()
  })

  test('6 mode pills are rendered (NFM, WFM, AM, USB, LSB, CW)', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    const expectedModes = ['NFM', 'WFM', 'AM', 'USB', 'LSB', 'CW']
    for (const mode of expectedModes) {
      await expect(page.locator('.sdr-mode-pills').getByText(mode)).toBeAttached()
    }
  })

  test('SETTINGS accordion shows labelled sliders (expanded by default)', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    // settingsSectionExpanded initialises to true in SdrPanel, so the accordion
    // is already open. The toggle button has aria-controls="sdr-settings-section".
    const settingsToggle = page.locator('[aria-controls="sdr-settings-section"]')
    await expect(settingsToggle).toBeVisible()

    // The settings section is visible without any click
    await expect(page.locator('#sdr-settings-section')).toBeVisible()

    // All four sliders must be visible and labelled (verified via aria-label)
    await expect(page.locator('input[type="range"][aria-label="Volume"]')).toBeVisible()
    await expect(page.locator('input[type="range"][aria-label="Squelch in dBFS"]')).toBeVisible()
    await expect(page.locator('input[type="range"][aria-label="Bandwidth"]')).toBeVisible()
    await expect(page.locator('input[type="range"][aria-label="RF gain in dB"]')).toBeVisible()
  })

  test('RADIO section bars span their padded sections and keep the title on the content edge', async ({
    page,
  }) => {
    // SDR sets --ba-accordion-bleed/-inset on .sdr-tab-pane; without them the
    // bars would sit 20px inside each section on both sides.
    await page.goto('/sdr/')
    await waitForShellHydration(page)
    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    const bars = page.locator(
      '.sdr-tab-pane--radio > .sdr-radio-section > button.base-accordion-toggle--section',
    )
    await expect(bars.first()).toBeVisible()
    const measure = () =>
      bars.evaluateAll((elements) =>
        elements.map((bar) => {
          const barBox = bar.getBoundingClientRect()
          const sectionBox = bar.parentElement!.getBoundingClientRect()
          const titleBox = bar.querySelector('.base-accordion-title')!.getBoundingClientRect()
          return {
            title: bar.textContent?.trim() ?? '',
            leftOffset: Math.round(barBox.left - sectionBox.left),
            rightOffset: Math.round(sectionBox.right - barBox.right),
            titleInset: Math.round(titleBox.left - sectionBox.left),
          }
        }),
      )
    // CONTROLS, FAVOURITES, SCANNER and SEARCH sit directly in the pane.
    expect((await measure()).length).toBeGreaterThanOrEqual(4)
    // Polled, so a panel still animating in can't make a one-off reading.
    await expect
      .poll(async () =>
        (await measure()).every(
          (measurement) =>
            measurement.leftOffset === 0 &&
            measurement.rightOffset === 0 &&
            measurement.titleInset === 20,
        ),
      )
      .toBe(true)
  })

  test('Frequency Manager tab shows frequencies from stub', async ({ page }) => {
    await page.route('/api/sdr/frequencies', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sdrFrequencies),
      })
    })
    await page.route('/api/sdr/groups', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sdrGroups),
      })
    })

    await page.goto('/sdr/')
    await waitForShellHydration(page)

    // The frequency manager is its own rail tab again, so the list is reachable
    // directly rather than by expanding a radio-pane accordion.
    await page.locator('#sdr-sidebar-rail [data-tab="frequency-manager"]').click()
    await expect(page.locator('#sdr-freq-list')).toContainText('Air Traffic Control')
  })

  test('Recordings tab renders from stub data', async ({ page }) => {
    await page.route('/api/sdr/recordings', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(sdrRecordings),
      })
    })

    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="recordings"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()
  })

  test('Scan toggle button (Start scan / Stop scan) is labelled', async ({ page }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)

    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()

    // Expand the scanner section
    const scannerToggle = page.locator('[aria-controls="sdr-scanner-section"]')
    await scannerToggle.click()

    const scanButton = page.getByRole('button', { name: /start scan/i })
    await expect(scanButton).toBeAttached()
  })
})

/**
 * RADIO pane layout: the open sections' scroll bodies must not clip things that
 * deliberately reach past the content edge, and the add-frequency button sits
 * at the right end of the frequency row. Layout, so it needs a real browser.
 */
test.describe('SDR radio pane layout', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
    await page.route('/api/sdr/search-ranges', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            label: 'Air Band',
            low_hz: 118_000_000,
            high_hz: 130_000_000,
            step_hz: 25_000,
            mode: 'AM',
            threshold_dbfs: -30,
            dwell_ms: 250,
            band_name: '',
            enabled: true,
            notes: '',
            sort_order: 0,
          },
        ]),
      })
    })
    // Exactly one radio auto-selects, which enables the tuning controls.
    await installFakeSdr(page, { radios: [{ id: 2, name: 'RTL-SDR V4', centerHz: 145_500_000 }] })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/sdr/')
    await waitForShellHydration(page)
    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.getByRole('button', { name: /^tune$/i })).toBeEnabled({ timeout: 10_000 })
  })

  async function openSearch(page: import('@playwright/test').Page): Promise<void> {
    await page.locator('[aria-controls="sdr-search-section"]').click()
    const saved = page.locator('[aria-controls="sdr-saved-ranges-section"]')
    if ((await saved.getAttribute('aria-expanded')) !== 'true') await saved.click()
  }

  test('a saved range row hover reaches the pane edge, not the text edge', async ({ page }) => {
    await openSearch(page)
    const row = page.locator('.sdr-search-range-item').first()
    await row.hover()
    const hit = await row.evaluate((element) => {
      const pane = document.querySelector('#msb-pane-radio')!.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      const y = box.top + box.height / 2
      // 4px in from the pane's left edge: inside the row's 20px bleed, left of the text.
      return element.contains(document.elementFromPoint(pane.left + 4, y))
    })
    expect(hit).toBe(true)
  })

  test('a focused search input keeps its whole focus ring', async ({ page }) => {
    await openSearch(page)
    const input = page.getByRole('spinbutton', { name: 'Search range low frequency in MHz' })
    await input.focus()
    // Every scroll-clipping ancestor must leave room for the 2px ring on the left.
    const clippedBy = await input.evaluate((element) => {
      const left = element.getBoundingClientRect().left
      const clips: string[] = []
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).overflowX === 'visible') continue
        if (node.getBoundingClientRect().left > left - 2) clips.push(node.id || node.className)
      }
      return clips
    })
    expect(clippedBy).toEqual([])
  })

  test('the add-frequency button sits at the right end of the frequency row', async ({ page }) => {
    const frequency = page.getByRole('textbox', { name: /tuned frequency in MHz/i })
    await frequency.fill('446.0300') // not a saved frequency, so the button is offered
    const row = page.locator('.sdr-freq-row')
    await row.hover()
    const button = page.getByRole('button', {
      name: 'Add this frequency to the Frequency Manager',
    })
    await expect(button).toBeVisible()
    const rowBox = (await row.boundingBox())!
    const buttonBox = (await button.boundingBox())!
    expect(Math.round(buttonBox.x + buttonBox.width)).toBe(Math.round(rowBox.x + rowBox.width))
    expect(Math.round(buttonBox.width)).toBe(28)
    expect(Math.round(buttonBox.height)).toBe(28)
  })
})
