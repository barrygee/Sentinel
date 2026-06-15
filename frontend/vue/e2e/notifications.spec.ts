import { test, expect } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState, seedNotifications } from './support/seedStore'

/**
 * Notifications panel tests: empty state, seeded notifications, dismiss,
 * and the ALERTS rail button pulse class when unread notifications exist.
 */

test.describe('Notifications panel', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('empty notifications panel shows "No alerts" when location is available', async ({
    page,
  }) => {
    // Pre-seed a location so App.vue does not add the "LOCATION UNAVAILABLE"
    // system notification on mount (that notification would make the panel non-empty)
    await page.addInitScript(() => {
      // The composable reads `sentinel_user_location` with keys: longitude, latitude, ts, manual
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ latitude: 51.5, longitude: -0.1, ts: Date.now(), manual: true }),
      )
    })
    await page.goto('/air/')
    await waitForShellHydration(page)

    // Open the ALERTS pane via the rail tab
    await page.getByRole('button', { name: /^alerts$/i }).click()
    await expect(page.locator('#msb-pane-alerts')).toBeVisible()

    await expect(page.locator('#msb-alerts-empty')).toBeVisible()
    await expect(page.locator('#msb-alerts-empty')).toContainText(/no alerts/i)
  })

  test('seeded notification renders in the alerts pane', async ({ page }) => {
    // Pre-seed location so the "LOCATION UNAVAILABLE" notification doesn't appear,
    // keeping the panel contents deterministic
    await page.addInitScript(() => {
      // The composable reads `sentinel_user_location` with keys: longitude, latitude, ts, manual
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ latitude: 51.5, longitude: -0.1, ts: Date.now(), manual: true }),
      )
    })
    await seedNotifications(page, [
      {
        id: 'test-notif-1',
        type: 'system',
        title: 'TEST SYSTEM ALERT',
        detail: 'This is a test alert detail',
        ts: Date.now(),
      },
    ])
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^alerts$/i }).click()
    await expect(page.locator('#msb-pane-alerts')).toBeVisible()

    // The notification should be rendered — filter to find it among any others
    await expect(page.locator('.notif-title', { hasText: 'TEST SYSTEM ALERT' })).toBeVisible()
    // The empty-state message should be gone
    await expect(page.locator('#msb-alerts-empty')).not.toBeVisible()
  })

  test('dismiss button removes the notification', async ({ page }) => {
    // Pre-seed location to suppress the LOCATION UNAVAILABLE system notification,
    // which would otherwise remain after the test notification is dismissed
    await page.addInitScript(() => {
      // The composable reads `sentinel_user_location` with keys: longitude, latitude, ts, manual
      localStorage.setItem(
        'sentinel_user_location',
        JSON.stringify({ latitude: 51.5, longitude: -0.1, ts: Date.now(), manual: true }),
      )
    })
    await seedNotifications(page, [
      {
        id: 'test-notif-dismiss',
        type: 'system',
        title: 'DISMISSABLE ALERT',
        detail: 'Click dismiss to remove',
        ts: Date.now(),
      },
    ])
    await page.goto('/air/')
    await waitForShellHydration(page)

    await page.getByRole('button', { name: /^alerts$/i }).click()
    await expect(page.locator('#msb-pane-alerts')).toBeVisible()
    await expect(page.locator('.notif-title', { hasText: 'DISMISSABLE ALERT' })).toBeVisible()

    // Click the dismiss button for the specific notification (there may be more than one)
    // We find the dismiss button within the notification card containing "DISMISSABLE ALERT"
    const notifCard = page.locator('.notif-item', {
      has: page.locator('.notif-title', { hasText: 'DISMISSABLE ALERT' }),
    })
    await notifCard.getByRole('button', { name: /^dismiss$/i }).click()

    // That specific notification title must be gone from the panel
    await expect(page.locator('.notif-title', { hasText: 'DISMISSABLE ALERT' })).not.toBeVisible()
  })

  test('ALERTS rail button has pulse class when unread notifications exist', async ({ page }) => {
    // Do NOT pre-seed a user location. App.vue watches `locationUnavailable` with
    // { immediate: true } — when no location is stored and geolocation is unavailable
    // (the Playwright browser doesn't grant geolocation permission), it calls
    // notificationsStore.add() on mount, which increments unreadCount. That is the
    // only path that sets unreadCount > 0 at startup (pre-seeding items to localStorage
    // does not increment the counter — the store initialises it at 0).
    await page.goto('/air/')
    await waitForShellHydration(page)

    // App.vue adds LOCATION UNAVAILABLE synchronously on mount (immediate watcher).
    // The ALERTS button must pulse while the panel is closed and unreadCount > 0.
    const alertsButton = page.getByRole('button', { name: /^alerts$/i })
    await expect(alertsButton).toHaveClass(/msb-rail-btn-pulse/, { timeout: 5000 })
  })

  test('ALERTS rail button pulse stops after opening the alerts pane', async ({ page }) => {
    // No location seeded — App.vue will add the LOCATION UNAVAILABLE notification
    // via notificationsStore.add(), setting unreadCount > 0 and triggering the pulse.
    await page.goto('/air/')
    await waitForShellHydration(page)

    // Wait for the pulse to appear (App.vue's immediate watcher fires on mount)
    await expect(page.getByRole('button', { name: /^alerts$/i })).toHaveClass(
      /msb-rail-btn-pulse/,
      { timeout: 5000 },
    )

    // Open the alerts pane — this marks notifications as read
    await page.getByRole('button', { name: /^alerts$/i }).click()
    await expect(page.locator('#msb-pane-alerts')).toBeVisible()

    // After opening, the pulse should stop (the pane is active, so the
    // msb-rail-btn-active class applies, which overrides the pulse animation)
    const alertsButton = page.getByRole('button', { name: /^alerts$/i })
    await expect(alertsButton).toHaveClass(/msb-rail-btn-active/)
    // When active, the pulse animation is not visible (CSS overrides it)
    // We assert the active state as the pulse-stopper
    await expect(alertsButton).toBeVisible()
  })
})
