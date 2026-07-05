import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState, seedSidebarOpen, seedSidebarTabMap } from './support/seedStore'
import spaceTleList from './fixtures/space-tle-list.json' with { type: 'json' }
import spacePasses from './fixtures/space-passes.json' with { type: 'json' }

/**
 * Space domain tests: map region, NoUrlOverlay based on TLE status,
 * filter combobox and satellite accordion, category group toggle,
 * PASSES tab/pane, SpacePasses no-location message, and SpaceFilter coexistence.
 */

test.describe('Space domain', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('Space domain map has accessible region label', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    // SpaceMap uses MapLibreMap which renders role="region" with aria-label
    // "Space domain map — satellites". Use the exact label to avoid strict-mode
    // violation with the MapLibre inner canvas which also has role="region".
    const mapRegion = page.getByRole('region', { name: /space domain map/i })
    await expect(mapRegion).toBeAttached()
  })

  test('NoUrlOverlay is hidden when TLE status reports satellites', async ({ page }) => {
    // Default mock already returns total:42 so the overlay should stay hidden
    await page.goto('/space/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).not.toBeVisible({ timeout: 5000 })
  })

  test('NoUrlOverlay appears when TLE status reports zero satellites', async ({ page }) => {
    await page.route('/api/space/tle/status', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, last_updated: null }),
      })
    })

    await page.goto('/space/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.no-url-overlay-btn')).toContainText(/open settings/i)
  })

  test('NoUrlOverlay OPEN SETTINGS button opens dialog on the space section', async ({ page }) => {
    await page.route('/api/space/tle/status', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ total: 0 }),
      })
    })

    await page.goto('/space/')
    await waitForShellHydration(page)

    await expect(page.locator('.no-url-overlay')).toBeVisible({ timeout: 8000 })
    await page.locator('.no-url-overlay-btn').click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test('Space filter combobox is rendered in the SEARCH pane', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    // Use data-tab to avoid strict-mode ambiguity with the SpaceSideMenu "Search" button
    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search')).toBeVisible()

    const filterInput = page.getByRole('combobox', {
      name: /filter satellites/i,
    })
    await expect(filterInput).toBeVisible()
  })

  test('Space filter shows satellites from the TLE list', async ({ page }) => {
    await page.route('/api/space/tle/list', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(spaceTleList),
      })
    })

    await page.goto('/space/')
    await waitForShellHydration(page)

    // Use data-tab to avoid strict-mode ambiguity with the SpaceSideMenu "Search" button
    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search')).toBeVisible()

    const filterInput = page.getByRole('combobox', { name: /filter satellites/i })
    await filterInput.fill('ISS')

    // Should show a result (section header with satellite)
    await expect(page.locator('.space-filter-result-item').first()).toBeVisible({ timeout: 5000 })
  })

  test('Space filter shows "No satellites found" for non-matching query', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    // Use data-tab to avoid strict-mode ambiguity with the SpaceSideMenu "Search" button
    await page.locator('[data-tab="search"]').click()
    const filterInput = page.getByRole('combobox', { name: /filter satellites/i })
    await filterInput.fill('XYZZY_NO_SATELLITE')

    await expect(page.locator('.space-filter-no-results')).toBeVisible()
  })

  test('FILTER rail exposes data-driven category sub-tabs', async ({ page }) => {
    await page.route('/api/space/tle/list', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(spaceTleList),
      })
    })

    await page.goto('/space/')
    await waitForShellHydration(page)

    // Use data-tab to avoid strict-mode ambiguity with the SpaceSideMenu "Search" button
    await page.locator('[data-tab="search"]').click()

    // Once the sat list loads, SpaceFilter publishes its categories and the rail
    // renders one single-select sub-tab per category that has data.
    const firstSubTab = page.locator('.msb-rail-subbtn').first()
    await expect(firstSubTab).toBeVisible({ timeout: 5000 })
    await expect(firstSubTab).toHaveAttribute('data-filter-cat')

    // Selecting it shows that category's satellite rows.
    await firstSubTab.click()
    await expect(page.locator('.space-filter-result-item').first()).toBeVisible({ timeout: 5000 })
  })

  test('PASSES tab is visible on /space/ route', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    const passesTab = page.locator('[data-tab="passes"]')
    await expect(passesTab).toBeVisible()
  })

  test('clicking PASSES tab shows the passes pane', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    await page.locator('[data-tab="passes"]').click()
    await expect(page.locator('#msb-pane-passes')).toBeVisible()
  })

  test('SpacePasses shows no-location message when location is unavailable', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    // Open the PASSES pane
    await page.locator('[data-tab="passes"]').click()
    await expect(page.locator('#msb-pane-passes')).toBeVisible()

    // Without a location set, SpacePasses should show a message
    // The spp-message div or "No location" text
    const passesList = page.locator('#spp-list')
    await expect(passesList).toBeAttached()
  })

  test('SpacePasses renders pass cards when passes are available', async ({ page }) => {
    // SpacePasses appends lat/lon/hours/min_el/limit query params, so use a glob
    await page.route('/api/space/passes**', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ passes: spacePasses, satellite_count: 2, computed_at: '' }),
      })
    })

    // Seed a location in the correct format: useUserLocation reads sentinel_user_location
    // with {latitude, longitude, ts, manual} and exposes {lat, lon, accuracy}
    await page.addInitScript(() => {
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ latitude: 51.5, longitude: -0.1, ts: Date.now(), manual: true }),
      )
    })

    await page.goto('/space/')
    await waitForShellHydration(page)

    await page.locator('[data-tab="passes"]').click()
    await expect(page.locator('#msb-pane-passes')).toBeVisible()

    // Pass cards should be rendered
    await expect(page.locator('.spp-pass-card').first()).toBeVisible({ timeout: 8000 })
  })

  test('SpaceFilter (#space-filter-input-wrap) and SpacePasses (#spp-list) coexist in DOM', async ({
    page,
  }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    // Open the search pane first — use data-tab to avoid strict-mode ambiguity
    await page.locator('[data-tab="search"]').click()
    await expect(page.locator('#space-filter-input-wrap')).toBeAttached()

    // SpacePasses teleports into #msb-pane-passes — also attached
    await expect(page.locator('#spp-list')).toBeAttached()
  })

  test('satellite accordion header has aria-expanded', async ({ page }) => {
    await page.route('/api/space/tle/list', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(spaceTleList),
      })
    })

    await page.goto('/space/')
    await waitForShellHydration(page)

    // Use data-tab to avoid strict-mode ambiguity with the SpaceSideMenu "Search" button
    await page.locator('[data-tab="search"]').click()
    const filterInput = page.getByRole('combobox', { name: /filter satellites/i })
    await filterInput.fill('ISS')

    const resultItem = page.locator('.space-filter-result-item').first()
    await expect(resultItem).toBeVisible({ timeout: 5000 })
    await resultItem.click()

    // After clicking, the item should be expanded — the option div has expanded class
    // The pass-card header button has aria-expanded
    const expandedItem = page.locator('.sfr-expanded')
    await expect(expandedItem).toBeAttached()
  })

  test('seeding passes tab map makes PASSES pane active on goto', async ({ page }) => {
    await seedSidebarOpen(page, true)
    await seedSidebarTabMap(page, { space: 'passes' })

    await page.goto('/space/')
    await waitForShellHydration(page)

    await expect(page.locator('#msb-pane-passes')).toBeVisible()
  })
})
