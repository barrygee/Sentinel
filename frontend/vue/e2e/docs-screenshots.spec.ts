import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState, seedNotifications } from './support/seedStore'
import { installFakeSdr } from './support/fakeSdr'

/**
 * Regenerates the screenshots in docs/images/ — not part of the gating suite.
 *
 *   cd frontend/vue && npm run build && DOCS_SCREENSHOTS=1 npx playwright test e2e/docs-screenshots.spec.ts
 *
 * Runs against the e2e mocked API with fixed, clearly fictional data (no live
 * feeds, no real vessels or callsigns), so the images can be retaken whenever
 * the UI changes. The one thing it lets through is the online basemap's tiles,
 * so maps have a background: the style, fonts and sprites are served from the
 * repo's frontend/assets/, and the vector tiles come from the style's online
 * source, which needs an internet connection.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const imagesDirectory = join(repositoryRoot, 'docs/images')
const assetsDirectory = join(repositoryRoot, 'frontend/assets')

const DESKTOP_VIEWPORT = { width: 1920, height: 1080 }
const PHONE_VIEWPORT = { width: 390, height: 844 }
/** Phones are drawn at three pixels per point, so the phone shot is as sharp as the rest. */
const PHONE_SCALE = 3

/** Central England: inside every map's opening view. */
const DEMO_LOCATION = { latitude: 52.2, longitude: -1.5 }

