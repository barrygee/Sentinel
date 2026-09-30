import { test, expect, type Page } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import { installFakeSdr, type FakeSdrRecorder } from './support/fakeSdr'

/**
 * Parity baseline (P0): SDR audio playback and tuning must survive navigating
 * between sections. This is a REGRESSION LOCK for the planned Module
 * Federation split — today it works because App.vue mounts a single, always-
 * rendered <SdrTabPanel/> (MapSidebar.vue's #radio pane) and
 * useSdrAudio.ts/useSdrControlSocket.ts hold module-level singletons (one
 * AudioContext, one IQ WebSocket, one control WebSocket) that are never torn
 * down by a route change. If the remote-module split ever remounts the SDR
 * section per-route, this suite goes red.
 *
 * Chromium needs `--autoplay-policy=no-user-gesture-required` because the
 * click that fires `tune()` is a bona fide user gesture but the resulting
 * `AudioContext.resume()` runs inside an async chain a step removed from the
 * click handler, which some CI Chromium builds still gate.
 */
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })

/** Snapshot of the window's tracked AudioContexts (installed via addInitScript below). */
interface AudioContextSnapshot {
  count: number
  state: AudioContextState | undefined
  currentTime: number | undefined
}

async function snapshotAudioContexts(page: Page): Promise<AudioContextSnapshot> {
  return page.evaluate(() => {
    const contexts = (window as unknown as { __sentinelAudioContexts?: AudioContext[] })
      .__sentinelAudioContexts
    const first = contexts?.[0]
    return {
      count: contexts?.length ?? 0,
      state: first?.state,
      currentTime: first?.currentTime,
    }
  })
}

/**
 * Wrap `window.AudioContext` (and the webkit-prefixed alias) so every
 * instance the app constructs is recorded on `window.__sentinelAudioContexts`.
 * The wrapper only observes — it forwards straight to the native constructor
 * via `super(...args)`, so app behaviour is unchanged.
 */
async function trackAudioContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { __sentinelAudioContexts: AudioContext[] }).__sentinelAudioContexts = []
    const NativeAudioContext = (
      window as unknown as {
        AudioContext?: typeof AudioContext
        webkitAudioContext?: typeof AudioContext
      }
    ).AudioContext
    if (!NativeAudioContext) return
    class TrackedAudioContext extends NativeAudioContext {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args)
        ;(
          window as unknown as { __sentinelAudioContexts: AudioContext[] }
        ).__sentinelAudioContexts.push(this)
      }
    }
    ;(window as unknown as { AudioContext: typeof AudioContext }).AudioContext =
      TrackedAudioContext as unknown as typeof AudioContext
    if ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) {
      ;(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext =
        TrackedAudioContext as unknown as typeof AudioContext
    }
  })
}

/** Drive the real UI to select the (auto-selected, single) radio and start playback. */
async function startSdrPlayback(page: Page, frequencyMhz: string): Promise<void> {
  await page.goto('/sdr/')
  await waitForShellHydration(page)
  await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
  await expect(page.locator('#msb-pane-radio')).toBeVisible()

  // Exactly one enabled radio in the fixture auto-selects (see
  // useSdrRadioSelection.ts populateRadios) and opens the control socket,
  // enabling the Tune button — no manual device-combobox interaction needed.
  const tuneButton = page.getByRole('button', { name: /^tune$/i })
  await expect(tuneButton).toBeEnabled({ timeout: 10_000 })

  const freqInput = page.getByRole('textbox', { name: /tuned frequency in MHz/i })
  await freqInput.fill(frequencyMhz)
  await tuneButton.click()

  // Tune both sends the hardware tune command AND starts audio (initAudio +
  // openIqSocket) — confirm the Stop button reflects "now playing".
  await expect(page.getByRole('button', { name: /stop audio/i })).toBeEnabled()
}

