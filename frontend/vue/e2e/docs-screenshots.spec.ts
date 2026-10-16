import { test, expect, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
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

const DESKTOP_VIEWPORT = { width: 1440, height: 900 }
const PHONE_VIEWPORT = { width: 390, height: 844 }

/** Central England: inside every map's opening view. */
const DEMO_LOCATION = { latitude: 52.2, longitude: -1.5 }

const DEMO_AIRCRAFT = {
  ac: [
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
    await shoot(page, 'interface-air-screen')
  })

  test('Air aircraft details', async ({ page }) => {
    await prepare(page)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="search"]').first().click()
    await page.getByRole('combobox').first().fill('DEMO303')
    await page.getByRole('option').first().click()
    await shoot(page, 'air-aircraft-details')
  })

  test('Space passes', async ({ page }) => {
    await prepare(page)
    await page.goto('/space/')
    await waitForShellHydration(page)
    await page.locator('[data-tab="passes"]').click()
    await expect(page.locator('.spp-pass-card').first()).toBeVisible({ timeout: 10_000 })
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
    await prepare(page)
    await installFakeSdr(page, { centerHz: 145_500_000 })
    await page.goto('/sdr/')
    await waitForShellHydration(page)
    await page.locator('#sdr-sidebar-rail [data-tab="radio"]').click()
    const tuneButton = page.getByRole('button', { name: /^tune$/i })
    await expect(tuneButton).toBeEnabled({ timeout: 10_000 })
    await page.getByRole('textbox', { name: /tuned frequency in MHz/i }).fill('145.500')
    await tuneButton.click()
    await shoot(page, 'sdr-radio-panel')
  })

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

  test('Phone layout', async ({ page }) => {
    await prepare(page, PHONE_VIEWPORT)
    await page.goto('/air/')
    await waitForShellHydration(page)
    await shoot(page, 'interface-phone')
  })
})
