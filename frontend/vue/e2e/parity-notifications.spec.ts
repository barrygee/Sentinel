import { test, expect, type Page } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState, seedNotifications } from './support/seedStore'

/**
 * Parity baseline (P0): notification click-to-navigate behaviour, across
 * every `NotificationType` (see `src/stores/notifications.ts`). This is a
 * regression lock for the planned Module Federation split — routing today
 * goes through `NotificationsPanel.vue`'s `handleItemClick`, which branches
 * on the item's `noradId`/`hex` fields (not its `type`):
 *   - `noradId` set    → a registered SpaceMap handler is called directly, or
 *     (nothing registered) `setPendingSatelliteTarget` + `router.push('/space/')`.
 *   - `hex` set        → same shape via the Air handler, routing to `/air/`.
 *   - neither set      → `handleItemClick` falls through and does nothing.
 * Each scenario below mirrors how that type is actually produced in the app
 * today (see the grep of `type: '<type>'` call sites across `src/`), so a
 * regression in the routing/section-remount behaviour shows up as a red test
 * here before it reaches an operator.
 */

// Pre-seed a location so App.vue's `LOCATION UNAVAILABLE` system notification
// never fires — it would otherwise pollute the panel and the unread count for
// every test in this file.
async function seedLocation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sentinel_user_location',
      JSON.stringify({ latitude: 51.5, longitude: -0.1, ts: Date.now(), manual: true }),
    )
  })
}

async function openAlertsPane(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^alerts$/i }).click()
  await expect(page.locator('#msb-pane-alerts')).toBeVisible()
}

function notifCard(page: Page, title: string) {
  return page.locator('.notif-item', { has: page.locator('.notif-title', { hasText: title }) })
}

interface NotifTypeScenario {
  /** Every member of `NotificationType` (stores/notifications.ts) — one row each. */
  type:
    | 'flight'
    | 'departure'
    | 'track'
    | 'untrack'
    | 'tracking'
    | 'autotune'
    | 'notif-off'
    | 'system'
    | 'message'
    | 'emergency'
    | 'squawk-clr'
    | 'overhead'
  /** Which target field the app actually attaches to this type in production. */
  target: 'aircraft' | 'satellite' | 'none'
}

// The real call sites for each type (grepped across src/), so the seeded
// shape here matches what the app would actually produce:
//   aircraft (hex): flight/departure (AircraftEventDetector), track/untrack
//     (AdsbLiveControl), emergency/squawk-clr (AdsbLiveControl) — all Air/ADS-B.
//   satellite (noradId): autotune (SpaceFilter/SpacePasses), tracking
//     (SatellitePassScheduler/SatellitePassNotifier — a pass heads-up).
//   none: notif-off (AirFilter passes no hex), system (App.vue/settings
//     controls), message (declared in NotificationType but no current
//     producer attaches a target to it).
//
// 'overhead' is deliberately NOT in this table — see the dedicated test
// below. A seeded 'overhead' item cannot reach a click at all: App.vue starts
// `useAirAlertsService()` app-wide on mount, which constructs an
// `OverheadAlertsTracker` and immediately calls `setZones(activeZones.value)`
// with whatever zones are active at that instant. With no user-location
// alert radius or Sentry configured (this suite's mocks), that first call is
// `setZones([])`, which runs `_dismissAllOverhead()` — clearing every
// existing 'overhead' notification, including ours, before the panel is even
// opened. That is real, intentional behaviour (an overhead alert whose zone
// no longer exists is stale and should not linger), not a bug to route
// around.
const scenarios: NotifTypeScenario[] = [
  { type: 'flight', target: 'aircraft' },
  { type: 'departure', target: 'aircraft' },
  { type: 'track', target: 'aircraft' },
  { type: 'untrack', target: 'aircraft' },
  { type: 'tracking', target: 'satellite' },
  { type: 'autotune', target: 'satellite' },
  { type: 'notif-off', target: 'none' },
  { type: 'system', target: 'none' },
  { type: 'message', target: 'none' },
  { type: 'emergency', target: 'aircraft' },
  { type: 'squawk-clr', target: 'aircraft' },
]

