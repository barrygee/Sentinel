import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Settings › App Settings › Offline Maps, in a real browser.
 *
 * vitest covers each piece in jsdom. This checks the parts jsdom can't see:
 * the assembled group inside the real settings dialog, typing into the bound
 * fields in a real input, the queue → progress → list flow driven by polling,
 * and keyboard focus moving through the inline delete confirmation.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const QUEUED_REGION = {
  id: '0b5d8a52-6f1e-4c55-9d0f-3c2f5b7a9e10',
  label: 'Lake District',
  west: -3.1,
  south: 54.45,
  east: -3.05,
  north: 54.47,
  max_zoom: 12,
  include_basemap: true,
  include_terrain: true,
  status: 'running',
  phase: 'basemap',
  bytes_done: 400_000,
  bytes_estimated: 1_600_000,
  tiles_estimated: 28,
  size_bytes: null,
  error: null,
  created_at: 1_790_000_000_000,
  completed_at: null,
}

const COMPLETED_REGION = {
  ...QUEUED_REGION,
  status: 'complete',
  phase: null,
  bytes_done: 1_600_000,
  size_bytes: 1_600_000,
  completed_at: 1_790_000_060_000,
}

async function openOfflineMaps(page: Page): Promise<Locator> {
  await page.goto('/air/')
  await waitForShellHydration(page)
  await page.getByRole('button', { name: /^settings$/i }).click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  const drawButton = dialog.getByRole('button', { name: 'DRAW AREA' })
  await drawButton.scrollIntoViewIfNeeded()
  await expect(drawButton).toBeVisible()
  return dialog
}

async function typeBound(dialog: Locator, label: string, value: string): Promise<void> {
  const field = dialog.getByLabel(label, { exact: true })
  await field.click()
  await field.fill('')
  // Key by key rather than fill(): the bug this guards against reformatted the
  // field on every keystroke, which a single fill() would never trigger.
  await field.pressSequentially(value)
  await field.press('Enter')
}

test.describe('Offline Maps settings', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
    // DOWNLOAD is disabled while off grid, and in the default auto mode the
    // app decides that by probing an external URL the test browser can't
    // reach. Pin the saved connectivity mode to online instead (main.ts reads
    // it from localStorage before first render).
    await page.addInitScript(() => {
      localStorage.setItem('sentinel_app_connectivityMode', 'online')
    })
  })

  // Scoped to this feature's own subtree: the settings panel around it has
  // known, separately tracked contrast debt that isn't this feature's to fix.
  test('group renders with no WCAG 2.2 AA violations', async ({ page }) => {
    test.slow()
    const dialog = await openOfflineMaps(page)
    await expect(dialog.getByRole('button', { name: 'USE CURRENT VIEW' })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: /offline areas|downloaded/i })).toBeAttached()
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_AA_TAGS)
      .include('.oma-shell')
      .exclude('.maplibregl-map')
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('USE CURRENT VIEW fills all four bounds', async ({ page }) => {
    const dialog = await openOfflineMaps(page)
    await dialog.getByRole('button', { name: 'USE CURRENT VIEW' }).click()
    for (const label of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
      await expect(dialog.getByLabel(label, { exact: true })).not.toHaveValue(/^(0\.00000)?$/)
    }
    const north = Number(await dialog.getByLabel('NORTH', { exact: true }).inputValue())
    const south = Number(await dialog.getByLabel('SOUTH', { exact: true }).inputValue())
    expect(north).toBeGreaterThan(south)
  })

  test('typed multi-digit bounds are kept exactly and produce a live estimate', async ({
    page,
  }) => {
    const dialog = await openOfflineMaps(page)
    await typeBound(dialog, 'NORTH', '54.470')
    await typeBound(dialog, 'SOUTH', '54.450')
    await typeBound(dialog, 'EAST', '-3.050')
    await typeBound(dialog, 'WEST', '-3.100')
    await expect(dialog.getByLabel('NORTH', { exact: true })).toHaveValue('54.47000')
    await expect(dialog.getByLabel('SOUTH', { exact: true })).toHaveValue('54.45000')
    await expect(dialog.getByLabel('EAST', { exact: true })).toHaveValue('-3.05000')
    await expect(dialog.getByLabel('WEST', { exact: true })).toHaveValue('-3.10000')
    await expect(dialog.getByText(/tiles/).first()).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'DOWNLOAD' })).toBeEnabled()
  })

  test('DOWNLOAD queues the area, shows progress, then lists it complete', async ({ page }) => {
    let pollCount = 0
    let createdBody: Record<string, unknown> | null = null
    await page.route('/api/offline-map/regions', async (route: Route) => {
      if (route.request().method() === 'POST') {
        createdBody = route.request().postDataJSON() as Record<string, unknown>
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify(QUEUED_REGION),
        })
        return
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.route(`/api/offline-map/regions/${QUEUED_REGION.id}`, async (route: Route) => {
      pollCount += 1
      const current = pollCount < 2 ? QUEUED_REGION : COMPLETED_REGION
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(current) })
    })

    const dialog = await openOfflineMaps(page)
    await typeBound(dialog, 'NORTH', '54.470')
    await typeBound(dialog, 'SOUTH', '54.450')
    await typeBound(dialog, 'EAST', '-3.050')
    await typeBound(dialog, 'WEST', '-3.100')
    await dialog.getByLabel('LABEL', { exact: true }).fill('Lake District')
    await dialog.getByRole('button', { name: 'DOWNLOAD' }).click()

    await expect(dialog.getByRole('progressbar').first()).toBeVisible()
    expect(createdBody).toMatchObject({
      north: 54.47,
      south: 54.45,
      east: -3.05,
      west: -3.1,
      include_basemap: true,
      include_terrain: true,
      label: 'Lake District',
    })

    const regionRow = dialog.locator('.oma-region-item').first()
    await expect(regionRow).toContainText('Lake District')
    await expect(regionRow).toContainText(/MB/, { timeout: 10_000 })
    await expect(dialog.getByRole('progressbar')).toHaveCount(0)
  })

  test('delete confirmation is keyboard operable and returns focus on cancel', async ({ page }) => {
    await page.route('/api/offline-map/regions', (route: Route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([COMPLETED_REGION]),
      })
    })
    let deleteCalls = 0
    await page.route(`/api/offline-map/regions/${COMPLETED_REGION.id}`, async (route: Route) => {
      if (route.request().method() === 'DELETE') deleteCalls += 1
      await route.fulfill({ status: 204 })
    })

    const dialog = await openOfflineMaps(page)
    const deleteButton = dialog.getByRole('button', { name: 'Delete offline area Lake District' })
    await deleteButton.scrollIntoViewIfNeeded()
    await deleteButton.focus()
    await page.keyboard.press('Enter')

    // Focus lands on NO, the safe default, so a stray Enter can't confirm.
    const noButton = dialog.getByRole('button', { name: 'NO', exact: true })
    await expect(noButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(deleteButton).toBeFocused()
    expect(deleteCalls).toBe(0)

    await page.keyboard.press('Enter')
    await dialog.getByRole('button', { name: 'YES', exact: true }).click()
    await expect(dialog.locator('.oma-region-item')).toHaveCount(0)
    expect(deleteCalls).toBe(1)
  })
})