const DEMO_AIRCRAFT = {
  ac: [
    {
      hex: '4ca011',
      flight: 'DEMO411 ',
      lat: 53.35,
      lon: -2.27,
      alt_baro: 36000,
      gs: 448,
      track: 95,
      category: 'A3',
      t: 'A20N',
      r: 'G-DEMF',
      squawk: '1000',
      seen_pos: 1,
    },
    {
      hex: '4ca012',
      flight: 'EXAMPLE12 ',
      lat: 51.47,
      lon: -0.45,
      alt_baro: 4200,
      gs: 180,
      track: 270,
      category: 'A3',
      t: 'B789',
      r: 'G-DEMG',
      squawk: '1111',
      seen_pos: 1,
    },
    {
      hex: '4ca013',
      flight: 'TEST613 ',
      lat: 55.95,
      lon: -3.35,
      alt_baro: 23000,
      gs: 390,
      track: 165,
      category: 'A3',
      t: 'E190',
      r: 'G-DEMH',
      squawk: '1222',
      seen_pos: 1,
    },
    {
      hex: '4ca014',
      flight: 'DEMO714 ',
      lat: 54.1,
      lon: -1.2,
      alt_baro: 38000,
      gs: 470,
      track: 330,
      category: 'A3',
      t: 'A321',
      r: 'G-DEMI',
      squawk: '1333',
      seen_pos: 1,
    },
    {
      hex: '4ca015',
      flight: 'SAMPLE15 ',
      lat: 50.9,
      lon: -1.4,
      alt_baro: 9000,
      gs: 240,
      track: 40,
      category: 'A3',
      t: 'DH8D',
      r: 'G-DEMJ',
      squawk: '1444',
      seen_pos: 1,
    },
    {
      hex: '4ca016',
      flight: 'DEMO816 ',
      lat: 52.95,
      lon: 0.6,
      alt_baro: 31000,
      gs: 430,
      track: 200,
      category: 'A3',
      t: 'B738',
      r: 'G-DEMK',
      squawk: '1555',
      seen_pos: 1,
    },
    {
      hex: '4ca017',
      flight: 'EXAMPLE17 ',
      lat: 51.8,
      lon: -3.6,
      alt_baro: 27000,
      gs: 410,
      track: 85,
      category: 'A3',
      t: 'A319',
      r: 'G-DEML',
      squawk: '1666',
      seen_pos: 1,
    },
    {
      hex: '4ca018',
      flight: 'TEST918 ',
      lat: 54.65,
      lon: -5.9,
      alt_baro: 12000,
      gs: 250,
      track: 120,
      category: 'A3',
      t: 'AT76',
      r: 'G-DEMM',
      squawk: '1777',
      seen_pos: 1,
    },
    {
      hex: '4ca019',
      flight: 'DEMO219 ',
      lat: 52.3,
      lon: -4.8,
      alt_baro: 40000,
      gs: 500,
      track: 260,
      category: 'A3',
      t: 'B77W',
      r: 'G-DEMN',
      squawk: '1888',
      seen_pos: 1,
    },
    {
      hex: '4ca01a',
      flight: 'SAMPLE20 ',
      lat: 51.2,
      lon: 0.3,
      alt_baro: 2500,
      gs: 95,
      track: 15,
      category: 'A3',
      t: 'C172',
      r: 'G-DEMO',
      squawk: '1999',
      seen_pos: 1,
    },
    {
      hex: '4ca01b',
      flight: 'DEMO521 ',
      lat: 53.9,
      lon: 1.8,
      alt_baro: 39000,
      gs: 480,
      track: 60,
      category: 'A3',
      t: 'A332',
      r: 'G-DEMP',
      squawk: '2110',
      seen_pos: 1,
    },
    {
      hex: '4ca01c',
      flight: 'EXAMPLE22 ',
      lat: 50.4,
      lon: -4.1,
      alt_baro: 17000,
      gs: 330,
      track: 300,
      category: 'A3',
      t: 'E145',
      r: 'G-DEMQ',
      squawk: '2221',
      seen_pos: 1,
    },
    {
      hex: '4ca001',
      flight: 'DEMO101 ',
      lat: 52.35,
      lon: -1.75,
      alt_baro: 34000,
      gs: 452,
      track: 128,
      category: 'A3',
      t: 'A320',
      r: 'G-DEMA',
      squawk: '4521',
      seen_pos: 1,
    },
    {
      hex: '4ca002',
      flight: 'DEMO202 ',
      lat: 52.05,
      lon: -1.2,
      alt_baro: 12500,
      gs: 310,
      track: 305,
      category: 'A3',
      t: 'B738',
      r: 'G-DEMB',
      squawk: '3241',
      seen_pos: 1,
    },
    {
      hex: '4ca003',
      flight: 'DEMO303 ',
      lat: 52.5,
      lon: -1.1,
      alt_baro: 6000,
      gs: 210,
      track: 42,
      category: 'A2',
      t: 'DH8D',
      r: 'G-DEMC',
      squawk: '7700',
      seen_pos: 1,
    },
    {
      hex: '4ca004',
      flight: 'EXAMPLE4',
      lat: 51.95,
      lon: -1.85,
      alt_baro: 2300,
      gs: 110,
      track: 190,
      category: 'A1',
      t: 'C172',
      r: 'G-DEMD',
      squawk: '7000',
      seen_pos: 1,
    },
    {
      hex: 'ae0005',
      flight: 'TEST55  ',
      lat: 52.25,
      lon: -2.1,
      alt_baro: 24000,
      gs: 400,
      track: 90,
      category: 'A5',
      t: 'C17',
      r: '00-0000',
      squawk: '1001',
      dbFlags: 1,
      seen_pos: 1,
    },
  ],
}

function demoVessel(
  index: number,
  name: string,
  family: string,
  typeLabel: string,
  lat: number,
  lon: number,
  sog: number,
  cog: number,
) {
  return {
    mmsi: `23500000${index}`,
    name,
    imo: '',
    callsign: `DEMO${index}`,
    type: '70',
    typeLabel,
    family,
    destination: 'EXAMPLE PORT',
    lat,
    lon,
    sog,
    cog,
    heading: Math.round(cog),
    navStatus: 0,
    lastPositionMs: Date.now() - 20_000,
    lastPositionUtc: new Date(Date.now() - 20_000).toISOString(),
  }
}

