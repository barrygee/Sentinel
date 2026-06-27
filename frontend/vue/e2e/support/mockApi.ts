import type { Page } from '@playwright/test'

/**
 * Install default catch-all API stubs for every Sentinel `/api/**` route.
 *
 * The preview server serves the committed SPA bundle with no Python backend.
 * Any fetch to `/api/**` that the SPA makes during startup would otherwise
 * result in a 404 (Vite preview doesn't proxy to FastAPI). These stubs return
 * the minimal JSON shapes that stores and components expect so the app renders
 * without errors and tests can layer their own per-path overrides on top.
 *
 * Call this in `test.beforeEach` before `page.goto()`. Tests that need
 * specific data override individual routes with their own `page.route()` call
 * AFTER this one — Playwright matches routes in most-recently-registered order
 * so the override wins.
 *
 * WebSocket routes (/ws/sdr/**) must be stubbed separately per-test using
 * `page.routeWebSocket(...)`.
 */
export async function installDefaultMocks(page: Page): Promise<void> {
  // ADS-B point data — empty aircraft list
  await page.route('/api/adsb/point', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ aircraft: [], total: 0 }),
    })
  })

  // ADS-B flights endpoint (used by AirFilter for search)
  await page.route('/api/adsb/flights', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Air-domain live/data endpoints. With a configured Air data source (set in the
  // settings mocks below) the AdsbLiveControl and the app-level alerts service
  // poll these on the /air/ route. Left unmocked, the SPA-fallback HTML response
  // is non-deterministic and — worse — would let stale aircraft/emergency data
  // surface as notifications. Empty payloads keep the alerts panel deterministic.
  //   /api/air/adsb/point/{lat}/{lon}/{radius} → { ac: [] } (note the `ac` key)
  await page.route('**/api/air/adsb/point/**', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ac: [] }) })
  })
  // /api/air/messages is the notifications sync source (notifications store).
  await page.route('**/api/air/messages', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/air/messages/**', (route) => {
    if (route.request().method() !== 'GET') void route.fulfill({ status: 204 })
    else void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/air/tracking', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/air/tracking/**', (route) => {
    if (route.request().method() !== 'GET') void route.fulfill({ status: 204 })
    else void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/air/recordings/**', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
  await page.route('**/api/air/snapshots**', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })

  // Space TLE status — report data present so NoUrlOverlay hides
  await page.route('/api/space/tle/status', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ total: 42, last_updated: null }),
    })
  })

  // Space TLE list — empty by default; tests override this.
  // SpaceFilter expects { satellites: [...] } — a raw array yields satellites = [].
  await page.route('/api/space/tle/list', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ satellites: [] }),
    })
  })

  // Space passes — empty by default. SpacePasses appends lat/lon/hours/etc. query
  // params so match on the path prefix with **. The response shape is
  // { passes: [], satellite_count: 0, computed_at: '' }.
  await page.route('/api/space/passes**', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ passes: [], satellite_count: 0, computed_at: '' }),
    })
  })

  // SDR radios — no radios by default
  await page.route('/api/sdr/radios', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // SDR frequencies — empty by default
  await page.route('/api/sdr/frequencies', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // SDR frequency groups — empty by default
  await page.route('/api/sdr/groups', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // SDR search ranges — empty by default
  await page.route('/api/sdr/search-ranges', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // SDR recordings — empty by default
  await page.route('/api/sdr/recordings', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // SDR reachability probe — the Settings dot and the radio dropdown poll this
  // per radio; default every radio to reachable so stubbed radios appear online.
  await page.route('/api/sdr/status/*', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ connected: true, reachable: true }),
    })
  })

  // SDR connect/disconnect
  await page.route('/api/sdr/connect', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('/api/sdr/disconnect', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  // Settings catch-all, registered FIRST so the per-namespace routes below
  // (added later) take priority — Playwright matches most-recently-registered
  // first. GET returns an empty object; PUT/DELETE are acknowledged silently.
  await page.route('/api/settings/**', (route) => {
    if (route.request().method() !== 'GET') {
      void route.fulfill({ status: 204 })
    } else {
      void route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
    }
  })

  // A configured data source is the app's normal operating state, so the default
  // mocks supply one for the URL-gated domains (air/sea/land). This keeps the
  // NoUrlOverlay hidden — and therefore the sidebar rail/panel and map controls
  // visible — for the majority of tests that exercise that chrome. Tests that
  // assert the overlay's presence override the relevant namespace with an empty
  // URL in their own body (a later, higher-priority route registration).
  const onlineDataSource = JSON.stringify({
    onlineDataSourceURL: 'http://192.168.1.1:8080/data/source.json',
  })
  await page.route('/api/settings/air', (route) => {
    void route.fulfill({ contentType: 'application/json', body: onlineDataSource })
  })
  await page.route('/api/settings/sea', (route) => {
    void route.fulfill({ contentType: 'application/json', body: onlineDataSource })
  })
  await page.route('/api/settings/land', (route) => {
    void route.fulfill({ contentType: 'application/json', body: onlineDataSource })
  })
  // Space gates on the TLE database (see /api/space/tle/status above), not a URL,
  // so its namespace stays empty. SDR and app have no NoUrlOverlay.
  await page.route('/api/settings/space', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })
  await page.route('/api/settings/sdr', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })
  await page.route('/api/settings/app', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify({}) })
  })
  // Top-level settings fetch (/api/settings) — used by main.ts to seed enabled
  // domains and other bootstrap data. Return all 5 domains enabled so the full
  // navigation renders (sea, land, etc.). Without this, DOMAINS_ON_BY_DEFAULT in
  // main.ts only enables air/space/sdr and Sea/Land nav links never appear.
  await page.route('/api/settings', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        air: { enabled: true },
        space: { enabled: true },
        sea: { enabled: true },
        land: { enabled: true },
        sdr: { enabled: true },
        app: {},
      }),
    })
  })

  // Notifications sync — return empty list
  await page.route('/api/notifications', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })

  // Connectivity probe URL — return 204 so the app considers itself online
  await page.route('/api/probe', (route) => {
    void route.fulfill({ status: 204 })
  })

  // Space satellite propagation / positions
  await page.route('/api/space/positions', (route) => {
    void route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) })
  })
}
