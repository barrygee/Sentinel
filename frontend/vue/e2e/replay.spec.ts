import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * Movement history & replay (Settings › <section> › History & Replay): the
 * settings item, the map rail's REPLAY button (only while recording), the
 * timeline bar it opens, its keyboard handling, the way back to live, and
 * WCAG 2.2 AA on the bar.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Boot with Air recording history (the shell hydrates replay from /api/settings). */
async function recordAirHistory(page: Page, enabled: boolean): Promise<string[]> {
  const historyRequests: string[] = []
  await page.route('/api/settings', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        air: { enabled: true, historyEnabled: enabled, historyRetentionDays: 7 },
        space: { enabled: true },
        sea: { enabled: true },
        land: { enabled: true },
        sdr: { enabled: true },
        app: {},
      }),
    })
  })
  // The namespace the Settings control reads (registered after the default mocks, so it wins).
  await page.route('/api/settings/air', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        onlineDataSourceURL: 'http://192.168.1.1:8080/data/source.json',
        historyEnabled: enabled,
        historyRetentionDays: 7,
      }),
    })
  })
  await page.route('**/api/air/history/**', (route) => {
    const url = new URL(route.request().url())
    historyRequests.push(url.pathname + url.search)
    const now = Date.now()
    const bodies: Record<string, unknown> = {
      '/api/air/history/coverage': {
        from: now - 7 * 86_400_000,
        to: now,
        bucketMs: 3_600_000,
        buckets: [[now - 2 * 3_600_000, 120, 'online']],
      },
      '/api/air/history/samples': {
        from: Number(url.searchParams.get('from')),
        to: Number(url.searchParams.get('to')),
        truncated: false,
        entities: {
          abc123: [
            {
              t: Number(url.searchParams.get('from')) + 1000,
              lat: 51.5,
              lon: -0.1,
              alt: 30000,
              heading: 90,
              speed: 420,
              source: 'online',
              extra: { flight: 'BAW1', alt_baro: 30000 },
            },
          ],
        },
      },
      '/api/air/history/status': {
        enabled,
        retentionDays: 7,
        oldestMs: now - 3 * 86_400_000,
        newestMs: now,
        samples: 1200,
        historyBytes: 12 * 1024 * 1024,
        databaseBytes: 50 * 1024 * 1024,
      },
    }
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(bodies[url.pathname] ?? {}),
    })
  })
  return historyRequests
}

/** Open the left side panel's REPLAY tab. */
async function openReplayTab(page: Page) {
  const tab = page.locator('#map-sidebar-rail [data-tab="replay"]')
  await tab.click()
  return page.getByRole('region', { name: 'Air replay' })
}

test.describe('History & replay', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('no REPLAY tab while the section does not record', async ({ page }) => {
    await recordAirHistory(page, false)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await expect(page.locator('#map-sidebar-rail [data-tab="tracking"]')).toBeVisible()
    await expect(page.locator('#map-sidebar-rail [data-tab="replay"]')).toHaveCount(0)
  })

  test('the REPLAY tab opens the controls; going back in time replays, LIVE returns', async ({
    page,
  }) => {
    const historyRequests = await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    const panel = await openReplayTab(page)
    await expect(panel).toBeVisible()
    await expect(panel.getByText('LIVE', { exact: true }).first()).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Back to live' })).toBeDisabled()
    await expect(panel.getByRole('slider', { name: 'Air replay time' })).toHaveAttribute(
      'aria-valuetext',
      'Live',
    )
    await expect.poll(() => historyRequests.includes('/api/air/history/coverage')).toBe(true)

    // Stepping back from live starts replay.
    await panel.getByRole('button', { name: 'Back 1 minute' }).click()
    await expect(panel.getByText('REPLAY', { exact: true })).toBeVisible()
    await expect(panel.getByRole('slider', { name: 'Air replay time' })).toHaveAttribute(
      'aria-valuetext',
      /UTC/,
    )
    await expect
      .poll(() => historyRequests.some((path) => path.startsWith('/api/air/history/samples')))
      .toBe(true)

    await panel.getByRole('button', { name: 'Play replay' }).click()
    await expect(panel.getByRole('button', { name: 'Pause replay' })).toBeVisible()
    await panel.getByRole('radio', { name: '60 times speed' }).click()
    await expect(panel.getByRole('radio', { name: '60 times speed' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await panel.getByRole('button', { name: 'Back to live' }).click()
    await expect(panel.getByRole('button', { name: 'Back to live' })).toBeDisabled()
  })

  test('replay keeps playing with the side panel closed', async ({ page }) => {
    await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    const panel = await openReplayTab(page)
    await panel.getByRole('button', { name: 'Play replay' }).click()
    await page.locator('#map-sidebar-rail [data-tab="replay"]').click() // closes the panel
    await page.waitForTimeout(1500)
    await page.locator('#map-sidebar-rail [data-tab="replay"]').click()
    await expect(panel.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  })

  test('the replay panel meets WCAG 2.2 AA', async ({ page }) => {
    await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    const panel = await openReplayTab(page)
    await panel.getByRole('button', { name: 'Back 1 minute' }).click()
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_AA_TAGS)
      .include('#msb-pane-replay')
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('the replay panel fits a 375px screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: 'Toggle map sidebar' }).click()
    const panel = await openReplayTab(page)
    await expect(panel).toBeVisible()
    // Measured once the drawer has finished sliding in.
    await expect
      .poll(async () => {
        const box = await panel.boundingBox()
        return box !== null && box.x >= 0 && box.x + box.width <= 375
      })
      .toBe(true)
  })

  test('Settings › AIR offers History & Replay with what is recorded', async ({ page }) => {
    await recordAirHistory(page, true)
    await page.goto('/settings/air')
    await waitForShellHydration(page)
    await expect(page.getByText('History & Replay', { exact: true })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Air history recording on' })).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Air history: days to keep, 1 to 7' }),
    ).toBeVisible()
    // What is recorded: status, the time frames so far, and the file size.
    const summary = page.locator('.history-summary')
    await expect(summary.getByText('Recording', { exact: true })).toBeVisible()
    await expect(summary.locator('.history-period-range').first()).toHaveText(/ – .* UTC$/)
    await expect(summary.locator('.history-period-source').first()).toHaveText('ONLINE')
    await expect(summary.getByText('12 MB history · 50 MB database')).toBeVisible()
  })
})
