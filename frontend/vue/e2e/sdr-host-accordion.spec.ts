import { test, expect, type Page, type Route } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * The host accordion in Settings › SDR.
 *
 * In the browser suite because what it checks is hit-testing: the chevron sits
 * past its button's own box, so whether a click on it reaches the button depends
 * on layout. jsdom has no layout, and dispatching a click at the button passes
 * whether or not a pointer could get there.
 */
const HOST = {
  id: 2,
  name: 'Roof Pi',
  address: '192.168.1.30',
  is_local: false,
  may_use_private: false,
  port: 8000,
  enabled: true,
  auth_token_set: true,
  created_at: 1_760_000_000_000,
  last_seen_at: 1_760_000_000_000,
  last_error: null,
  reachable: true,
  api_version: '1',
  auto_add_sdrs: false,
}

async function serveHost(page: Page): Promise<void> {
  const json = (body: unknown) => (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/api/sdr-manager/remote/hosts', json([HOST]))
  await page.route('**/api/sdr-manager/remote/hosts/locations', json([]))
  await page.route(
    `**/api/sdr-manager/remote/hosts/${HOST.id}/devices`,
    json({
      reachable: true,
      last_error: null,
      last_polled_at: 1_760_000_000_000,
      last_success_at: 1_760_000_000_000,
      api_version: '1',
      status: { generated_at: 1_760_000_000_000, sdrs: [] },
    }),
  )
}

test.describe('Settings › SDR host accordion', () => {
  test('opens and folds from a click on the chevron itself', async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
    await serveHost(page)
    await page.goto('/settings/sdr')
    await waitForShellHydration(page)

    const toggle = page.locator('.remote-host-header-toggle').first()
    const chevron = page.locator('.remote-host-header-chevron').first()
    await expect(toggle).toBeVisible()
    await toggle.scrollIntoViewIfNeeded()
    const startedExpanded = (await toggle.getAttribute('aria-expanded')) === 'true'

    // A real pointer click at the chevron's centre, not one aimed at the button.
    const box = (await chevron.boundingBox())!
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.click(centre.x, centre.y)
    await expect(toggle).toHaveAttribute('aria-expanded', String(!startedExpanded))

    await page.mouse.click(centre.x, centre.y)
    await expect(toggle).toHaveAttribute('aria-expanded', String(startedExpanded))
  })
})