test.describe('Notification click-to-navigate, every type (P0 parity)', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await seedLocation(page)
    await installDefaultMocks(page)
  })

  for (const scenario of scenarios) {
    test(`${scenario.type} notification (${scenario.target} target) navigates as expected from a different section`, async ({
      page,
    }) => {
      const title = `PARITY ${scenario.type.toUpperCase()} ALERT`
      const item = {
        id: `parity-${scenario.type}`,
        type: scenario.type,
        title,
        detail: 'Seeded for the P0 parity baseline',
        ts: Date.now(),
        ...(scenario.target === 'aircraft' ? { hex: 'AB1234' } : {}),
        ...(scenario.target === 'satellite' ? { noradId: '25544', satName: 'ISS (ZARYA)' } : {}),
      }
      await seedNotifications(page, [item])

      // Start on Land — neither the Air nor the Space map handler is
      // registered, so any navigation must come from the panel's
      // setPendingAircraftTarget/setPendingSatelliteTarget + router.push
      // fallback, never a stale in-page handler call.
      await page.goto('/land/')
      await waitForShellHydration(page)
      await openAlertsPane(page)

      const card = notifCard(page, title)
      await expect(card).toBeVisible()
      await card.locator('.notif-title').click()

      if (scenario.target === 'aircraft') {
        await expect(page).toHaveURL(/\/air\/$/)
      } else if (scenario.target === 'satellite') {
        await expect(page).toHaveURL(/\/space\/$/)
      } else {
        // No target on the item: handleItemClick falls through with no
        // router.push — the route must not change, and clicking must not
        // throw (which would otherwise wedge the panel for a real "no
        // action" card like a plain SYSTEM notice).
        await page.waitForTimeout(200)
        await expect(page).toHaveURL(/\/land\/$/)
        await expect(card).toBeVisible()
      }
    })
  }

  // Regression lock for the F9 fix (PR #382): visiting /air/ registers the
  // Air click handler (AirMap.vue's registerAircraftClickHandler). Leaving the
  // section in-app (no page reload, so module state survives) must clear it,
  // otherwise the stale handler swallows the click and the panel never routes
  // back to /air/.
  test('aircraft alert still navigates to /air/ after visiting and leaving Air in-app', async ({
    page,
  }) => {
    const title = 'PARITY AIRCRAFT AFTER LEAVE'
    await seedNotifications(page, [
      {
        id: 'parity-aircraft-after-leave',
        type: 'flight',
        title,
        detail: 'Seeded for the P0 parity baseline',
        ts: Date.now(),
        hex: 'AB1234',
      },
    ])

    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.locator('[data-domain="land"]').first().click()
    await expect(page).toHaveURL(/\/land\/$/)

    await openAlertsPane(page)
    await notifCard(page, title).locator('.notif-title').click()

    await expect(page).toHaveURL(/\/air\/$/)
  })

  test('overhead notifications are stale-cleared on load rather than staying clickable (OverheadAlertsTracker)', async ({
    page,
  }) => {
    const title = 'PARITY OVERHEAD ALERT'
    await seedNotifications(page, [
      {
        id: 'parity-overhead',
        type: 'overhead',
        title,
        detail: 'Seeded for the P0 parity baseline',
        ts: Date.now(),
        hex: 'AB1234',
      },
    ])

    await page.goto('/land/')
    await waitForShellHydration(page)
    await openAlertsPane(page)

    // useAirAlertsService (started app-wide from App.vue) clears every
    // 'overhead' notification on boot when no overhead zone is configured —
    // the seeded item never survives to be clickable.
    await expect(page.locator('#msb-alerts-empty')).toBeVisible()
    await expect(notifCard(page, title)).toHaveCount(0)
  })
})

test.describe('Notification dismiss and clear-all (P0 parity)', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await seedLocation(page)
    await installDefaultMocks(page)
  })

  test('dismissing one seeded notification leaves the other untouched', async ({ page }) => {
    await seedNotifications(page, [
      {
        id: 'parity-dismiss-a',
        type: 'system',
        title: 'PARITY DISMISS A',
        detail: 'First',
        ts: Date.now() - 1000,
      },
      {
        id: 'parity-dismiss-b',
        type: 'system',
        title: 'PARITY DISMISS B',
        detail: 'Second',
        ts: Date.now(),
      },
    ])
    await page.goto('/air/')
    await waitForShellHydration(page)
    await openAlertsPane(page)

    await expect(notifCard(page, 'PARITY DISMISS A')).toBeVisible()
    await expect(notifCard(page, 'PARITY DISMISS B')).toBeVisible()

    await notifCard(page, 'PARITY DISMISS A')
      .getByRole('button', { name: /^dismiss$/i })
      .click()

    await expect(notifCard(page, 'PARITY DISMISS A')).not.toBeVisible()
    await expect(notifCard(page, 'PARITY DISMISS B')).toBeVisible()
  })

  test('CLEAR removes every actionless notification and restores the empty state', async ({
    page,
  }) => {
    await seedNotifications(page, [
      {
        id: 'parity-clear-a',
        type: 'system',
        title: 'PARITY CLEAR A',
        detail: 'First',
        ts: Date.now() - 1000,
      },
      {
        id: 'parity-clear-b',
        type: 'message',
        title: 'PARITY CLEAR B',
        detail: 'Second',
        ts: Date.now(),
      },
    ])
    await page.goto('/air/')
    await waitForShellHydration(page)
    await openAlertsPane(page)

    await expect(notifCard(page, 'PARITY CLEAR A')).toBeVisible()
    await expect(notifCard(page, 'PARITY CLEAR B')).toBeVisible()

    await page.getByRole('button', { name: /^clear alerts$/i }).click()

    await expect(notifCard(page, 'PARITY CLEAR A')).not.toBeVisible()
    await expect(notifCard(page, 'PARITY CLEAR B')).not.toBeVisible()
    await expect(page.locator('#msb-alerts-empty')).toBeVisible()
  })
})
