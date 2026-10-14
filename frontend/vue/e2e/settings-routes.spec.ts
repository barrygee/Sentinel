import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import { installFakeSdr, type FakeSdrRecorder } from './support/fakeSdr'
import { snapshotAudioContexts, startSdrPlayback, trackAudioContexts } from './support/sdrPlayback'

/**
 * Settings URLs: `/settings/<section>` opens that Settings page directly, but
 * Settings stays the same panel over the page you were on. The URL follows the
 * panel (open, section switch, close), Back/Forward close and reopen it, and
 * nothing behind it changes — the page stays mounted and SDR audio plays on.
 */
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

const dialog = '#settings-panel.settings-panel-visible'
// The footer's Settings button, by id: the SDR panel has a SETTINGS accordion
// of its own, so a role/name locator matches two buttons on the SDR page.
const footerSettingsButton = '#settings-btn'

test.describe('Settings URLs', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('a link to a section opens that section over its own page', async ({ page }) => {
    await page.goto('/settings/air')
    await waitForShellHydration(page)

    await expect(page.locator(dialog)).toBeVisible()
    await expect(page.locator('#settings-section-heading')).toHaveText(/air settings/i)
    await expect(page).toHaveURL(/\/settings\/air$/)
    // The page behind it is AIR's, titled as before.
    await expect(page.locator('body')).toHaveAttribute('data-domain', 'air')
    await expect(page).toHaveTitle('SENTINEL — AIR')
  })

  test('a link to a section the panel does not offer lands on App Settings', async ({ page }) => {
    await page.goto('/settings/nonsense')
    await waitForShellHydration(page)

    await expect(page).toHaveURL(/\/settings\/app$/)
    await expect(page.locator('#settings-section-heading')).toHaveText(/app settings/i)
  })

  test('the URL follows the panel: open, switch section, close', async ({ page }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)

    await page.locator(footerSettingsButton).click()
    await expect(page.locator(dialog)).toBeVisible()
    await expect(page).toHaveURL(/\/settings\/app$/)

    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="SDR"]').click()
    await expect(page).toHaveURL(/\/settings\/sdr$/)
    // Still the SPACE page behind the panel.
    await expect(page.locator('body')).toHaveAttribute('data-domain', 'space')

    await page.keyboard.press('Escape')
    await expect(page.locator(dialog)).toHaveCount(0)
    await expect(page).toHaveURL(/\/space\/$/)
  })

  test('Back closes the panel and Forward reopens it on the same section', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator(footerSettingsButton).click()
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="SPACE"]').click()
    await expect(page).toHaveURL(/\/settings\/space$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/air\/$/)
    await expect(page.locator(dialog)).toHaveCount(0)

    await page.goForward()
    await expect(page).toHaveURL(/\/settings\/space$/)
    await expect(page.locator(dialog)).toBeVisible()
    await expect(page.locator('#settings-section-heading')).toHaveText(/space settings/i)
  })
})

test.describe('Settings URLs leave SDR playback alone', () => {
  let recorder: FakeSdrRecorder

  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await trackAudioContexts(page)
    await installDefaultMocks(page)
    recorder = await installFakeSdr(page, { centerHz: 145_800_000 })
  })

  test('audio keeps playing through opening Settings, switching section and closing it', async ({
    page,
  }) => {
    await startSdrPlayback(page, '145.800')
    await expect.poll(() => recorder.iqFramesSent, { timeout: 5_000 }).toBeGreaterThanOrEqual(3)
    const before = await snapshotAudioContexts(page)
    expect(before).toMatchObject({ count: 1, state: 'running' })
    const countByCmd = (cmd: string) => recorder.controlCommands.filter((c) => c.cmd === cmd).length

    await page.locator(footerSettingsButton).click()
    await expect(page).toHaveURL(/\/settings\/app$/)
    await page.locator('#settings-sidebar .settings-nav-item[data-tooltip="SDR"]').click()
    await expect(page).toHaveURL(/\/settings\/sdr$/)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/sdr\/$/)

    // Same sockets, same AudioContext, no re-tune or release: the radio was
    // never touched, and IQ is still flowing.
    expect(recorder.controlOpens).toBe(1)
    expect(recorder.controlCloses).toBe(0)
    expect(recorder.iqOpens).toBe(1)
    expect(recorder.iqCloses).toBe(0)
    expect(countByCmd('tune')).toBe(1)
    expect(countByCmd('release')).toBe(0)
    const framesBefore = recorder.iqFramesSent
    await expect.poll(() => recorder.iqFramesSent, { timeout: 5_000 }).toBeGreaterThan(framesBefore)
    const after = await snapshotAudioContexts(page)
    expect(after).toMatchObject({ count: 1, state: 'running' })
    expect(after.currentTime ?? 0).toBeGreaterThan(before.currentTime ?? 0)
    await expect(page.getByRole('button', { name: /stop audio/i })).toBeEnabled()
  })
})
