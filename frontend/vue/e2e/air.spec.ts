import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState, seedAirReplayEnabled } from './support/seedStore'
import adsbTwoPlanes from './fixtures/adsb-two-planes.json' with { type: 'json' }

/**
 * Air domain tests: map region, AirSideMenu expand/collapse, overlay buttons,
 * filter combobox, AIRCRAFT accordion, REPLAY tab gating.
 */

test.describe('Air domain', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('Air domain map has accessible region label', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    const mapRegion = page.getByRole('region', { name: /air domain map/i })
    await expect(mapRegion).toBeAttached()
  })

  test('AirSideMenu MAP LAYERS accordion expands on click', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    // The rail no longer expands/collapses; overlays live in a MAP LAYERS
    // accordion that toggles on click (aria-expanded reflects the state).
    const layersButton = page.getByRole('button', { name: /map layers/i })
    await expect(layersButton).toBeVisible()
    await expect(layersButton).toHaveAttribute('aria-expanded', 'false')

    await layersButton.click()
    await expect(layersButton).toHaveAttribute('aria-expanded', 'true')
    // A grouped overlay toggle (e.g. Aircraft) is now revealed.
    await expect(page.getByRole('button', { name: /^aircraft$/i })).toBeVisible()

    await layersButton.click()
    await expect(layersButton).toHaveAttribute('aria-expanded', 'false')
  })

  test('AirSideMenu FILTER accordion exposes civil and military aircraft modes', async ({
    page,
  }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    // The aircraft-filter modes live inside the FILTER accordion, revealed when
    // the FILTER icon is clicked.
    await page.getByRole('button', { name: /^filter aircraft$/i }).click()

    await expect(page.getByRole('button', { name: /civil aircraft only/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /military aircraft only/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /show all aircraft/i })).toBeVisible()
  })

  test('filter combobox is rendered in the SEARCH sidebar pane', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    // Open the SEARCH pane
    // Use data-tab selector to avoid strict-mode ambiguity with the AirSideMenu
    // "Search" button which shares the same accessible name pattern
    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search')).toBeVisible()

    // The filter input (combobox) should be present
    const filterInput = page.getByRole('combobox', {
      name: /filter aircraft by callsign/i,
    })
    await expect(filterInput).toBeVisible()
  })

  test('filter combobox shows results when data is stubbed', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search')).toBeVisible()

    const filterInput = page.getByRole('combobox', {
      name: /filter aircraft by callsign/i,
    })

    // AirFilter reads aircraft from the MapLibre adsbControl (not the API stub
    // directly), so aircraft won't appear in search until the control fires data.
    // However AirFilter also searches the STATIC airports list (AIRPORTS_DATA), which
    // is always available. Searching for "Heathrow" matches the LHR static entry and
    // produces an AIRPORTS section header — a reliable, no-stub result.
    await filterInput.fill('Heathrow')

    // The AIRPORTS section header should appear
    await expect(page.locator('.filter-section-label').first()).toBeVisible({ timeout: 5000 })
  })

  test('filter combobox shows "No results" for non-matching query', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search')).toBeVisible()

    const filterInput = page.getByRole('combobox', {
      name: /filter aircraft by callsign/i,
    })
    await filterInput.fill('XYZZYNOTFOUND')

    await expect(page.locator('.filter-no-results')).toBeVisible()
    await expect(page.locator('.filter-no-results')).toContainText(/no results/i)
  })

  test('AIRCRAFT section header has aria-expanded for accordion', async ({ page }) => {
    await page.route('/api/adsb/flights', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(adsbTwoPlanes.aircraft),
      })
    })
    await page.route('/api/adsb/point', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(adsbTwoPlanes),
      })
    })

    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search')).toBeVisible()

    // Type something to get results with the AIRCRAFT section
    const filterInput = page.getByRole('combobox', {
      name: /filter aircraft by callsign/i,
    })
    await filterInput.fill('B')

    // The section header should have aria-expanded
    const sectionBtn = page.locator('.filter-section-label').first()
    await expect(sectionBtn).toBeVisible({ timeout: 5000 })
    await expect(sectionBtn).toHaveAttribute('aria-expanded')
  })

  test('REPLAY tab is absent from sidebar rail when replay is disabled', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    // By default airReplayEnabled=false — the playback tab must not be visible
    await expect(page.locator('[data-tab="playback"]')).not.toBeVisible()
  })

  test('REPLAY tab appears in sidebar rail when replay is enabled', async ({ page }) => {
    await seedAirReplayEnabled(page, true)
    // Override the settings API so main.ts hydration doesn't re-set replay to false
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

    await expect(page.locator('[data-tab="playback"]')).toBeVisible()
  })

  test('NoUrlOverlay hides when settings API returns a valid online URL', async ({ page }) => {
    // Provide a valid URL — no overlay should appear
    await page.route('/api/settings/air', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ onlineDataSourceURL: 'http://192.168.1.1:8080/data/aircraft.json' }),
      })
    })

    await page.goto('/air/')
    await waitForShellHydration(page)

    // Overlay must not be visible
    await expect(page.locator('.no-url-overlay')).not.toBeVisible()
  })

  test('NoUrlOverlay shows when settings API returns no online URL', async ({ page }) => {
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
})
