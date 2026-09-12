import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Sea domain: the live-vessels map, its right-edge controls rail, the FILTER
 * pane that lists the same vessels the map plots, and the feed notice.
 *
 * The map canvas itself is opaque to Playwright (and to assistive tech), so
 * these tests assert the accessible surfaces: the map region's name, the
 * hidden vessel-count status line, the rail buttons and the pane list.
 */

test.describe('Sea domain', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('map region and vessel-count status line are present', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await expect(page.getByRole('region', { name: /sea domain map/i })).toBeAttached()
    // The hidden status line states how many vessels the map plots — the
    // fixture has two — and points at the Filter panel for their details.
    await expect(page.getByRole('status', { name: /live vessels/i })).toContainText(
      /2 vessels plotted/i,
      { timeout: 10_000 },
    )
  })

  test('right-edge rail exposes zoom, filter and map-layer controls', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    const rail = page.getByRole('navigation', { name: /sea map controls/i })
    await expect(rail).toBeVisible()
    await expect(rail.getByRole('button', { name: /zoom in/i })).toBeVisible()
    await expect(rail.getByRole('button', { name: /zoom out/i })).toBeVisible()

    const filterTrigger = rail.getByRole('button', { name: /filter vessels/i })
    await expect(filterTrigger).toHaveAttribute('aria-expanded', 'false')
    await filterTrigger.click()
    await expect(filterTrigger).toHaveAttribute('aria-expanded', 'true')
    // One sub-button per FILTER category, "all" active by default.
    await expect(rail.getByRole('button', { name: /show all vessels/i })).toBeVisible()
    await expect(rail.getByRole('button', { name: /cargo vessels only/i })).toBeVisible()
    await expect(rail.getByRole('button', { name: /tankers only/i })).toBeVisible()
    await expect(rail.getByRole('button', { name: /fishing vessels only/i })).toBeVisible()

    const layersTrigger = rail.getByRole('button', { name: /map layers/i })
    await layersTrigger.click()
    await expect(rail.getByRole('button', { name: /live vessels/i })).toBeVisible()
    await expect(rail.getByRole('button', { name: /vessel labels/i })).toBeVisible()
    await expect(rail.getByRole('button', { name: /range ring/i })).toBeVisible()
  })

  test('FILTER pane lists the plotted vessels and opens a vessel accordion', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await page.locator('#map-sidebar-rail [data-tab="search"]').click()
    const pane = page.locator('#msb-pane-search')
    await expect(pane).toBeVisible()

    // Option rows are aria-owned by the listbox rather than nested in it, so
    // they are queried from the pane.
    const list = pane
    await expect(list.getByRole('option', { name: /pride of kent/i })).toBeVisible({
      timeout: 10_000,
    })
    await expect(list.getByRole('option', { name: /ocean harvester/i })).toBeVisible()

    await list.getByRole('option', { name: /pride of kent/i }).click()
    // The accordion shows the vessel's identity and voyage fields.
    // The MMSI appears in the row's secondary line too, so pin to the grid cell.
    await expect(pane.getByText('DOVER')).toBeVisible()
    await expect(pane.getByText('UNDER WAY')).toBeVisible()
    await expect(pane.getByRole('button', { name: /show on map/i })).toBeVisible()
  })

  test('FILTER rail sub-tab narrows the list to one vessel family', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await page.locator('#map-sidebar-rail [data-tab="search"]').click()
    const list = page.locator('#msb-pane-search')
    await expect(list.getByRole('option', { name: /pride of kent/i })).toBeVisible({
      timeout: 10_000,
    })

    await page.locator('#map-sidebar-rail [data-filter-cat="fishing"]').click()
    await expect(list.getByRole('option', { name: /ocean harvester/i })).toBeVisible()
    await expect(list.getByRole('option', { name: /pride of kent/i })).toHaveCount(0)
  })

  test('search box filters vessels by name, MMSI, type or destination', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await page.locator('#map-sidebar-rail [data-tab="search"]').click()
    const pane = page.locator('#msb-pane-search')
    // Option rows are aria-owned by the listbox rather than nested in it, so
    // they are queried from the pane.
    const list = pane
    await expect(list.getByRole('option', { name: /pride of kent/i })).toBeVisible({
      timeout: 10_000,
    })

    await pane.getByRole('combobox', { name: /filter vessels/i }).fill('dover')
    await expect(list.getByRole('option', { name: /pride of kent/i })).toBeVisible()
    await expect(list.getByRole('option', { name: /ocean harvester/i })).toHaveCount(0)
  })

  test('a missing AISStream key surfaces a notice with a settings shortcut', async ({ page }) => {
    const noKey = {
      vessels: [],
      source: 'AISStream',
      status: 'missing-key',
      error: 'No AISStream API key configured',
      lastMessageAt: null,
      silentForMs: null,
      reconnectAttempt: 0,
      nextAttemptAt: null,
      newestPositionAt: null,
      vesselCount: 0,
    }
    await page.route('**/api/sea/vessels**', (route) => {
      void route.fulfill({ contentType: 'application/json', body: JSON.stringify(noKey) })
    })

    await page.goto('/sea/')
    await waitForShellHydration(page)

    const notice = page.locator('.sea-source-notice')
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice).toContainText(/no aisstream api key/i)
    await notice.getByRole('button', { name: /open settings/i }).click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test('a live feed shows no notice', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await expect(page.getByRole('status', { name: /live vessels/i })).toContainText(
      /2 vessels plotted/i,
      { timeout: 10_000 },
    )
    await expect(page.locator('.sea-source-notice')).toHaveCount(0)
  })
})
