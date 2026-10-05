import { test, expect, type Page } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import { installFakeSdr, type FakeSdrRecorder } from './support/fakeSdr'

/**
 * Switching radios in the SDR panel must not carry one radio's frequency onto
 * another.
 *
 * The panel keeps one tuned frequency per session. Viewing a dongle that AIR has
 * claimed for ADS-B (1090 MHz) and then switching to a second radio used to keep
 * 1090 MHz as the "current" frequency — and the next tune pushed it onto the
 * second radio. The panel must instead adopt the second radio's own tuning, and
 * never send it a tune for the first radio's frequency.
 */

const ADSB_RADIO = { id: 3, name: 'ADS-B', centerHz: 1_090_000_000 }
const MAIN_RADIO = { id: 2, name: 'RTL-SDR V4', centerHz: 145_500_000 }

async function chooseRadio(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Radio device' }).click()
  await page.getByRole('option', { name: new RegExp(name) }).click()
}

test.describe('SDR radio switch', () => {
  let recorder: FakeSdrRecorder

  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
    recorder = await installFakeSdr(page, { radios: [MAIN_RADIO, ADSB_RADIO] })
  })

  test("adopts the second radio's own frequency and never tunes it to the first radio's", async ({
    page,
  }) => {
    await page.goto('/sdr/')
    await waitForShellHydration(page)
    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    await expect(page.locator('#msb-pane-radio')).toBeVisible()
    const frequency = page.getByRole('textbox', { name: /tuned frequency in MHz/i })

    await chooseRadio(page, ADSB_RADIO.name)
    await expect(frequency).toHaveValue('1090.0000')

    await chooseRadio(page, MAIN_RADIO.name)
    await expect(frequency).toHaveValue('145.5000')

    // Start listening on the second radio: the tune it sends is its own frequency.
    await page.getByRole('button', { name: /^tune$/i }).click()
    await expect(page.getByRole('button', { name: /stop audio/i })).toBeEnabled()

    const tunesSentToMainRadio = (recorder.controlCommandsByRadio[MAIN_RADIO.id] ?? [])
      .filter((command) => command.cmd === 'tune')
      .map((command) => command.frequency_hz)
    expect(tunesSentToMainRadio).not.toContain(ADSB_RADIO.centerHz)
    expect(tunesSentToMainRadio).toContain(MAIN_RADIO.centerHz)
  })
})
