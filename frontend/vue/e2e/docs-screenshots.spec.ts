import { test, expect, type Page, type Route } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState, seedNotifications } from './support/seedStore'
import { openRadioSection, playDemoRadio } from './support/demoSdr'

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
// Mid Great Britain: the maps open centred on your location, so this frames the UK.
const DEMO_LOCATION = { latitude: 54.6, longitude: -3.0 }

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
    // Nine digits, like a real MMSI: 235000001, 235000012…
    mmsi: `235${String(index).padStart(6, '0')}`,
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
    demoVessel(1, 'EXAMPLE STAR', 'cargo', 'CARGO', 53.62, 0.55, 12.1, 165),
    demoVessel(2, 'DEMO SPIRIT', 'passenger', 'PASSENGER', 53.7, -4.3, 17.5, 210),
    demoVessel(3, 'SAMPLE TIDE', 'tanker', 'TANKER', 54.35, 0.3, 9.4, 260),
    demoVessel(4, 'FICTIONAL GULL', 'fishing', 'FISHING', 53.15, 1.8, 3.2, 45),
    demoVessel(5, 'TEST VOYAGER', 'pleasure', 'PLEASURE CRAFT', 54.3, -4.0, 6.0, 140),
    demoVessel(6, 'DEMO TRADER', 'cargo', 'CARGO', 52.9, 2.5, 13.4, 200),
    demoVessel(7, 'NORTH EXAMPLE', 'tanker', 'TANKER', 55.2, 1.2, 11.0, 175),
    demoVessel(8, 'SAMPLE FORTH', 'cargo', 'CARGO', 56.1, -2.3, 8.7, 80),
    demoVessel(9, 'EXAMPLE QUEEN', 'passenger', 'PASSENGER', 51.95, 1.9, 19.0, 95),
    demoVessel(10, 'TEST HARVEST', 'fishing', 'FISHING', 54.9, -0.8, 4.1, 20),
    demoVessel(11, 'DEMO NET', 'fishing', 'FISHING', 52.4, 2.0, 2.8, 300),
    demoVessel(12, 'SOLENT SAMPLE', 'cargo', 'CARGO', 50.55, -1.0, 14.2, 260),
    demoVessel(13, 'CHANNEL DEMO', 'tanker', 'TANKER', 50.3, -2.5, 12.6, 75),
    demoVessel(14, 'FICTIONAL FERRY', 'passenger', 'PASSENGER', 50.9, 0.9, 20.5, 140),
    demoVessel(15, 'TEST TRAWLER', 'fishing', 'FISHING', 50.05, -4.0, 3.5, 230),
    demoVessel(16, 'EXAMPLE BREEZE', 'pleasure', 'PLEASURE CRAFT', 50.72, -1.4, 5.5, 110),
    demoVessel(17, 'IRISH SAMPLE', 'passenger', 'PASSENGER', 53.38, -5.2, 18.0, 270),
    demoVessel(18, 'MERSEY DEMO', 'cargo', 'CARGO', 53.55, -3.4, 10.2, 300),
    demoVessel(19, 'WESTERN TEST', 'tanker', 'TANKER', 52.0, -5.6, 11.8, 190),
    demoVessel(20, 'SAMPLE SAIL', 'pleasure', 'PLEASURE CRAFT', 54.6, -5.45, 4.8, 330),
    demoVessel(21, 'BRISTOL EXAMPLE', 'cargo', 'CARGO', 51.35, -3.8, 9.6, 250),
  ],
  source: 'live',
  status: 'ok',
}

/** Degrees of latitude per nautical mile. */
const DEGREES_PER_NM = 1 / 60

/** A point `distanceNm` from (lat, lon) along `bearingDeg` (flat-earth: fine for a few miles). */
function stepAlong(lat: number, lon: number, bearingDeg: number, distanceNm: number) {
  const bearing = (bearingDeg * Math.PI) / 180
  const dLat = distanceNm * DEGREES_PER_NM * Math.cos(bearing)
  const dLon = (distanceNm * DEGREES_PER_NM * Math.sin(bearing)) / Math.cos((lat * Math.PI) / 180)
  return { lat: lat + dLat, lon: lon + dLon }
}

/** The demo aircraft are laid out around (52.2, -1.5); this moves them to
 *  surround DEMO_LOCATION instead. */
const AIRCRAFT_SHIFT = { lat: DEMO_LOCATION.latitude - 52.2, lon: DEMO_LOCATION.longitude + 1.5 }

