import { expect, type Page } from '@playwright/test'
import { waitForShellHydration } from './hydrationGate'
import { installFakeSdr } from './fakeSdr'

/**
 * Demo SDR data for specs that need a believable radio: a live 2 m band for the
 * fake SDR's spectrum stream, and saved groups, frequencies, search ranges and
 * recordings to serve over the mocked API. Shared by the docs screenshots and
 * the live accessibility audit, so both see the same panels.
 */

/**
 * A believable 2 MHz slice of the 2 m band for the SDR waterfall: a noise floor
 * that rolls off at the edges, a steady signal on the tuned frequency, NFM
 * conversations that key up and drop, APRS packet bursts on 144.800 and a few
 * quiet carriers. Deterministic, so the picture is the same every run.
 */
const SPECTRUM_BINS = 2048

/** Signals in the band: centre (Hz), width (Hz), peak (dBFS), and when it is on. */
const DEMO_SIGNALS: readonly {
  hz: number
  widthHz: number
  peakDb: number
  isOn: (frame: number) => boolean
}[] = [
  // The tuned station stays on: a strong signal dropping out makes the
  // waterfall rescale its brightness, which draws a band across it.
  { hz: 145_500_000, widthHz: 11_000, peakDb: -38, isOn: () => true },
  { hz: 145_525_000, widthHz: 10_000, peakDb: -52, isOn: (frame) => frame % 180 < 70 },
  { hz: 145_600_000, widthHz: 11_000, peakDb: -48, isOn: (frame) => (frame + 90) % 300 < 140 },
  { hz: 145_337_500, widthHz: 9_000, peakDb: -62, isOn: (frame) => (frame + 40) % 220 < 60 },
  { hz: 144_800_000, widthHz: 14_000, peakDb: -50, isOn: (frame) => frame % 75 < 6 },
  { hz: 146_025_000, widthHz: 2_500, peakDb: -60, isOn: () => true },
  { hz: 145_800_000, widthHz: 6_000, peakDb: -72, isOn: (frame) => frame % 40 < 34 },
  { hz: 144_950_000, widthHz: 3_000, peakDb: -74, isOn: () => true },
]

/** Repeatable noise in -1..1 for a frame and bin. */
function noise(frame: number, bin: number): number {
  const seed = Math.sin(frame * 12.9898 + bin * 78.233) * 43758.5453
  return (seed - Math.floor(seed)) * 2 - 1
}

export function demoSpectrumFrame(frame: number, centerHz: number, sampleRate: number): number[] {
  const binHz = sampleRate / SPECTRUM_BINS
  const startHz = centerHz - sampleRate / 2
  const bins: number[] = []
  for (let bin = 0; bin < SPECTRUM_BINS; bin++) {
    const hz = startHz + bin * binHz
    const fromCentre = Math.abs(bin - SPECTRUM_BINS / 2) / (SPECTRUM_BINS / 2)
    let level = -96 - 6 * fromCentre ** 4 + noise(frame, bin) * 3.5
    for (const signal of DEMO_SIGNALS) {
      if (!signal.isOn(frame)) continue
      const offset = (hz - signal.hz) / (signal.widthHz / 2)
      if (Math.abs(offset) > 3) continue
      const shape = Math.exp(-offset * offset * 2.2)
      const signalLevel = signal.peakDb + noise(frame + 7, bin) * 2
      level = Math.max(level, -96 + (signalLevel + 96) * shape)
    }
    bins.push(Math.round(level * 10) / 10)
  }
  return bins
}

/** Demo SDR groups, saved frequencies, search ranges and recordings. */
const DEMO_SDR_GROUPS = [
  { id: 1, name: '2 m simplex', slug: '2m-simplex', color: '#c8ff00', sort_order: 0 },
  { id: 2, name: 'Repeaters', slug: 'repeaters', color: '#4fc3f7', sort_order: 1 },
  { id: 3, name: 'APRS & packet', slug: 'aprs-packet', color: '#ffb74d', sort_order: 2 },
  { id: 4, name: 'Satellites', slug: 'satellites', color: '#ba68c8', sort_order: 3 },
  { id: 5, name: 'Airband', slug: 'airband', color: '#81c784', sort_order: 4 },
  { id: 6, name: 'Marine', slug: 'marine', color: '#4db6ac', sort_order: 5 },
]

const demoFrequency = (
  id: number,
  label: string,
  frequencyHz: number,
  mode: string,
  groupId: number,
  notes: string,
  favourite = false,
) => ({
  id,
  group_id: groupId,
  group_ids: [groupId],
  label,
  frequency_hz: frequencyHz,
  mode,
  squelch: -60,
  gain: 30,
  bandwidth: null,
  sample_rate: null,
  volume: 80,
  scannable: true,
  favourite,
  notes,
})

