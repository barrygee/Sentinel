import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * The in-app docs (`/doc/...`): opened from the Settings rail, read, searched
 * and closed again. Real layout matters here (no horizontal page scroll on a
 * phone, focus landing on headings), which jsdom cannot show.
 */

const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const docsPage = '[data-testid="docs-page"]'
const liveStatus = '[data-testid="docs-live-status"]'

async function auditDocs(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()
}

/** True when the page itself scrolls sideways (not just an inner scroll region). */
async function pageScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
}

test.describe('Docs', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('opens from the Settings Docs rail entry and closes back to where it came from', async ({
    page,
  }) => {
    await page.goto('/space/')
    await waitForShellHydration(page)
    await page.locator('#settings-btn').click()
    await expect(page.locator('#settings-panel.settings-panel-visible')).toBeVisible()

    const docsEntry = page.getByRole('link', { name: 'Docs (documentation)' })
    await expect(docsEntry).toHaveAttribute('href', '/doc/')
    await docsEntry.click()

    await expect(page).toHaveURL(/\/doc\/$/)
    await expect(page.locator(docsPage)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/welcome to sentinel/i)

    await page.getByRole('button', { name: 'Close docs' }).click()
    // Docs was opened from the Settings page, so closing lands back there.
    await expect(page).toHaveURL(/\/settings\/app$/)
    await expect(page.locator('#settings-panel.settings-panel-visible')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/space\/$/)
  })

  test('Escape closes the docs and returns to the section', async ({ page }) => {
    await page.goto('/air/')
    await waitForShellHydration(page)
    await page.goto('/doc/operations')
    await waitForShellHydration(page)
    await expect(page.locator(docsPage)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/(air|space|sea|land|sdr)\/$/)
    await expect(page.locator(docsPage)).toHaveCount(0)
  })

  test('moves between pages with the group rail and the page list', async ({ page }) => {
    await page.goto('/doc/')
    await waitForShellHydration(page)

    await page.getByRole('link', { name: 'Set up and run' }).click()
    await expect(page).toHaveURL(/\/doc\/configuration$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/environment variables/i)
    await expect(page).toHaveTitle('Environment variables (.env) · Docs · Sentinel')

    const pageList = page.getByRole('navigation', { name: 'Pages in Set up and run' })
    await expect(
      pageList.getByRole('link', { name: 'Environment variables (.env)' }),
    ).toHaveAttribute('aria-current', 'page')
    await pageList.getByRole('link', { name: 'Check logs, health and backups' }).click()
    await expect(page).toHaveURL(/\/doc\/operations$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/check logs/i)
    // Opening a page puts keyboard focus on its heading.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  })

  test('an unknown doc path shows the not-found page with a focused search box', async ({
    page,
  }) => {
    await page.goto('/doc/no/such/page')
    await waitForShellHydration(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('PAGE NOT FOUND')
    await expect(page.locator('.doc-not-found code')).toHaveText('/doc/no/such/page')
    await expect(page.locator('.doc-not-found input')).toBeFocused()
    await expect(page.locator('.doc-not-found input')).toHaveValue('page')
    await expect(page.getByRole('link', { name: 'Welcome to Sentinel' }).first()).toBeVisible()
  })

  test.describe('search', () => {
    test('a cold load of /doc/?q= shows results and announces how many', async ({ page }) => {
      await page.goto('/doc/?q=recordings')
      await waitForShellHydration(page)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('SEARCH RESULTS')
      await expect(page.locator('.doc-search-result').first()).toBeVisible()
      await expect(page.locator('input[type="search"]')).toHaveValue('recordings')
      // Exactly one live region on the page, and it speaks the count.
      await expect(page.locator(docsPage).locator('[role="status"]')).toHaveCount(1)
      await expect(page.locator(liveStatus)).toHaveText(/^\d+ results?$/)
    })

    test('says so when nothing matches', async ({ page }) => {
      await page.goto('/doc/?q=zzzqqqxxx')
      await waitForShellHydration(page)
      await expect(page.locator('.doc-search-results__empty')).toHaveText(
        'NO RESULTS FOR “ZZZQQQXXX”',
      )
      await expect(page.locator(liveStatus)).toHaveText('No results')
    })

    test('lists sections containing every word before sections with only one of them', async ({
      page,
    }) => {
      await page.goto('/doc/')
      await waitForShellHydration(page)
      await page.locator('input[type="search"]').fill('recordings folder')
      await expect(page).toHaveURL(/q=recordings/)
      await expect(page.locator('.doc-search-result').first()).toBeVisible()
      const hrefs = await page
        .locator('.doc-search-result a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
      const bothWords = hrefs.indexOf('/doc/use/sdr/record#where-recordings-are-saved')
      const onlyOneWord = hrefs.findIndex((href) => href.startsWith('/doc/use/sdr/add-a-radio'))
      // Any word is enough to be listed (Add a radio mentions only "recordings")...
      expect(onlyOneWord).toBeGreaterThanOrEqual(0)
      // ...but the section about both comes first, well ahead of them.
      expect(bothWords).toBeGreaterThanOrEqual(0)
      expect(bothWords).toBeLessThan(onlyOneWord)
    })

    test('Enter on a result moves focus to its heading on another page', async ({ page }) => {
      await page.goto('/doc/?q=recordings')
      await waitForShellHydration(page)
      const target = page.locator('.doc-search-result a[href*="#"]').first()
      await expect(target).toBeVisible()
      const href = (await target.getAttribute('href')) ?? ''
      const anchor = decodeURIComponent(href.split('#')[1] ?? '')
      await target.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`#${anchor}$`))
      await expect(page.locator(`[id="${anchor}"]`)).toBeFocused()
    })

    test('Enter on a result for the page already open still moves focus to its heading', async ({
      page,
    }) => {
      await page.goto('/doc/operations#everyday-commands')
      await waitForShellHydration(page)
      await expect(page.locator('[id="everyday-commands"]')).toBeFocused()
      await page.locator('input[type="search"]').fill('recordings saved')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('SEARCH RESULTS')
      const sameLink = page.locator('.doc-search-result a[href^="/doc/operations#"]').first()
      await expect(sameLink).toBeVisible()
      const anchor = decodeURIComponent(
        ((await sameLink.getAttribute('href')) ?? '').split('#')[1] ?? '',
      )
      await sameLink.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator(`[id="${anchor}"]`)).toBeFocused()
    })

    test('Down from the box reaches the first result, Up on it returns to the box', async ({
      page,
    }) => {
      await page.goto('/doc/?q=recordings')
      await waitForShellHydration(page)
      const box = page.locator('input[type="search"]')
      await box.focus()
      await page.keyboard.press('ArrowDown')
      await expect(page.locator('.doc-search-result a').first()).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(box).toBeFocused()
    })
  })

  test('COPY on a code block copies, says so and keeps focus on the button', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/doc/operations')
    await waitForShellHydration(page)
    // By class, not name: the button's name changes to COPIED, which would re-point `first()` at the next block.
    const copy = page.locator('.doc-code__copy').first()
    await copy.focus()
    await page.keyboard.press('Enter')
    await expect(copy).toHaveText('COPIED')
    await expect(copy).toBeFocused()
    await expect(page.locator(liveStatus)).toHaveText('Copied to clipboard')
  })

  test.describe('accessibility and layout', () => {
    for (const { name, width, height } of [
      { name: '1440', width: 1440, height: 900 },
      { name: '320', width: 320, height: 640 },
    ]) {
      test(`docs pages have no WCAG 2.2 AA violations at ${name}px wide`, async ({ page }) => {
        test.slow()
        await page.setViewportSize({ width, height })
        for (const path of ['/doc/', '/doc/operations', '/doc/?q=recordings', '/doc/no/such']) {
          await page.goto(path)
          await waitForShellHydration(page)
          await expect(page.locator(docsPage)).toBeVisible()
          const results = await auditDocs(page)
          expect(results.violations, `${path} at ${name}px`).toEqual([])
        }
      })
    }

    test('does not scroll sideways at 320px, including a page with a code block inside a list', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 })
      for (const path of [
        '/doc/',
        '/doc/operations',
        '/doc/use/offline-maps',
        '/doc/configuration',
        '/doc/tasks/track-ships-off-grid',
      ]) {
        await page.goto(path)
        await waitForShellHydration(page)
        await expect(page.locator(docsPage)).toBeVisible()
        expect(await pageScrollsSideways(page), path).toBe(false)
      }
      // The nested code block scrolls inside its own focusable group instead.
      await page.goto('/doc/tasks/track-ships-off-grid')
      await waitForShellHydration(page)
      await expect(page.locator('.doc-nested-scroll').first()).toHaveAttribute('tabindex', '0')
    })
  })
})