/** Polls the Air shots wait for (one every 10 s) before shooting. */
const TRAIL_POLLS = 6

/** The demo aircraft after `poll` polls, each moved 10 NM per poll along its track
 *  (fast, so a few polls draw a trail that reaches out from under the label). They
 *  start that far back along their tracks, so at the shot they are where they
 *  were laid out, not flown off the map. */
function movedAircraft(poll: number) {
  return {
    ...DEMO_AIRCRAFT,
    ac: DEMO_AIRCRAFT.ac.map((aircraft) => ({
      ...aircraft,
      ...stepAlong(
        aircraft.lat + AIRCRAFT_SHIFT.lat,
        aircraft.lon + AIRCRAFT_SHIFT.lon,
        aircraft.track,
        (poll - TRAIL_POLLS) * 10,
      ),
      seen_pos: 0,
    })),
  }
}

/** Twenty-four fixes behind a ship, 10 minutes apart at its own speed, oldest
 *  first: four hours, so the track reaches out from under the label. */
function trackBehind(vessel: { lat: number; lon: number; sog: number; cog: number }) {
  const now = Math.floor(Date.now() / 1000)
  return Array.from({ length: 24 }, (_, index) => {
    const minutesAgo = (24 - index) * 10
    const point = stepAlong(
      vessel.lat,
      vessel.lon,
      vessel.cog + 180,
      (vessel.sog * minutesAgo) / 60,
    )
    return { ...point, t: now - minutesAgo * 60 }
  })
}

/** Places across Great Britain for the generated repeaters: [lat, lon, region]. */
const REPEATER_SITES: readonly [number, number, string][] = [
  [57.15, -2.1, 'SCOTLAND'],
  [56.45, -3.0, 'SCOTLAND'],
  [55.95, -3.2, 'SCOTLAND'],
  [55.85, -4.25, 'SCOTLAND'],
  [57.48, -4.22, 'SCOTLAND'],
  [55.0, -1.6, 'NORTH'],
  [54.57, -1.23, 'NORTH'],
  [53.8, -1.55, 'NORTH'],
  [53.48, -2.24, 'NORTH WEST'],
  [53.4, -2.98, 'NORTH WEST'],
  [54.05, -2.8, 'NORTH WEST'],
  [53.0, -2.18, 'MIDLANDS'],
  [52.63, -1.13, 'MIDLANDS'],
  [52.95, -1.15, 'MIDLANDS'],
  [52.48, -1.9, 'MIDLANDS'],
  [52.63, 1.3, 'EAST'],
  [52.2, 0.12, 'EAST'],
  [51.75, -1.26, 'SOUTH'],
  [51.45, -2.58, 'SOUTH WEST'],
  [50.72, -3.53, 'SOUTH WEST'],
  [50.37, -4.14, 'SOUTH WEST'],
  [51.48, -3.18, 'WALES'],
  [52.41, -4.08, 'WALES'],
  [53.23, -4.13, 'WALES'],
  [51.5, -0.12, 'SOUTH EAST'],
  [50.83, -0.14, 'SOUTH EAST'],
  [51.28, 1.08, 'SOUTH EAST'],
  [54.6, -5.93, 'NORTHERN IRELAND'],
]

/** Band plans the generated repeaters cycle through: [band, channel, output, input]. */
const REPEATER_BANDS: readonly [string, string, number, number][] = [
  ['2M', 'RV58', 145.725, 145.125],
  ['70CM', 'RB04', 433.1, 434.7],
  ['2M', 'RV55', 145.6875, 145.0875],
  ['70CM', 'RU70', 430.875, 438.475],
  ['2M', 'RV61', 145.7625, 145.1625],
  ['6M', 'RF84', 51.84, 51.34],
  ['23CM', 'RM3', 1297.075, 1291.075],
  ['10M', 'R10', 29.66, 29.56],
]

/** Mode mixes the generated repeaters cycle through (ETCC letters: A FM, M DMR,
 *  F Fusion, D D-STAR). */
const REPEATER_MODE_MIXES: readonly string[][] = [
  ['A'],
  ['A', 'M'],
  ['M'],
  ['F'],
  ['A', 'D'],
  ['A', 'F'],
]

/** A fictional repeater (GB3DM<n>: no real callsign has a digit there), with a
 *  realistic spread of bands, modes and off-air sites for the filters to narrow. */