const DEMO_VESSELS = {
  vessels: [
    demoVessel(1, 'EXAMPLE STAR', 'cargo', 'CARGO', 53.62, 0.55, 12.1, 95),
    demoVessel(2, 'DEMO SPIRIT', 'passenger', 'PASSENGER', 53.7, -4.3, 17.5, 210),
    demoVessel(3, 'SAMPLE TIDE', 'tanker', 'TANKER', 54.35, 0.3, 9.4, 260),
    demoVessel(4, 'FICTIONAL GULL', 'fishing', 'FISHING', 53.15, 1.8, 3.2, 45),
    demoVessel(5, 'TEST VOYAGER', 'pleasure', 'PLEASURE CRAFT', 54.3, -4.0, 6.0, 140),
  ],
  source: 'live',
  status: 'ok',
}

const DEMO_REPEATERS = {
  source: 'cached',
  fetchedAt: Date.now(),
  stations: [
    {
      callsign: 'GB3DEM',
      latitude: 52.25,
      longitude: -1.4,
      locator: 'IO92FG',
      location: 'EXAMPLETON',
      postcode: 'EX1',
      region: 'MIDLANDS',
      keeper: 'M0DEMO',
      channels: [
        {
          id: 9001,
          band: '2M',
          channel: 'RV58',
          txMhz: 145.725,
          rxMhz: 145.125,
          modes: ['A'],
          ctcssHz: 77.0,
          dmrColourCode: null,
          heightMagl: 40,
          erpDbw: 10,
          status: 'OPERATIONAL',
        },
      ],
    },
    {
      callsign: 'GB3TST',
      latitude: 52.05,
      longitude: -1.15,
      locator: 'IO92JB',
      location: 'SAMPLEFORD',
      postcode: 'SA2',
      region: 'MIDLANDS',
      keeper: 'G0TEST',
      channels: [
        {
          id: 9002,
          band: '70CM',
          channel: 'RB04',
          txMhz: 433.1,
          rxMhz: 434.7,
          modes: ['A', 'M'],
          ctcssHz: 94.8,
          dmrColourCode: 1,
          heightMagl: 25,
          erpDbw: 12,
          status: 'OPERATIONAL',
        },
      ],
    },
  ],
}

/**
 * A real ISS position, four-orbit ground track and footprint, recorded once from
 * the Space service's own SGP4 code with a fixed TLE and a fixed moment (over
 * Morocco, heading north-east), so the Space map shows a satellite the same way
 * every time.
 */
const DEMO_ISS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/docs-iss.json'), 'utf8'),
)

interface RecordedPass {
  aos_utc: string
  los_utc: string
  max_el_utc: string
  aos_unix_ms: number
  los_unix_ms: number
  max_elevation_deg: number
}

/**
 * The recorded ISS passes, moved so the highest one rises 20 minutes from now
 * (the app lists only passes still to come). Earlier ones are dropped; their
 * shapes, lengths and sky tracks are kept.
 */
function upcomingIssPasses(now: number): RecordedPass[] {
  const recorded = DEMO_ISS.passes as RecordedPass[]
  const best = recorded.reduce((highest, candidate) =>
    candidate.max_elevation_deg > highest.max_elevation_deg ? candidate : highest,
  )
  const shift = now + 20 * 60_000 - best.aos_unix_ms
  const moved = (iso: string) => new Date(Date.parse(iso) + shift).toISOString()
  return recorded
    .filter((candidate) => candidate.aos_unix_ms >= best.aos_unix_ms)
    .map((candidate) => ({
      ...candidate,
      aos_unix_ms: candidate.aos_unix_ms + shift,
      los_unix_ms: candidate.los_unix_ms + shift,
      aos_utc: moved(candidate.aos_utc),
      los_utc: moved(candidate.los_utc),
      max_el_utc: moved(candidate.max_el_utc),
    }))
}

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

