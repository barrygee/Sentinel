import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import landRepeatersFixture from './fixtures/land-repeaters.json' with { type: 'json' }

/**
 * Land domain: the UK amateur-radio repeater directory.
 *
 * `repeaters` is the Land map's default layer, so a plain visit to `/land/`
 * plots the three fixture sites and lists the same three in the FILTER pane.
 * The map canvas is opaque to Playwright (and to assistive tech), so the map
 * side is asserted through the control's hidden data-table region, and the
 * rest through the sidebar pane the operator actually drives.
 *
 * Fixture (`fixtures/land-repeaters.json`):
 *   GB3NR  Norwich   2M + 70CM, FM + DMR, OPERATIONAL
 *   GB3CA  Carlisle  2M,         FM,       NOT OPERATIONAL
 *   GB7DN  Durham    70CM,       DMR,      OPERATIONAL
 * Each site is a distinct band/mode/status combination, so a chip that fails
 * to narrow the list is always visible as a wrong row count.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** The left sidebar's FILTER tab — the pane `LandFilter` teleports into. */
const FILTER_TAB = '[data-tab="search"]'

/** Open `/land/` with the sidebar FILTER pane showing the repeater list. */
async function openLandFilterPane(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/land/')
  await waitForShellHydration(page)
  await page.locator(FILTER_TAB).click()
  // The list only populates once the directory fetch has resolved and the
  // control has reported the map's viewport bounds to the store.
  await expect(repeaterOption(page, 'GB3NR')).toBeVisible({ timeout: 10_000 })
}

/** The pane row for one repeater, matched on the accessible name the list sets. */
function repeaterOption(
  page: import('@playwright/test').Page,
  callsign: string,
): ReturnType<import('@playwright/test').Page['getByRole']> {
  return page.getByRole('option', { name: new RegExp(`^Repeater ${callsign},`, 'i') })
}

/** Reveal the collapsed BAND/MODE/STATUS accordion above the list. */
async function expandRepeaterFilters(page: import('@playwright/test').Page): Promise<void> {
  const heading = page.getByRole('button', { name: /^repeater filters$/i })
  await expect(heading).toHaveAttribute('aria-expanded', 'false')
  await heading.click()
  await expect(heading).toHaveAttribute('aria-expanded', 'true')
}

/** One chip inside the named chip row (BAND, MODE or STATUS). */
function chip(
  page: import('@playwright/test').Page,
  rowLabel: string,
  chipLabel: string,
): ReturnType<import('@playwright/test').Page['getByRole']> {
  return page
    .getByRole('group', { name: new RegExp(`^${rowLabel}$`, 'i') })
    .getByRole('button', { name: new RegExp(`^${chipLabel}$`, 'i') })
}

