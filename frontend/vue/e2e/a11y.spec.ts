import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import { openRadioSection, playDemoRadio } from './support/demoSdr'

/**
 * Live accessibility audit — runs the real axe-core engine in a real browser
 * against the running SPA. This is the verification pass that the static audit
 * and the in-process `jest-axe` unit suite cannot fully provide: only a real
 * browser computes layout, so layout-dependent WCAG 2.2 AA rules — colour
 * contrast and Target Size (2.5.8) in particular — are exercised here.
 */

/** Every routed domain view. All are enabled by default (see `stores/app.ts`),
 *  so each resolves without a redirect even with no backend present. */
const DOMAIN_ROUTES = [
  { domain: 'air', path: '/air/' },
  { domain: 'space', path: '/space/' },
  { domain: 'sea', path: '/sea/' },
  { domain: 'land', path: '/land/' },
  { domain: 'sdr', path: '/sdr/' },
] as const

/** WCAG 2.0 / 2.1 / 2.2 Level A + AA — the bar the project targets. */
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * Run axe over the current page, scoped to the project's WCAG AA bar.
 *
 * The MapLibre GL canvas is excluded: a WebGL canvas is inherently opaque to
 * assistive tech, so axe can say nothing useful about its *content*. The map's
 * accessibility is provided instead by an accessible region name plus a sidebar
 * list/data alternative (phase 8-5), and its third-party sub-controls
 * (zoom/attribution) are outside this app's remediation scope.
 */
async function auditPage(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).exclude('.maplibregl-map').analyze()
}

test.describe('Live accessibility audit (axe-core, WCAG 2.2 AA)', () => {
  for (const { domain, path } of DOMAIN_ROUTES) {
    test(`${domain} view has no WCAG 2.2 AA violations`, async ({ page }) => {
      // A full-page axe run is the most expensive thing in the suite: it walks
      // every element for the layout-dependent rules (contrast, target size)
      // inside one `frame.evaluate`. Alone each takes ~4s, but with
      // `fullyParallel` four of these can land on the same cores at once, and
      // the Sea view — the densest DOM, with a label per vessel — then blows
      // through the 60s default. Triple the budget rather than thin the audit
      // or drop workers; the same parallel-load allowance is why the vitest
      // jest-axe timeout is raised in `vitest.config.ts`.
      test.slow()
      await page.goto(path)
      // Gate on the always-visible header nav (proves the shell has hydrated) and
      // the routed view's <main> being in the DOM, so axe audits a fully-rendered
      // shell. `<main>` itself collapses to zero height — its children are
      // absolutely/fixed-positioned — so it can't be gated on with `toBeVisible`.
      await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible()
      await expect(page.locator('main#main')).toBeAttached()

      const results = await auditPage(page)

      // Surface the rule ids in the failure message so a regression is readable
      // without opening the HTML report.
      expect(
        results.violations,
        `axe violations on ${path}: ${results.violations.map((violation) => violation.id).join(', ')}`,
      ).toEqual([])
    })
  }

  // Settings is a light page with its own greys: a caption or description that
  // reads fine on the dark views can fall under AA here (it did, at 2.2:1).
  for (const section of ['app', 'air', 'space', 'sea', 'land', 'sdr']) {
    test(`Settings › ${section} has no WCAG 2.2 AA violations`, async ({ page }) => {
      test.slow()
      await clearPersistedState(page)
      await installDefaultMocks(page)
      await page.goto(`/settings/${section}`)
      await waitForShellHydration(page)
      await expect(page.locator('#settings-section-heading')).toBeVisible()

      const results = await auditPage(page)

      expect(
        results.violations,
        `axe violations on /settings/${section}: ${results.violations.map((violation) => violation.id).join(', ')}`,
      ).toEqual([])
    })
  }

  // The section views above are audited empty. These open the SDR panels with
  // the demo radio playing and saved data in them, where the small greys live:
  // frequency rows, slider readouts, recording labels, the footer readout.
  for (const { name, open } of [
    { name: 'radio panel, playing', open: async () => {} },
    { name: 'Favourites', open: (page: Page) => openRadioSection(page, 'FAVOURITES') },
    {
      name: 'Frequency Manager tab',
      open: (page: Page) =>
        page.locator('#sdr-sidebar-rail [data-tab="frequency-manager"]').click(),
    },
    {
      name: 'Recordings tab',
      open: (page: Page) => page.locator('#sdr-sidebar-rail [data-tab="recordings"]').click(),
    },
  ]) {
    test(`SDR ${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
      test.slow()
      await clearPersistedState(page)
      await installDefaultMocks(page)
      await playDemoRadio(page)
      await open(page)
      // Let the spectrum draw and the saved-frequency markers settle.
      await page.waitForTimeout(1500)

      const results = await auditPage(page)

      expect(
        results.violations,
        `axe violations on SDR ${name}: ${results.violations.map((violation) => violation.id).join(', ')}`,
      ).toEqual([])
    })
  }

  test('skip link is the first focusable element and targets the main landmark', async ({
    page,
  }) => {
    await page.goto('/air/')
    // Wait for the shell to hydrate before tabbing, otherwise the first Tab can
    // land before the skip link is wired up (flaky under parallel load).
    await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible()
    await page.keyboard.press('Tab')

    const skipLink = page.locator('a.skip-link')
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toHaveAttribute('href', '#main')
  })

  test('changing route moves focus to the main landmark and updates the title', async ({
    page,
  }) => {
    await page.goto('/air/')
    await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible()

    // Navigate via the in-app domain nav so the router's afterEach focus/title
    // handling runs exactly as it does for a real keyboard user.
    await page
      .getByRole('navigation', { name: /domains/i })
      .getByRole('link', { name: /space/i })
      .click()

    await expect(page).toHaveURL(/\/space\//)
    await expect(page.locator('main#main')).toBeFocused()
    await expect(page).toHaveTitle(/space/i)
  })
})