function demoSpectrumFrame(frame: number, centerHz: number, sampleRate: number): number[] {
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
const DEMO_SDR_FREQUENCIES = [
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
async function serveDemoSdrData(page: Page): Promise<void> {
  const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('/api/sdr/groups', (route) => route.fulfill(json(DEMO_SDR_GROUPS)))
  await page.route('/api/sdr/frequencies', (route) => route.fulfill(json(DEMO_SDR_FREQUENCIES)))
  await page.route('/api/sdr/search-ranges', (route) => route.fulfill(json(DEMO_SDR_SEARCH_RANGES)))
  await page.route('/api/sdr/recordings', (route) => route.fulfill(json(DEMO_SDR_RECORDINGS)))
}

/**
 * Opens SDR with the demo radio playing 145.500 MHz in NFM over a live demo
 * spectrum, and waits until the waterfall has filled its whole height (it
 * scrolls by time, about 5 s per 180 px).
 */
async function openLiveSdr(page: Page): Promise<void> {
  await prepare(page)
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
  await page.waitForTimeout(27_000)
}

/** Opens one of the RADIO tab's sections (FAVOURITES, SCANNER, SEARCH), with CONTROLS folded away to make room. */
async function openRadioSection(page: Page, title: string): Promise<void> {
  const header = (name: string) =>
    page.locator(`button[aria-expanded]:has(> label:text-is("${name}"))`)
  if ((await header('CONTROLS').getAttribute('aria-expanded')) === 'true')
    await header('CONTROLS').click()
  await header(title).click()
  await page.waitForTimeout(500)
}

/** Real map style, fonts and sprites from the repo, so maps aren't blank. */
async function serveRealMapAssets(page: Page): Promise<void> {
  await page.route('**/assets/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/assets\//, '')
    // The offline styles read tiles through core; online ones fetch them directly.
    const onlinePath = path.replace(/^(fiord|osm-light)\.json$/, '$1-online.json')
    const file = join(assetsDirectory, decodeURIComponent(onlinePath))
    if (existsSync(file)) return route.fulfill({ path: file })
    return route.fulfill({ status: 204 })
  })
}

async function prepare(page: Page, viewport = DESKTOP_VIEWPORT): Promise<void> {
  await page.setViewportSize(viewport)
  await clearPersistedState(page)
  await installDefaultMocks(page)
  await serveRealMapAssets(page)
  await page.addInitScript((location) => {
    localStorage.setItem(
      'sentinel_user_location',
      JSON.stringify({ ...location, ts: Date.now(), manual: true }),
    )
  }, DEMO_LOCATION)
  await page.route('/api/settings/app', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ location: DEMO_LOCATION }),
    }),
  )
  await page.route('**/api/air/adsb/point/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(DEMO_AIRCRAFT),
      headers: { 'X-Cache': 'MISS', 'X-Snapshot-Age-Ms': '0' },
    }),
  )
  // An obviously fake key fingerprint, so nothing key-shaped appears in the docs.
  await page.route('**/api/sea/ais-key', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            configured: true,
            source: 'settings',
            fingerprint: '000000000000',
          }),
        })
      : route.fulfill({ status: 204 }),
  )
  await page.route('**/api/sea/vessels**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(DEMO_VESSELS) }),
  )
  await page.route('**/api/land/repeaters', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(DEMO_REPEATERS) }),
  )
  await page.route('/api/space/tle/list', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        satellites: [
          {
            norad_id: '25544',
            name: 'ISS (ZARYA)',
            category: 'space_station',
            name_source: null,
            updated_at: Date.now(),
            downlink_hz: 145_800_000,
            downlink_mode: 'FM',
          },
        ],
      }),
    }),
  )
  const satelliteNow = {
    position: DEMO_ISS.position,
    ground_track: DEMO_ISS.ground_track,
    footprint: DEMO_ISS.footprint,
  }
  // The ISS has its own route; the demo satellites' details reuse its orbit.
  await page.route(
    (url) =>
      url.pathname === '/api/space/iss' || /^\/api\/space\/satellite\/\d+$/.test(url.pathname),
    (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(satelliteNow) }),
  )
  await page.route(
    (url) =>
      url.pathname === '/api/space/iss/passes' ||
      /^\/api\/space\/satellite\/\d+\/passes$/.test(url.pathname),
    (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          passes: upcomingIssPasses(Date.now()),
          obs_lat: DEMO_LOCATION.latitude,
          obs_lon: DEMO_LOCATION.longitude,
          lookahead_hours: 24,
          computed_at: new Date().toISOString(),
        }),
      }),
  )
  const now = Date.now()
  await page.route('/api/space/passes**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        satellite_count: 3,
        computed_at: new Date(now).toISOString(),
        passes: [
          {
            norad_id: '90001',
            name: 'DEMOSAT 1',
            aos_unix_ms: now + 25 * 60_000,
            los_unix_ms: now + 35 * 60_000,
            duration_s: 600,
            max_elevation_deg: 62.5,
            category: 'amateur',
            downlink_hz: 145_800_000,
          },
          {
            norad_id: '90002',
            name: 'EXAMPLESAT 2',
            aos_unix_ms: now + 95 * 60_000,
            los_unix_ms: now + 107 * 60_000,
            duration_s: 720,
            max_elevation_deg: 34.1,
            category: 'weather',
            downlink_hz: 137_100_000,
          },
          {
            norad_id: '90003',
            name: 'TESTSAT 3',
            aos_unix_ms: now + 180 * 60_000,
            los_unix_ms: now + 188 * 60_000,
            duration_s: 480,
            max_elevation_deg: 12.8,
            category: 'amateur',
          },
        ],
      }),
    }),
  )
}