test.describe('Land domain repeaters', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('map region and the repeaters data-table equivalent are present', async ({ page }) => {
    await page.goto('/land/')
    await waitForShellHydration(page)

    await expect(page.getByRole('region', { name: /land domain map/i })).toBeAttached()

    // The WebGL canvas is opaque to assistive tech, so the control mirrors the
    // plotted sites into a hidden table — one row per licensed channel, which
    // is four across the three fixture sites (GB3NR is dual-band).
    const repeaterRegion = page.getByRole('region', { name: /amateur radio repeaters/i })
    await expect(repeaterRegion).toBeAttached({ timeout: 10_000 })
    await expect(repeaterRegion).toContainText('GB3NR')
    await expect(repeaterRegion).toContainText('GB3CA')
    await expect(repeaterRegion).toContainText('GB7DN')
  })

  test('FILTER pane lists every in-view repeater with its town, bands and modes', async ({
    page,
  }) => {
    await openLandFilterPane(page)

    await expect(repeaterOption(page, 'GB3NR')).toBeVisible()
    await expect(repeaterOption(page, 'GB3CA')).toBeVisible()
    await expect(repeaterOption(page, 'GB7DN')).toBeVisible()

    // The secondary line carries the detail an operator scans for, and a site
    // with no working channel is called out rather than silently listed.
    await expect(repeaterOption(page, 'GB3NR')).toContainText('NORWICH')
    await expect(repeaterOption(page, 'GB3NR')).toContainText('2M')
    await expect(repeaterOption(page, 'GB3NR')).toContainText('70CM')
    await expect(repeaterOption(page, 'GB3CA')).toContainText('OFF AIR')
    await expect(repeaterOption(page, 'GB7DN')).not.toContainText('OFF AIR')
  })

  test('the search box narrows the repeater list by town', async ({ page }) => {
    await openLandFilterPane(page)

    // With repeaters the only Land layer on, the search box names that set.
    await page.getByRole('combobox', { name: /filter repeaters/i }).fill('durham')

    await expect(repeaterOption(page, 'GB7DN')).toBeVisible()
    await expect(repeaterOption(page, 'GB3NR')).toHaveCount(0)
    await expect(repeaterOption(page, 'GB3CA')).toHaveCount(0)
  })

  test('the BAND chips narrow the list, and ALL clears the narrowing again', async ({ page }) => {
    await openLandFilterPane(page)
    await expandRepeaterFilters(page)

    const twoMetres = chip(page, 'Band', '2M')
    await expect(twoMetres).toHaveAttribute('aria-pressed', 'false')
    await twoMetres.click()
    await expect(twoMetres).toHaveAttribute('aria-pressed', 'true')

    // GB7DN is 70CM-only, so it leaves the list; the two 2M sites stay.
    await expect(repeaterOption(page, 'GB3NR')).toBeVisible()
    await expect(repeaterOption(page, 'GB3CA')).toBeVisible()
    await expect(repeaterOption(page, 'GB7DN')).toHaveCount(0)

    await chip(page, 'Band', 'All').click()
    await expect(twoMetres).toHaveAttribute('aria-pressed', 'false')
    await expect(repeaterOption(page, 'GB7DN')).toBeVisible()
  })

  test('the MODE chips list only the modes the directory carries and narrow the list', async ({
    page,
  }) => {
    await openLandFilterPane(page)
    await expandRepeaterFilters(page)

    const modeRow = page.getByRole('group', { name: /^mode$/i })
    // The fixture carries FM and DMR only — no chip is offered for a mode no
    // repeater in the directory actually supports.
    await expect(modeRow.getByRole('button', { name: /^fm$/i })).toBeVisible()
    await expect(modeRow.getByRole('button', { name: /^dmr$/i })).toBeVisible()
    await expect(modeRow.getByRole('button', { name: /^fusion$/i })).toHaveCount(0)
    await expect(modeRow.getByRole('button', { name: /^d-star$/i })).toHaveCount(0)

    await modeRow.getByRole('button', { name: /^dmr$/i }).click()

    // GB3CA is FM-only; GB3NR carries DMR on its 70CM channel.
    await expect(repeaterOption(page, 'GB7DN')).toBeVisible()
    await expect(repeaterOption(page, 'GB3NR')).toBeVisible()
    await expect(repeaterOption(page, 'GB3CA')).toHaveCount(0)
  })

  test('the STATUS chips are single-select and split on-air from off-air sites', async ({
    page,
  }) => {
    await openLandFilterPane(page)
    await expandRepeaterFilters(page)

    const allSites = chip(page, 'Status', 'All')
    const onAir = chip(page, 'Status', 'On air')
    const offAir = chip(page, 'Status', 'Off air')
    await expect(allSites).toHaveAttribute('aria-pressed', 'true')

    await offAir.click()
    await expect(offAir).toHaveAttribute('aria-pressed', 'true')
    // Single-select: choosing one status releases the others.
    await expect(allSites).toHaveAttribute('aria-pressed', 'false')
    await expect(onAir).toHaveAttribute('aria-pressed', 'false')
    await expect(repeaterOption(page, 'GB3CA')).toBeVisible()
    await expect(repeaterOption(page, 'GB3NR')).toHaveCount(0)
    await expect(repeaterOption(page, 'GB7DN')).toHaveCount(0)

    await onAir.click()
    await expect(repeaterOption(page, 'GB3CA')).toHaveCount(0)
    await expect(repeaterOption(page, 'GB3NR')).toBeVisible()
    await expect(repeaterOption(page, 'GB7DN')).toBeVisible()
  })

  test('expanding a repeater row reveals its channel detail', async ({ page }) => {
    await openLandFilterPane(page)

    // `aria-selected` tracks keyboard focus, not disclosure — the accordion
    // body is what appears, and only for the row that was clicked.
    const expandedRow = page.locator('.bfp-accordion-body')
    await expect(expandedRow).toHaveCount(0)

    await repeaterOption(page, 'GB3NR').click()
    await expect(expandedRow).toHaveCount(1)
    await expect(expandedRow).toBeVisible()

    // The SITE grid, then a section per licensed channel — GB3NR is dual-band,
    // so both its channels' frequencies are listed.
    const norwichStation = landRepeatersFixture.stations[0]!
    await expect(expandedRow).toContainText(norwichStation.locator)
    await expect(expandedRow).toContainText(norwichStation.keeper)
    for (const channel of norwichStation.channels) {
      // The section is titled by band and UK channel designator; the tune cells
      // carry the bare frequency, with the unit in their "OUTPUT · NFM" label.
      await expect(expandedRow).toContainText(`${channel.band} · ${channel.channel}`)
      await expect(expandedRow).toContainText(channel.txMhz.toFixed(4))
      await expect(expandedRow).toContainText(channel.rxMhz.toFixed(4))
    }

    // Clicking the open row again closes it.
    await repeaterOption(page, 'GB3NR').click()
    await expect(expandedRow).toHaveCount(0)
  })

  test('the repeater pane and its chips have no WCAG 2.2 AA violations', async ({ page }) => {
    await openLandFilterPane(page)
    await expandRepeaterFilters(page)
    await repeaterOption(page, 'GB3NR').click()

    // Scoped to the sidebar pane, not the whole page: `a11y.spec.ts` already
    // audits the /land/ shell, and a second full-page axe run here competes
    // with that suite's scans badly enough to time one of them out under the
    // default four workers. This scan is about the surfaces the repeater
    // feature added — the chip rows, the list and the expanded detail.
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_AA_TAGS)
      .include('#msb-pane-search')
      .analyze()

    expect(
      results.violations,
      `axe violations on the Land repeater pane: ${results.violations
        .map((violation) => violation.id)
        .join(', ')}`,
    ).toEqual([])
  })

  test('an empty directory leaves the list empty rather than erroring', async ({ page }) => {
    // Registered after installDefaultMocks so this override wins.
    await page.route('**/api/land/repeaters', (route) => {
      void route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ source: 'bundled', fetchedAt: null, stations: [] }),
      })
    })

    await page.goto('/land/')
    await waitForShellHydration(page)
    await page.locator(FILTER_TAB).click()

    await expect(page.getByRole('region', { name: /amateur radio repeaters/i })).toContainText(
      /no amateur radio repeaters in view/i,
      { timeout: 10_000 },
    )
    await expect(page.getByRole('option', { name: /^Repeater /i })).toHaveCount(0)
    // With no directory the repeater filters take no part in the pane at all.
    await expect(page.getByRole('button', { name: /^repeater filters$/i })).toHaveCount(0)
  })
})
