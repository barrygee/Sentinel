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

test.describe('History & replay', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('no REPLAY button while the section does not record', async ({ page }) => {
    await recordAirHistory(page, false)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await expect(page.getByRole('button', { name: /map layers/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toHaveCount(0)
  })

  test('REPLAY opens the timeline on recorded data, and Esc returns to live', async ({ page }) => {
    const historyRequests = await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)

    const replayButton = page.getByRole('button', { name: 'Replay', exact: true })
    await expect(replayButton).toHaveAttribute('aria-pressed', 'false')
    await replayButton.click()
    await expect(replayButton).toHaveAttribute('aria-pressed', 'true')

    const bar = page.getByRole('region', { name: 'Air replay' })
    await expect(bar).toBeVisible()
    await expect(bar.getByText('REPLAY', { exact: true })).toBeVisible()
    await expect(bar.getByRole('slider', { name: 'Air replay time' })).toHaveAttribute(
      'aria-valuetext',
      /UTC/,
    )
    await expect(bar.getByRole('radiogroup', { name: 'Replay speed' })).toBeVisible()
    // The recording is read, not the live feed.
    await expect
      .poll(() => historyRequests.some((path) => path.startsWith('/api/air/history/samples')))
      .toBe(true)
    await expect.poll(() => historyRequests.includes('/api/air/history/coverage')).toBe(true)

    // Play and pause from the keyboard and the button.
    await bar.getByRole('button', { name: 'Play replay' }).click()
    await expect(bar.getByRole('button', { name: 'Pause replay' })).toBeVisible()
    await bar.getByRole('slider', { name: 'Air replay time' }).focus()
    await page.keyboard.press('Space')
    await expect(bar.getByRole('button', { name: 'Play replay' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(bar).toBeHidden()
    await expect(replayButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('LIVE leaves replay', async ({ page }) => {
    await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: 'Replay', exact: true }).click()
    const bar = page.getByRole('region', { name: 'Air replay' })
    await bar.getByRole('button', { name: 'Back to live' }).click()
    await expect(bar).toBeHidden()
  })

  test('the timeline bar meets WCAG 2.2 AA', async ({ page }) => {
    await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: 'Replay', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Air replay' })).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_AA_TAGS)
      .include('.section-playback-bar')
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('the timeline fits a 375px screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 })
    await recordAirHistory(page, true)
    await page.goto('/air/')
    await waitForShellHydration(page)
    // The map rail stays on screen on phones, so REPLAY is reachable there too.
    await page.getByRole('button', { name: 'Replay', exact: true }).click()
    const bar = page.getByRole('region', { name: 'Air replay' })
    await expect(bar).toBeVisible()
    const box = (await bar.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
  })

  test('Settings › AIR offers History & Replay with its status', async ({ page }) => {
    await recordAirHistory(page, true)
    await page.goto('/settings/air')
    await waitForShellHydration(page)
    await expect(page.getByText('History & Replay', { exact: true })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Air history recording on' })).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Air history: days to keep, 1 to 7' }),
    ).toBeVisible()
    await expect(page.getByText(/Recording · 3\.0 days kept · 50 MB on disk/)).toBeVisible()
  })
})