function demoRepeater([latitude, longitude, region]: [number, number, string], index: number) {
  // Staggered steps, so neighbouring sites differ and every region gets a mix.
  const [band, channel, txMhz, rxMhz] = REPEATER_BANDS[(index * 3) % REPEATER_BANDS.length]!
  const modes = REPEATER_MODE_MIXES[(index * 5) % REPEATER_MODE_MIXES.length]!
  return {
    callsign: `GB3DM${index + 1}`,
    latitude,
    longitude,
    locator: 'IO00AA',
    location: 'EXAMPLE SITE',
    postcode: 'EX1',
    region,
    keeper: 'M0DEMO',
    channels: [
      {
        id: 9100 + index,
        band,
        channel,
        txMhz,
        rxMhz,
        modes,
        ctcssHz: modes.includes('A') ? 77.0 : null,
        dmrColourCode: modes.includes('M') ? 1 : null,
        heightMagl: 30,
        erpDbw: 10,
        status: (index * 7) % 9 === 4 ? 'NOT OPERATIONAL' : 'OPERATIONAL',
      },
    ],
  }
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
    ...REPEATER_SITES.map((site, index) => demoRepeater(site, index)),
    // A second site near each place, as the real directory has (it is dense).
    ...REPEATER_SITES.map(([latitude, longitude, region], index) =>
      demoRepeater([latitude + 0.3, longitude - 0.4, region], REPEATER_SITES.length + index),
    ),
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
 * Opens SDR with the demo radio playing and waits until the waterfall has
 * filled its whole height (it scrolls by time, about 5 s per 180 px).
 */
async function openLiveSdr(page: Page): Promise<void> {
  await prepare(page)
  await playDemoRadio(page)
  await page.waitForTimeout(27_000)
}

/** Air's map layers in the shots: range rings on; A2A refuelling and AWACS areas off. */
const SHOT_AIR_LAYERS = {
  rangeRings: true,
  aara: false,
  awacs: false,
  groundVehicles: true,
  towers: true,
  airports: true,
  militaryBases: true,
}

/** Fictional APRS stations around the demo location: cars, walkers, homes,
 *  digipeaters and weather stations — about what one 2 m receiver hears. */
const APRS_SYMBOLS = ['/>', '/-', '/[', '/#', '/_', '/k', '/>', '/-'] as const
const APRS_COMMENTS = [
  'Mobile, monitoring 145.500',
  'Home station',
  'Out walking',
  'Fill-in digipeater',
  'Weather station',
  'Van, en route',
  'On the motorway',
  'QRV on 2 m and 70 cm',
] as const

function demoAprsStation(index: number) {
  const symbol = APRS_SYMBOLS[index % APRS_SYMBOLS.length]!
  const moving = symbol === '/>' || symbol === '/k' || symbol === '/['
  // A sunflower spiral (golden angle, distance by square root) spreads them
  // evenly over the view, so their labels don't stack.
  const angle = index * 137.5
  const point = stepAlong(
    DEMO_LOCATION.latitude,
    DEMO_LOCATION.longitude,
    angle,
    13 * Math.sqrt(index + 1),
  )
  return {
    callsign: `DEMO${index + 1}-${moving ? 9 : 1}`,
    latitude: point.lat,
    longitude: point.lon,
    symbol,
    comment: APRS_COMMENTS[index % APRS_COMMENTS.length]!,
    // No course: a station with one is drawn as an arrow, not its APRS symbol.
    course: null,
    speed: moving ? 30 + (index % 5) * 12 : null,
    altitude: 60 + index * 7,
    path: 'WIDE1-1,WIDE2-1',
    raw: null,
    last_heard_ms: Date.now() - index * 45_000,
  }
}

const DEMO_APRS_STATIONS = {
  stations: Array.from({ length: 12 }, (_, index) => demoAprsStation(index)),
}

/** Sea's layers in the shots: vessels, their labels and the ferry routes the app draws. */
const SHOT_SEA_LAYERS = ['vessels', 'vesselLabels', 'ferryRoutes']

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
  // Map layers for the shots: range rings on (they show distance from your
  // location), the A2A refuelling and AWACS areas off (they crowd the map).
  // Each keeps the data source the default mocks give its section.
  const sectionSettings = (body: object) => (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route(
    '/api/settings/air',
    sectionSettings({
      onlineDataSourceURL: 'http://192.168.1.1:8080/data/source.json',
      mapLayers: SHOT_AIR_LAYERS,
    }),
  )
  await page.route(
    '/api/settings/sea',
    sectionSettings({
      onlineUrl: 'wss://stream.aisstream.io/v0/stream',
      defaultLayers: SHOT_SEA_LAYERS,
    }),
  )
  // Startup reads every section's settings from the top-level call, so the
  // layers go there too (the per-section routes above serve Settings itself).
  await page.route(
    '/api/settings',
    sectionSettings({
      air: { enabled: true, mapLayers: SHOT_AIR_LAYERS },
      space: { enabled: true },
      sea: { enabled: true, defaultLayers: SHOT_SEA_LAYERS },
      land: { enabled: true },
      sdr: { enabled: true },
      app: {},
    }),
  )
  await page.route('/api/settings/app', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ location: DEMO_LOCATION }),
    }),
  )
  // Each poll moves every aircraft a little along its heading, so the map
  // builds the selected aircraft's trail the way it does from a live feed.
  let adsbPolls = 0
  await page.route('**/api/air/adsb/point/**', (route) => {
    adsbPolls += 1
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(movedAircraft(adsbPolls)),
      headers: { 'X-Cache': 'MISS', 'X-Snapshot-Age-Ms': '0' },
    })
  })
  // A selected ship's recent path: fixes laid back along its course.
  await page.route('**/api/sea/vessels/*/track', (route) => {
    const mmsi = new URL(route.request().url()).pathname.split('/').at(-2)
    const vessel = DEMO_VESSELS.vessels.find((candidate) => candidate.mmsi === mmsi)
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ samples: vessel ? trackBehind(vessel) : [] }),
    })
  })
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
  // Only the list: a glob would also catch (and win over) the track route above.
  await page.route(
    (url) => url.pathname === '/api/sea/vessels',
    (route) =>
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
/** How far the Air, Sea and Land shots zoom out from the opening view: enough
 *  for the whole of Great Britain, not so far that the UK gets small. */
const UK_FRAME_WHEEL = 300

async function zoomMapOut(page: Page, wheelDelta: number): Promise<void> {
  const map = page.locator('.maplibregl-canvas').first()
  await expect(map).toBeVisible()
  const box = await map.boundingBox()
  if (!box) throw new Error('The map has no size')
  // Zoom about your location when it is on the map, so it (and the UK around
  // it) stays where the map opened it rather than drifting off to one side.
  const location = page.locator('.user-location-marker').first()
  const anchor = (await location.count()) ? await location.boundingBox() : null
  const pointer = anchor
    ? { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 }
    : { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(pointer.x, pointer.y)
  // Positive zooms out, negative zooms in, in wheel steps of up to 300.
  const direction = Math.sign(wheelDelta)
  for (let remaining = Math.abs(wheelDelta); remaining > 0; remaining -= 300) {
    await page.mouse.wheel(0, direction * Math.min(300, remaining))
    await page.waitForTimeout(250)
  }
  if (anchor) {
    // Then drag your location (the middle of the UK) to the middle of the map
    // you can see: the canvas runs on under the side panel (open it first).
    const sidebar = await page.locator('#map-sidebar-panes').boundingBox()
    const visibleLeft = sidebar ? Math.max(box.x, sidebar.x + sidebar.width) : box.x
    await page.mouse.down()
    await page.mouse.move((visibleLeft + box.x + box.width) / 2, box.y + box.height / 2, {
      steps: 12,
    })
    // Hold still before letting go, or the drag's inertia carries the map on.
    await page.waitForTimeout(400)
    await page.mouse.up()
  }
  await page.waitForTimeout(800)
}

/**
 * Switches the map's range rings on with the rail's MAP LAYERS > Range rings
 * button, as a user would (Land has no range-ring setting), then folds MAP
 * LAYERS away so the shot shows the FILTER list.
 */
async function switchOnRangeRings(page: Page): Promise<void> {
  const layers = page.getByRole('button', { name: 'Map layers' })
  await layers.click()
  await page.getByRole('button', { name: /^Range rings?$/ }).click()
  await layers.click()
}

/**
 * Give Land a working APRS receiver: radio 1 named as the APRS SDR (which
 * enables the APRS STATIONS layer and makes it the one shown) and a busy list
 * of heard stations. Call after `prepare`, so these routes win.
 */
async function serveAprsReceiver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('sdrAprsRadioId', '1')
    localStorage.setItem('sdrAprsEnabled', '1')
  })
  const json = (body: object) => (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('/api/settings/sdr', json({ aprs_radio_id: 1 }))
  await page.route('/api/settings/land', json({ defaultLayers: ['aprs'] }))
  await page.route('/api/land/aprs/stations', json(DEMO_APRS_STATIONS))
}

