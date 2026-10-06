import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { DEPLOYED_SECTIONS, installDefaultMocks } from './support/mockApi'
import { waitForShellHydration } from './support/hydrationGate'

/**
 * A section whose federation remote cannot be loaded (its container is down,
 * or its files are missing) must not take the app down — plan §3.5. The shell
 * registers a stand-in in its place: the nav link stays, marked unavailable,
 * and its route explains what happened while every other section keeps
 * working.
 */

/** Makes one section's remote unreachable, as if its container were down. */
async function takeRemoteDown(page: Page, sectionId: string): Promise<void> {
  await page.route(`/remotes/${sectionId}/**`, (route) => route.abort())
}

/** The desktop domain nav (the mobile overlay repeats the same links). */
function domainNav(page: Page) {
  return page.getByRole('navigation', { name: /domains/i })
}

test.describe('Section remote down', () => {
  test.beforeEach(async ({ page }) => {
    await installDefaultMocks(page)
    await takeRemoteDown(page, 'sea')
  })

  test("shows the unavailable page on the section's route", async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await expect(page).toHaveURL(/\/sea\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'SEA is unavailable' })).toBeVisible()
    await expect(page.locator('main#main')).toContainText('reload the page to try again')
  })

  test('keeps the nav link, marked unavailable, and leaves the others alone', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)

    const nav = domainNav(page)
    await expect(nav.getByRole('link', { name: 'SEA' })).toHaveAttribute('data-unavailable', 'true')
    for (const sectionId of ['air', 'space', 'land', 'sdr']) {
      await expect(nav.locator(`[data-domain="${sectionId}"]`)).not.toHaveAttribute(
        'data-unavailable',
      )
    }
  })

  test('the other sections still load', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    await domainNav(page).getByRole('link', { name: 'AIR' }).click()

    await expect(page).toHaveURL(/\/air\/$/)
    await expect(page.locator('.maplibregl-canvas').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /is unavailable/ })).toHaveCount(0)
  })

  test('the unavailable page does not hide the shell chrome', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)

    // A section view with no data source sets body[data-no-data], which hides
    // the sidebar and footer; the stand-in never does.
    await expect(page.locator('body')).not.toHaveAttribute('data-no-data')
    await expect(page.getByRole('button', { name: /^settings$/i })).toBeVisible()
  })

  test('the unavailable page has no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto('/sea/')
    await waitForShellHydration(page)
    await expect(page.getByRole('heading', { name: 'SEA is unavailable' })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.maplibregl-map')
      .analyze()

    expect(results.violations).toEqual([])
  })
})

test.describe('Section not deployed', () => {
  test('a section the backend does not list is not in the nav at all', async ({ page }) => {
    await installDefaultMocks(page)
    await page.route('/api/app/sections', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          sections: DEPLOYED_SECTIONS.filter((section) => section.id !== 'land'),
        }),
      })
    })

    await page.goto('/air/')
    await waitForShellHydration(page)

    const nav = domainNav(page)
    await expect(nav.getByRole('link', { name: 'AIR' })).toBeVisible()
    await expect(nav.locator('[data-domain="land"]')).toHaveCount(0)
  })
})
