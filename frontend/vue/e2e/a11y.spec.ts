import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installDefaultMocks } from './support/mockApi'

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

  test('light theme has no WCAG 2.2 AA violations with a domain pane open', async ({ page }) => {
    // Every audit above runs in the dark theme, so nothing else in the suite
    // renders the light palette at all. One route with the sidebar open covers
    // the surface the theme changes: the shell chrome plus a domain pane (the
    // rails and the map stay dark by design).
    //
    // What this does NOT cover: colour contrast inside the sidebar. The panel
    // is 98% opaque, and axe reports contrast over a partially transparent
    // background as `incomplete` rather than a violation — a deliberately
    // broken light palette still passes here. The `toHaveCSS` assertion below
    // is what proves the light values actually reached the DOM; the audit
    // itself guards the structural rules (names, roles, target size) in a
    // theme no other test renders.
    test.slow()
    // Unlike the audits above, this one drives the sidebar — and with no API
    // answering, `NoUrlOverlay` hides the rail entirely (`body[data-no-data]`),
    // so the rail button would never appear. The audits above don't need it;
    // this one does, so it mocks the API like the sidebar specs do.
    await installDefaultMocks(page)
    await page.goto('/air/')
    await expect(page.getByRole('navigation', { name: /domains/i })).toBeVisible()
    await expect(page.locator('main#main')).toBeAttached()
    // Flip the attribute the stylesheets key off, AFTER hydration: the theme
    // store re-applies its own restored value while booting (and rewrites the
    // persisted key), so a value seeded into localStorage is overwritten
    // before the audit runs. What is being audited is the rendered palette,
    // and this is the same attribute the store itself sets.
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light'
    })
    await page.locator('#map-sidebar-rail .msb-rail-btn[data-tab="search"]').click()
    await expect(page.locator('#msb-pane-search.msb-pane-active')).toBeVisible()
    await expect(page.locator('#map-sidebar')).toHaveCSS(
      'background-color',
      'rgba(246, 246, 244, 0.98)',
    )

    const results = await auditPage(page)

    expect(
      results.violations,
      `axe violations in the light theme: ${results.violations.map((violation) => violation.id).join(', ')}`,
    ).toEqual([])
  })

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