/** This machine's linked row and one fictional Pi, each with streaming dongles. */
const DEMO_SDR_HOSTS = [
  { id: 1, name: null, address: 'host.docker.internal', is_local: true },
  { id: 2, name: 'Roof Pi', address: '192.168.1.30', is_local: false },
].map((host) => ({
  ...host,
  port: 8000,
  enabled: true,
  auth_token_set: true,
  created_at: 1_760_000_000_000,
  last_seen_at: 1_760_000_000_000,
  last_error: null,
  reachable: true,
  api_version: '1',
}))

const DEMO_HOST_DONGLES: Record<number, { device_id: string; name: string; port: number }[]> = {
  1: [{ device_id: 'serial:00000001', name: 'Roof RTL-SDR', port: 1234 }],
  2: [
    { device_id: 'serial:00000101', name: 'Airband', port: 1234 },
    { device_id: 'serial:00000102', name: 'Marine VHF', port: 1238 },
  ],
}

/**
 * Serve sdr-manager-remote's host list (This machine plus a Pi) and each
 * host's dongles, so Settings › SDR › DEVICES lists Sentinel hosts. Call
 * after `prepare`, so these routes win.
 */
async function serveSdrManagerHosts(page: Page): Promise<void> {
  const json = (body: unknown) => (route: Route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('/api/sdr-manager/remote/hosts', json(DEMO_SDR_HOSTS))
  await page.route('/api/sdr-manager/remote/hosts/locations', json([]))
  for (const host of DEMO_SDR_HOSTS) {
    const sdrs = (DEMO_HOST_DONGLES[host.id] ?? []).map((dongle) => ({
      device_id: dongle.device_id,
      name: dongle.name,
      present: true,
      state: 'streaming',
      state_reason: null,
      enabled: true,
      visibility: 'public',
      notes: '',
      antenna: '',
      needs_identification: false,
      output: { iq_port: dongle.port, control_port: dongle.port + 2, host: host.address },
      usb: null,
      usb_last_known: null,
    }))
    await page.route(
      `/api/sdr-manager/remote/hosts/${host.id}/devices`,
      json({
        reachable: true,
        last_error: null,
        last_polled_at: 1_760_000_000_000,
        last_success_at: 1_760_000_000_000,
        api_version: '1',
        status: { generated_at: 1_760_000_000_000, sdrs },
      }),
    )
  }
}

/**
 * Keep THIS MACHINE's live event stream open, as a running SDR Manager does: a
 * mocked response ends at once, so the card would show RECONNECTING…. Only
 * sdr-manager-local's stream is replaced; every other EventSource is real.
 */
async function holdSdrManagerEventsOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealEventSource = window.EventSource
    class HeldEventSource extends EventTarget {
      static readonly CONNECTING = 0
      static readonly OPEN = 1
      static readonly CLOSED = 2
      readonly readyState = 1
      constructor(readonly url: string) {
        super()
        setTimeout(() => this.dispatchEvent(new MessageEvent('health', { data: '{}' })), 50)
      }
      close(): void {}
    }
    window.EventSource = function (url: string | URL, init?: EventSourceInit) {
      return String(url).includes('/api/sdr-manager/local/events')
        ? new HeldEventSource(String(url))
        : new RealEventSource(url, init)
    } as unknown as typeof EventSource
    Object.assign(window.EventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 })
  })
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
    test.setTimeout(200_000)
    await prepare(page)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await zoomMapOut(page, UK_FRAME_WHEEL)
    // Its map label, not the search list: only a map pick selects the
    // aircraft there and draws its trail (and it opens the details too).
    await page
      .locator('.maplibregl-map')
      .getByText('DEMO101', { exact: true })
      .first()
      // Forced: the labels glide between polls, so they never hold still.
      .click({ force: true })
    // Polls come every 10 s; these give the selected aircraft a visible trail.
    await page.waitForTimeout(TRAIL_POLLS * 10_000 + 5_000)
    await shoot(page, 'interface-air-screen')
  })

  test('Air aircraft details', async ({ page }) => {
    test.setTimeout(200_000)
    await prepare(page)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await zoomMapOut(page, UK_FRAME_WHEEL)
    // Its map label, not the search list: only a map pick selects the
    // aircraft there and draws its trail (and it opens the details too).
    await page
      .locator('.maplibregl-map')
      .getByText('DEMO303', { exact: true })
      .first()
      // Forced: the labels glide between polls, so they never hold still.
      .click({ force: true })
    // Polls come every 10 s; these give the selected aircraft a visible trail.
    await page.waitForTimeout(TRAIL_POLLS * 10_000 + 5_000)
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
    await switchOnRangeRings(page)
    await page.locator('[data-tab="search"]').first().click()
    await zoomMapOut(page, UK_FRAME_WHEEL)
    // Its map label, not the search list: only a map pick selects the ship
    // there and draws its track.
    await page.locator('.maplibregl-map').getByText('EXAMPLE STAR', { exact: true }).click()
    await shoot(page, 'sea-vessel-details')
  })

  test('Land repeater', async ({ page }) => {
    await prepare(page)
    await page.goto('/land/')
    await waitForShellHydration(page)
    await switchOnRangeRings(page)
    await page.locator('[data-tab="search"]').first().click()
    // Narrow the directory as an operator with a 2 m FM radio would: 2 m,
    // FM, on air only, with the filters left open to show it.
    await page.getByRole('button', { name: /^Repeater filters/i }).click()
    await page
      .getByRole('group', { name: 'Band' })
      .getByRole('button', { name: '2M', exact: true })
      .click()
    await page
      .getByRole('group', { name: 'Mode' })
      .getByRole('button', { name: 'FM', exact: true })
      .click()
    await page
      .getByRole('group', { name: 'Status' })
      .getByRole('button', { name: 'On air', exact: true })
      .click()
    await page.getByRole('combobox').first().fill('GB3DEM')
    await page.getByRole('option').first().click()
    // After the pick: picking a repeater pans the map to it.
    await page.waitForTimeout(1200)
    await zoomMapOut(page, UK_FRAME_WHEEL)
    await shoot(page, 'land-repeater-details')
  })

  test('Land APRS stations', async ({ page }) => {
    await prepare(page)
    await serveAprsReceiver(page)
    await page.goto('/land/')
    await waitForShellHydration(page)
    await switchOnRangeRings(page)
    await page.locator('[data-tab="search"]').first().click()
    // Closer in than the other shots: one receiver hears tens of miles, not the UK.
    await zoomMapOut(page, -900)
    await page.getByRole('combobox').first().fill('DEMO5-1')
    await page.getByRole('option').first().click()
    await shoot(page, 'land-aprs-station')
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
      await serveSdrManagerHosts(page)
      await holdSdrManagerEventsOpen(page)
      await page.goto(`/settings/${section}`)
      await waitForShellHydration(page)
      await shoot(page, name)
    })
  }

  // The SDR Manager guide's two shots, both on Settings › SDR: the Sentinel
  // hosts in DEVICES, and this machine's own SDRs and cards.
  for (const [heading, name] of [
    ['Sentinel Hosts', 'settings-sdr-manager-remote'],
    ['This machine', 'settings-sdr-manager'],
  ] as const) {
    test(`Settings › SDR › ${heading}`, async ({ page }) => {
      await prepare(page)
      await serveSdrManagerHosts(page)
      await holdSdrManagerEventsOpen(page)
      await page.goto('/settings/sdr')
      await waitForShellHydration(page)
      await page
        .getByText(heading, { exact: true })
        .first()
        .evaluate((element) => element.scrollIntoView({ block: 'start' }))
      await shoot(page, name)
    })
  }

  test('Settings › add a radio', async ({ page }) => {
    await prepare(page)
    await holdSdrManagerEventsOpen(page)
    await page.goto('/settings/sdr')
    await waitForShellHydration(page)
    await page.getByRole('button', { name: '+ ADD A REMOTE SDR DEVICE' }).click()
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

  test.describe('on a phone', () => {
    test.use({ deviceScaleFactor: PHONE_SCALE })

    test('Phone layout', async ({ page }) => {
      await prepare(page, PHONE_VIEWPORT)
      await page.goto('/air/')
      await waitForShellHydration(page)
      // With the side panel open, so the shot shows the narrow left nav bar
      // (hidden on a phone until the panel is opened).
      await page.locator('#map-sidebar-btn').click()
      await shoot(page, 'interface-phone')
    })
  })
})