/** Six inside the 144.5–146.5 MHz view, so the waterfall marks known frequencies. */
export const DEMO_SDR_FREQUENCIES = [
  demoFrequency(1, 'Calling channel', 145_500_000, 'NFM', 1, '2 m FM calling', true),
  demoFrequency(2, 'Simplex S21', 145_525_000, 'NFM', 1, 'Local nets'),
  demoFrequency(3, 'GB3DEM repeater', 145_600_000, 'NFM', 2, 'Output, CTCSS 77.0 Hz', true),
  demoFrequency(4, 'Club net', 145_337_500, 'NFM', 2, 'Thursdays 20:00'),
  demoFrequency(5, 'APRS', 144_800_000, 'NFM', 3, 'Packet, 1200 baud'),
  demoFrequency(6, 'ISS voice downlink', 145_800_000, 'NFM', 4, 'Passes overhead', true),
  demoFrequency(7, 'Tower', 118_700_000, 'AM', 5, 'Demo airfield'),
  demoFrequency(8, 'Channel 16', 156_800_000, 'NFM', 6, 'Distress and calling'),
]

const DEMO_SDR_SEARCH_RANGES = [
  {
    id: 1,
    label: '2 m FM',
    low_hz: 144_500_000,
    high_hz: 146_000_000,
    step_hz: 12_500,
    mode: 'NFM',
    threshold_dbfs: -60,
    dwell_ms: 300,
    band_name: '2 m',
    enabled: true,
    notes: 'Find local activity',
    sort_order: 0,
  },
  {
    id: 2,
    label: 'Airband',
    low_hz: 118_000_000,
    high_hz: 137_000_000,
    step_hz: 8_330,
    mode: 'AM',
    threshold_dbfs: -55,
    dwell_ms: 250,
    band_name: 'VHF air',
    enabled: true,
    notes: '',
    sort_order: 1,
  },
  {
    id: 3,
    label: 'Marine VHF',
    low_hz: 156_000_000,
    high_hz: 162_025_000,
    step_hz: 25_000,
    mode: 'NFM',
    threshold_dbfs: -60,
    dwell_ms: 300,
    band_name: 'Marine',
    enabled: true,
    notes: '',
    sort_order: 2,
  },
]

const DEMO_SDR_RECORDINGS = [
  {
    id: 3,
    name: 'Club net',
    notes: 'Weekly net, good signal',
    frequency_hz: 145_337_500,
    mode: 'NFM',
    duration_s: 1260,
    file_size_bytes: 120_960_000,
    started_at: '2026-10-15T20:00:00Z',
    has_iq_file: false,
    radio_id: 1,
    radio_name: 'RTL-SDR v3',
  },
  {
    id: 2,
    name: 'ISS pass',
    notes: 'Recorded by Space auto-tune',
    frequency_hz: 145_800_000,
    mode: 'NFM',
    duration_s: 540,
    file_size_bytes: 51_840_000,
    started_at: '2026-10-15T18:42:00Z',
    has_iq_file: true,
    radio_id: 1,
    radio_name: 'RTL-SDR v3',
  },
  {
    id: 1,
    name: 'Repeater check',
    notes: '',
    frequency_hz: 145_600_000,
    mode: 'NFM',
    duration_s: 95,
    file_size_bytes: 9_120_000,
    started_at: '2026-10-14T09:15:00Z',
    has_iq_file: false,
    radio_id: 1,
    radio_name: 'RTL-SDR v3',
  },
]

/** Serves the demo SDR data in place of installDefaultMocks' minimal fixtures. */
export async function serveDemoSdrData(page: Page): Promise<void> {
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('/api/sdr/groups', (route) => route.fulfill(json(DEMO_SDR_GROUPS)))
  await page.route('/api/sdr/frequencies', (route) => route.fulfill(json(DEMO_SDR_FREQUENCIES)))
  await page.route('/api/sdr/search-ranges', (route) => route.fulfill(json(DEMO_SDR_SEARCH_RANGES)))
  await page.route('/api/sdr/recordings', (route) => route.fulfill(json(DEMO_SDR_RECORDINGS)))
}

/**
 * Opens SDR with the demo radio tuned to 145.500 MHz in NFM over the live demo
 * spectrum. Call after the page's API mocks (installDefaultMocks) are set up.
 */
export async function playDemoRadio(page: Page): Promise<void> {
  await serveDemoSdrData(page)
  await installFakeSdr(page, {
    centerHz: 145_500_000,
    spectrum: { intervalMs: 15, frame: demoSpectrumFrame },
  })
  await page.goto('/sdr/')
  await waitForShellHydration(page)
  await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
  const tuneButton = page.getByRole('button', { name: /^tune$/i })
  await expect(tuneButton).toBeEnabled({ timeout: 10_000 })
  await page.getByRole('textbox', { name: /tuned frequency in MHz/i }).fill('145.500')
  await tuneButton.click()
  await page.getByRole('radio', { name: 'NFM', exact: true }).click()
}

/** Opens one of the RADIO tab's sections (FAVOURITES, SCANNER, SEARCH), with CONTROLS folded away to make room. */
export async function openRadioSection(page: Page, title: string): Promise<void> {
  const header = (name: string) =>
    page.locator(`button[aria-expanded]:has(> label:text-is("${name}"))`)
  if ((await header('CONTROLS').getAttribute('aria-expanded')) === 'true')
    await header('CONTROLS').click()
  await header(title).click()
  await page.waitForTimeout(500)
}
