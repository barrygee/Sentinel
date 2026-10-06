import { test, expect, type Page } from '@playwright/test'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'
import sdrFrequencies from './fixtures/sdr-frequencies.json' with { type: 'json' }
import sdrGroups from './fixtures/sdr-groups.json' with { type: 'json' }
import sdrRecordings from './fixtures/sdr-recordings.json' with { type: 'json' }
import sdrSearchRanges from './fixtures/sdr-search-ranges.json' with { type: 'json' }

/**
 * Remote CSS injection order (docs/plans/section-containers.md §3.6).
 *
 * The sdr remote's styles arrive as several CSS chunks (`./register`, the lazy
 * SDR view, the engine), injected when each chunk loads. Some of those rules
 * depend on cascade ORDER, not specificity: `SdrPanel.css` must come before the
 * unscoped families moved out of it into `SdrGroupsTab.vue` and
 * `SdrRecordingsSection.vue`, which override it at equal specificity. A change
 * in how the chunks split or load can reverse that order with every unit test
 * still green — the panel just renders with the wrong padding or colour.
 *
 * So this records the resolved style of every element in each SDR surface and
 * compares it with a committed snapshot. Only properties the cascade decides
 * and layout does not are read (colours, padding, borders, typography,
 * display…; no widths, heights or margins, which `auto` resolves from
 * layout), so the snapshot is the same on every OS. Animated properties
 * (opacity, transform) are left out.
 *
 * A diff here after a deliberate style change: regenerate with
 * `npx playwright test e2e/sdr-css-cascade.spec.ts --update-snapshots`, and
 * check the diff only shows what you meant to change.
 */

const CASCADE_PROPERTIES = [
  'display',
  'position',
  'visibility',
  'color',
  'background-color',
  'background-image',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'outline-style',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-transform',
  'text-align',
  'white-space',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'gap',
  'cursor',
  'pointer-events',
  'user-select',
  'z-index',
  'overflow-x',
  'overflow-y',
] as const

// Inherited properties: an element records one only where it differs from its
// parent, so a colour set on a container is not repeated down the tree.
const INHERITED_PROPERTIES = new Set<string>([
  'visibility',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-transform',
  'text-align',
  'white-space',
  'cursor',
  'pointer-events',
])

/**
 * The resolved styles under `rootSelector`, one indented line per element:
 * its tag, id and classes, then every property whose value is not what it
 * would be anyway — inherited ones that differ from the parent, the rest that
 * differ from the browser's default for that tag (read from an unstyled
 * iframe). That keeps the snapshot to what the app's CSS actually decides.
 */
async function resolvedStyles(page: Page, rootSelector: string): Promise<string> {
  return page.locator(rootSelector).evaluate(
    (root, { properties, inherited }) => {
      const inheritedProperties = new Set(inherited)
      const unstyledFrame = document.createElement('iframe')
      unstyledFrame.style.display = 'none'
      document.body.append(unstyledFrame)
      const unstyledDocument = unstyledFrame.contentDocument!
      const defaultsByTag = new Map<string, CSSStyleDeclaration>()
      function browserDefaults(tagName: string): CSSStyleDeclaration {
        let defaults = defaultsByTag.get(tagName)
        if (!defaults) {
          const probe = unstyledDocument.createElement(tagName)
          unstyledDocument.body.append(probe)
          defaults = unstyledFrame.contentWindow!.getComputedStyle(probe)
          defaultsByTag.set(tagName, defaults)
        }
        return defaults
      }
      function describe(element: Element): string {
        const classes = [...element.classList].sort().join('.')
        return (
          element.tagName.toLowerCase() +
          (element.id ? `#${element.id}` : '') +
          (classes ? `.${classes}` : '')
        )
      }
      const lines: string[] = []
      function walk(
        element: Element,
        depth: number,
        parentStyle: CSSStyleDeclaration | null,
      ): void {
        const style = getComputedStyle(element)
        const defaults = browserDefaults(element.tagName.toLowerCase())
        const decided = properties
          .filter((property) => {
            const value = style.getPropertyValue(property)
            // A border that is not drawn still reports its currentColor; only a
            // drawn one is the CSS's doing.
            if (property.startsWith('border-') && property !== 'border-radius') {
              return style.getPropertyValue(`${property}-style`) !== 'none'
            }
            if (inheritedProperties.has(property) && parentStyle) {
              return value !== parentStyle.getPropertyValue(property)
            }
            return value !== defaults.getPropertyValue(property)
          })
          .map((property) => `${property}=${style.getPropertyValue(property)}`)
        lines.push(
          `${'  '.repeat(depth)}${describe(element)}${decided.length ? ` | ${decided.join('; ')}` : ''}`,
        )
        for (const child of element.children) walk(child, depth + 1, style)
      }
      walk(root, 0, null)
      unstyledFrame.remove()
      return lines.join('\n') + '\n'
    },
    { properties: [...CASCADE_PROPERTIES], inherited: [...INHERITED_PROPERTIES] },
  )
}

async function openSdrTab(page: Page, tabId: string): Promise<void> {
  await page.locator(`#sdr-sidebar-rail [data-tab="${tabId}"]`).click()
  await expect(page.locator('#msb-pane-radio')).toBeVisible()
}

test.describe('SDR remote CSS cascade', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // The snapshot holds no rendering, only resolved CSS values, so one
    // baseline serves every OS (Playwright suffixes the platform by default).
    testInfo.snapshotSuffix = ''
    await clearPersistedState(page)
    await installDefaultMocks(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.routeWebSocket('/ws/sdr/**', (webSocket) => webSocket.close())
    const fixtures: Record<string, unknown> = {
      '/api/sdr/frequencies': sdrFrequencies,
      '/api/sdr/groups': sdrGroups,
      '/api/sdr/recordings': sdrRecordings,
      '/api/sdr/search-ranges': sdrSearchRanges,
    }
    for (const [url, body] of Object.entries(fixtures)) {
      await page.route(url, (route) =>
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }),
      )
    }
    await page.goto('/sdr/')
    await waitForShellHydration(page)
  })

  test('SDR page view', async ({ page }) => {
    await expect(page.locator('#sdr-page')).toBeAttached()
    expect(await resolvedStyles(page, '#sdr-page')).toMatchSnapshot('sdr-page.txt')
  })

  for (const tabId of ['radio', 'frequency-manager', 'groups', 'search-ranges', 'recordings']) {
    test(`radio pane — ${tabId} tab`, async ({ page }) => {
      await openSdrTab(page, tabId)
      expect(await resolvedStyles(page, '#msb-pane-radio')).toMatchSnapshot(`pane-${tabId}.txt`)
    })
  }
})