test.describe('SDR playback survives cross-section navigation (P0 parity)', () => {
  let recorder: FakeSdrRecorder

  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await trackAudioContexts(page)
    await installDefaultMocks(page)
    recorder = await installFakeSdr(page, { centerHz: 145_800_000 })
  })

  test('one AudioContext, one IQ socket, and the tuned frequency survive a full navigation loop', async ({
    page,
  }) => {
    await startSdrPlayback(page, '145.800')

    // Give the fake backend a few ticks to stream IQ frames before asserting
    // steady state.
    await expect.poll(() => recorder.iqFramesSent, { timeout: 5_000 }).toBeGreaterThanOrEqual(3)

    expect(recorder.controlOpens).toBe(1)
    expect(recorder.iqOpens).toBe(1)

    const initialSnapshot = await snapshotAudioContexts(page)
    expect(initialSnapshot.count).toBe(1)
    expect(initialSnapshot.state).toBe('running')

    // The invariant that actually matters here is "no re-tune and no
    // stop/release" — not "zero commands of any kind". Returning to /sdr/
    // remounts SdrWaterfall (route-gated, unlike the persistent radio
    // engine), which legitimately re-publishes its desired FFT bin count on
    // mount (see `publishDesiredBins`/`requestFftSize`) and so re-sends one
    // `fft_size` command; that's display preference, not a hardware retune,
    // and must stay allowed.
    const countByCmd = (cmd: string) => recorder.controlCommands.filter((c) => c.cmd === cmd).length
    expect(countByCmd('tune')).toBe(1)

    const sections = ['air', 'space', 'sea', 'land', 'sdr']
    for (const domain of sections) {
      // Both the desktop nav and the mobile overlay nav render a
      // `[data-domain]` link with the same target; `.first()` picks whichever
      // is visible at this viewport (Playwright's strict mode otherwise
      // refuses a locator matching more than one element).
      await page.locator(`[data-domain="${domain}"]`).first().click()
      await expect(page).toHaveURL(new RegExp(`/${domain}/`))
      await expect(page.locator('main#main')).toBeAttached()

      // No new sockets, no new AudioContext, no new commands.
      expect(recorder.controlOpens, `controlOpens after visiting /${domain}/`).toBe(1)
      expect(recorder.controlCloses, `controlCloses after visiting /${domain}/`).toBe(0)
      expect(recorder.iqOpens, `iqOpens after visiting /${domain}/`).toBe(1)
      expect(recorder.iqCloses, `iqCloses after visiting /${domain}/`).toBe(0)
      // No re-tune and no release/stop — the radio itself was never touched
      // by the navigation, regardless of any display-preference command the
      // route-gated waterfall may have re-sent on remount.
      expect(countByCmd('tune'), `no re-tune after visiting /${domain}/`).toBe(1)
      expect(countByCmd('release'), `no release after visiting /${domain}/`).toBe(0)

      const snapshot = await snapshotAudioContexts(page)
      expect(snapshot.count, `AudioContext count after visiting /${domain}/`).toBe(1)
      expect(snapshot.state, `AudioContext state after visiting /${domain}/`).toBe('running')

      // IQ frames keep flowing (the socket wasn't silently starved).
      const framesBefore = recorder.iqFramesSent
      await expect
        .poll(() => recorder.iqFramesSent, { timeout: 5_000 })
        .toBeGreaterThan(framesBefore)

      // The footer tuned-frequency indicator is the cross-section proof the
      // panel itself is unreachable from most of these routes. It's hidden
      // only on the SDR section's own RADIO tab (redundant with the panel's
      // own readout there).
      if (domain !== 'sdr') {
        const footer = page.locator('#footer-sdr')
        await expect(footer).toBeVisible()
        await expect(footer).toContainText('145.800 MHz')
      }
    }

    // currentTime must have advanced across the whole loop — a stalled/closed
    // context would read back the same value (or throw on .currentTime, which
    // this evaluate would surface as undefined).
    const finalSnapshot = await snapshotAudioContexts(page)
    expect(finalSnapshot.count).toBe(1)
    expect(finalSnapshot.state).toBe('running')
    expect(finalSnapshot.currentTime ?? 0).toBeGreaterThan(initialSnapshot.currentTime ?? 0)

    // Back on the SDR radio tab, the panel's own tuned-frequency input still
    // reflects the value we tuned at the very start.
    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()
    await expect(page.getByRole('textbox', { name: /tuned frequency in MHz/i })).toHaveValue(
      /145\.800/,
    )
    await expect(page.getByRole('button', { name: /stop audio/i })).toBeEnabled()
  })
})
