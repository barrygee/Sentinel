import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * A slow sdr remote must not hold up boot (docs/plans/section-containers.md
 * §3.5): the shell waits for the SDR engine (the persistent radio pane) only
 * up to its boot timeout, mounts without it, and mounts the pane when the
 * engine's chunk finally arrives.
 */
test('mounts the app without a slow SDR engine, then late-mounts the radio pane', async ({
  page,
}) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
  await clearPersistedState(page)
  await installDefaultMocks(page)
  await page.routeWebSocket('/ws/sdr/**', (webSocket) => webSocket.close())

  // Hold the engine chunk until the test lets it through.
  let releaseEngine!: () => void
  const engineHeld = new Promise<void>((resolve) => (releaseEngine = resolve))
  let engineRequested = false
  await page.route('**/remotes/sdr/spa-assets/engine-*.js', async (route) => {
    engineRequested = true
    await engineHeld
    await route.continue()
  })

  await page.goto('/air/')
  // This boot always sits out the whole engine timeout (3 s) before mounting,
  // which leaves the shared gate's default 5 s little room on a busy CI
  // runner, so the shell gets longer to appear here.
  await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible({
    timeout: 15_000,
  })
  await waitForShellHydration(page)

  // Mounted and usable, with the engine still held back.
  expect(engineRequested).toBe(true)
  await expect(page.locator('#main')).toBeAttached()
  await expect(page.getByRole('link', { name: 'AIR' }).first()).toBeVisible()
  await expect(page.locator('#sdr-panel-panes')).toHaveCount(0)
  expect(warnings.some((text) => text.includes('SDR engine is still loading'))).toBe(true)

  releaseEngine()
  await expect(page.locator('#sdr-panel-panes')).toBeAttached({ timeout: 10_000 })
})