/**
 * Zooms the map out around its centre, so what is selected is shown with its
 * surroundings (a satellite's whole ground track, the aircraft and map layers
 * around a selected aircraft). A wheel notch of 100 moves the map by about a
 * quarter of a zoom level; MapLibre caps each event, so it scrolls in steps.
 */
async function zoomMapOut(page: Page, wheelDelta: number): Promise<void> {
  const map = page.locator('.maplibregl-canvas').first()
  await expect(map).toBeVisible()
  const box = await map.boundingBox()
  if (!box) throw new Error('The map has no size')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let remaining = wheelDelta; remaining > 0; remaining -= 300) {
    await page.mouse.wheel(0, Math.min(300, remaining))
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(800)
}

async function shoot(page: Page, name: string): Promise<void> {
  // Let map tiles and fonts arrive; the maps have no "done" event we can await.
  await page.mouse.move(DESKTOP_VIEWPORT.width / 2, DESKTOP_VIEWPORT.height - 20)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: join(imagesDirectory, `${name}.png`) })
}

test.describe('docs screenshots', () => {
  test.skip(!process.env.DOCS_SCREENSHOTS, 'Set DOCS_SCREENSHOTS=1 to regenerate docs/images/')
  test.describe.configure({ mode: 'default' })
  test.setTimeout(90_000)
  // Twice the screen's pixels, so an image stays sharp when it is opened full
  // size or read on a high-density display.
  test.use({ deviceScaleFactor: 2 })

  test('whole screen on Air', async ({ page }) => {
    await prepare(page)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await page.getByRole('combobox').first().fill('DEMO101')
    await page.getByRole('option').first().click()
    await page.waitForTimeout(1500)
    await zoomMapOut(page, 5400)
    await shoot(page, 'interface-air-screen')
  })

  test('Air aircraft details', async ({ page }) => {
    await prepare(page)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await page.getByRole('combobox').first().fill('DEMO303')
    await page.getByRole('option').first().click()
    await page.waitForTimeout(1500)
    await zoomMapOut(page, 5400)
    await shoot(page, 'air-aircraft-details')
  })

  test('Space map with the ISS', async ({ page }) => {
    await prepare(page)
    await page.goto('/space/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await page.getByRole('combobox').first().fill('ISS')
    await page.getByRole('option').first().click()
    await zoomMapOut(page, 150)
    await shoot(page, 'space-iss')
  })

  test('Space passes', async ({ page }) => {
    await prepare(page)
    await page.goto('/space/')
    await waitForShellHydration(page)
    await zoomMapOut(page, 150)
    await page.locator('[data-tab="passes"]').click()
    await expect(page.locator('.spp-pass-card').first()).toBeVisible({ timeout: 10_000 })
    await page.locator('.spp-pass-card').first().click()
    await shoot(page, 'space-passes')
  })

  test('Sea vessels', async ({ page }) => {
    await prepare(page)
    await page.goto('/sea/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await page.getByRole('combobox').first().fill('EXAMPLE STAR')
    await page.getByRole('option').first().click()
    await shoot(page, 'sea-vessel-details')
  })

  test('Land repeater', async ({ page }) => {
    await prepare(page)
    await page.goto('/land/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await page.getByRole('combobox').first().fill('GB3DEM')
    await page.getByRole('option').first().click()
    await shoot(page, 'land-repeater-details')
  })

  test('Alerts', async ({ page }) => {
    await prepare(page)
    const now = Date.now()
    await seedNotifications(page, [
      {
        id: 'demo-1',
        type: 'emergency',
        title: 'DEMO303',
        detail: 'Squawk 7700 · General Emergency',
        ts: now - 60_000,
        hex: '4ca003',
      },
      {
        id: 'demo-2',
        type: 'pass',
        title: 'DEMOSAT 1',
        detail: 'Pass in ~5 min',
        ts: now - 300_000,
        noradId: '90001',
        satName: 'DEMOSAT 1',
      },
    ])

    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="alerts"]').first().click()
    await shoot(page, 'alerts-pane')
  })

  test('SDR radio panel', async ({ page }) => {
    test.setTimeout(120_000)
    await openLiveSdr(page)
    await shoot(page, 'sdr-radio-panel')
  })

  for (const [tab, name] of [
    ['frequency-manager', 'sdr-frequency-manager'],
    ['groups', 'sdr-groups'],
    ['search-ranges', 'sdr-search-ranges'],
    ['recordings', 'sdr-recordings'],
  ] as const) {
    test(`SDR ${tab} tab`, async ({ page }) => {
      test.setTimeout(120_000)
      await openLiveSdr(page)
      await page.locator(`#sdr-sidebar-rail [data-tab="${tab}"]`).click()
      await page.waitForTimeout(500)
      await shoot(page, name)
    })
  }

  for (const [title, name] of [
    ['FAVOURITES', 'sdr-favourites'],
    ['SCANNER', 'sdr-scanner'],
    ['SEARCH', 'sdr-search'],
  ] as const) {
    test(`SDR ${title} section`, async ({ page }) => {
      test.setTimeout(120_000)
      await openLiveSdr(page)
      await openRadioSection(page, title)
      if (title === 'SEARCH') {
        await page.getByRole('spinbutton', { name: /search range low frequency/i }).fill('144.500')
        await page.getByRole('spinbutton', { name: /search range high frequency/i }).fill('146.000')
        await page.locator('button[aria-expanded]:has(> label:text-is("SAVED RANGES"))').click()
        await page.waitForTimeout(500)
      }
      await shoot(page, name)
    })
  }

  for (const [section, name] of [
    ['app', 'settings-app'],
    ['sdr', 'settings-sdr'],
    ['sea', 'settings-sea'],
  ] as const) {
    test(`Settings › ${section}`, async ({ page }) => {
      await prepare(page)
      await page.goto(`/settings/${section}`)
      await waitForShellHydration(page)
      await shoot(page, name)
    })
  }

  test('Settings › add a radio', async ({ page }) => {
    await prepare(page)
    await page.goto('/settings/sdr')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: /\+ add sdr/i }).click()
    await shoot(page, 'settings-add-radio')
  })

  test('Settings › offline maps', async ({ page }) => {
    await prepare(page)
    await page.goto('/settings/app')
    await waitForShellHydration(page)
    await page
      .getByText('Offline Maps', { exact: true })
      .first()
      .evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await shoot(page, 'settings-offline-maps')
  })

  test('Docs page', async ({ page }) => {
    await prepare(page)
    await page.goto('/doc/install')
    await waitForShellHydration(page)
    await shoot(page, 'docs-quick-start')
  })

  test.describe('on a phone', () => {
    test.use({ deviceScaleFactor: PHONE_SCALE })

    test('Phone layout', async ({ page }) => {
      await prepare(page, PHONE_VIEWPORT)
      await page.goto('/air/')
      await waitForShellHydration(page)
      await shoot(page, 'interface-phone')
    })
  })
})
