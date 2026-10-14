import { expect, type Page } from '@playwright/test'
import { waitForShellHydration } from './hydrationGate'

/**
 * SDR playback helpers shared by the specs that prove audio survives moving
 * around the app: across sections (parity-sdr-persistence) and through the
 * Settings URLs (settings-routes).
 */

/** Snapshot of the window's tracked AudioContexts (installed via addInitScript below). */
export interface AudioContextSnapshot {
  count: number
  state: AudioContextState | undefined
  currentTime: number | undefined
}

export async function snapshotAudioContexts(page: Page): Promise<AudioContextSnapshot> {
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
export async function trackAudioContexts(page: Page): Promise<void> {
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
export async function startSdrPlayback(page: Page, frequencyMhz: string): Promise<void> {
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
