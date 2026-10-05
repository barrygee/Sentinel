import { test, type Page } from '@playwright/test'
import { installDefaultMocks } from './support/mockApi'

const PROPS = [
  'color',
  'background-color',
  'font-weight',
  'font-size',
  'font-family',
  'display',
  'visibility',
  'opacity',
  'margin',
  'padding',
  'border',
  'width',
  'height',
  'position',
  'gap',
  'text-transform',
  'letter-spacing',
  'line-height',
  'flex',
  'grid-template-columns',
  'justify-content',
  'align-items',
  'z-index',
  'overflow',
  'box-shadow',
  'border-radius',
  'cursor',
  'text-align',
]

async function snapshot(
  page: Page,
  url: string,
  pane?: string,
): Promise<Map<string, Record<string, string>>> {
  await installDefaultMocks(page)
  await page.goto(url)
  await page.waitForTimeout(3500)
  if (pane) {
    await page
      .locator(`#map-sidebar [data-tab="${pane}"]`)
      .first()
      .click()
      .catch(() => {})
    await page.waitForTimeout(800)
  }
  const entries = await page.evaluate((props) => {
    const out: Array<[string, Record<string, string>]> = []
    const counts = new Map<string, number>()
    const keyOf = (el: Element): string => {
      const parts: string[] = []
      let node: Element | null = el
      while (node && node !== document.body) {
        const cls = [...node.classList]
          .filter((name) => !name.startsWith('data-v'))
          .sort()
          .join('.')
        parts.unshift(
          `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}${cls ? '.' + cls : ''}`,
        )
        node = node.parentElement
      }
      return parts.join('>')
    }
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.maplibregl-canvas-container, canvas, svg')) continue
      const base = keyOf(el)
      const n = (counts.get(base) ?? 0) + 1
      counts.set(base, n)
      const style = getComputedStyle(el)
      const rec: Record<string, string> = {}
      for (const prop of props) rec[prop] = style.getPropertyValue(prop)
      out.push([`${base}#${n}`, rec])
    }
    return out
  }, PROPS)
  return new Map(entries)
}

for (const [route, pane] of [
  ['/air/'],
  ['/space/'],
  ['/sea/'],
  ['/land/'],
  ['/sdr/'],
  ['/sdr/', 'radio'],
  ['/air/', 'search'],
  ['/air/', 'filter'],
] as Array<[string, string?]>) {
  test(`style parity ${route} ${pane ?? ''}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const staticPage = await browser.newPage({ baseURL: 'http://localhost:4174' })
    const federatedPage = await browser.newPage({ baseURL: 'http://localhost:4173' })
    const [before, after] = await Promise.all([
      snapshot(staticPage, route, pane),
      snapshot(federatedPage, route, pane),
    ])
    const diffs: string[] = []
    for (const [key, rec] of before) {
      const other = after.get(key)
      if (!other) {
        diffs.push(`MISSING in federated: ${key}`)
        continue
      }
      for (const prop of Object.keys(rec))
        if (rec[prop] !== other[prop])
          diffs.push(`${key} :: ${prop}: ${rec[prop]} -> ${other[prop]}`)
    }
    for (const key of after.keys()) if (!before.has(key)) diffs.push(`EXTRA in federated: ${key}`)
    console.log(
      `=== ${route} ${pane ?? ''}: ${before.size} vs ${after.size} elements, ${diffs.length} diffs\n${diffs.slice(0, 40).join('\n')}`,
    )
  })
}
