import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { waitForShellHydration } from './support/hydrationGate'
import { installDefaultMocks } from './support/mockApi'
import { clearPersistedState } from './support/seedStore'

/**
 * The Settings JSON editors (Application Config and each section's data file)
 * are Monaco, loaded on first EDIT: line numbers, Tab indenting, FORMAT, and
 * Escape staying inside the editor instead of closing Settings.
 */

const CONFIG = { app: { connectivityMode: 'online' }, air: { enabled: true } }
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openConfigEditor(page: Page) {
  await page.route('**/api/settings/config/preview', (route) => route.fulfill({ json: CONFIG }))
  await page.goto('/settings/app')
  await waitForShellHydration(page)
  const card = page.locator('.settings-config-wrap').first()
  await card.getByRole('button', { name: 'EDIT', exact: true }).click()
  const editor = card.locator('.json-code-editor .monaco-editor')
  await expect(editor).toBeVisible({ timeout: 20_000 })
  return { card, editor }
}

/** The editor's text as Monaco renders it, one entry per visible line. */
async function visibleLines(card: ReturnType<Page['locator']>): Promise<string[]> {
  const lines = card.locator('.view-lines .view-line')
  const tops = await lines.evaluateAll((elements) =>
    elements
      .map((element) => ({
        top: parseFloat((element as HTMLElement).style.top),
        text: (element.textContent ?? '').replace(/\u00a0/g, ' '),
      }))
      .sort((first, second) => first.top - second.top)
      .map((line) => line.text),
  )
  return tops
}

test.describe('Settings JSON editor', () => {
  test.beforeEach(async ({ page }) => {
    await clearPersistedState(page)
    await installDefaultMocks(page)
  })

  test('opens the config in Monaco with line numbers and the accessible name', async ({ page }) => {
    const { card } = await openConfigEditor(page)
    await expect(card.locator('.line-numbers').first()).toHaveText('1')
    await expect(
      card.getByRole('textbox', { name: 'Editable app configuration JSON' }),
    ).toHaveCount(1)
    expect((await visibleLines(card))[1]).toBe('  "app": {')
    await expect(card.getByRole('button', { name: 'FORMAT', exact: true })).toBeVisible()
  })

  test('opens folded to its top-level sections, each of which unfolds', async ({ page }) => {
    const { card } = await openConfigEditor(page)
    // Every section is one line until opened: only its first and last line show.
    await expect
      .poll(async () => (await visibleLines(card)).map((line) => line.trim()))
      .toEqual(['{', '"app": {', '},', '"air": {', '}', '}'])
    // The fold arrows only show while the mouse is over the editor.
    await card.locator('.view-lines').hover()
    await card.locator('.codicon-folding-collapsed').first().click()
    await expect
      .poll(async () => (await visibleLines(card)).map((line) => line.trim()))
      .toContain('"connectivityMode": "online"')
  })

  /** Puts the caret at the start of the first line. */
  async function caretAtStart(card: ReturnType<Page['locator']>, page: Page) {
    await card
      .locator('.view-lines .view-line')
      .first()
      .click({ position: { x: 1, y: 5 } })
    await page.keyboard.press('Home')
  }

  test('Tab indents, and FORMAT puts the indenting back', async ({ page }) => {
    const { card } = await openConfigEditor(page)
    await caretAtStart(card, page)
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await visibleLines(card))[0]).toBe('  {')
    await card.getByRole('button', { name: 'FORMAT', exact: true }).click()
    await expect.poll(async () => (await visibleLines(card))[0]).toBe('{')
  })

  test('Escape inside the editor leaves Settings open', async ({ page }) => {
    const { card } = await openConfigEditor(page)
    await caretAtStart(card, page)
    await page.keyboard.press('Escape')
    await expect(page.locator('#settings-panel.settings-panel-visible')).toBeVisible()
    await expect(card.locator('.json-code-editor .monaco-editor')).toBeVisible()
  })

  test('moving over, hovering and searching the editor raises no page errors', async ({ page }) => {
    // Regression: services Monaco's JSON support registered late threw
    // "depends on UNKNOWN service ICodeLensCache" on every mouse move.
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const { card } = await openConfigEditor(page)
    // The failure needed a second editor: the first one sets Monaco's services
    // up before the JSON support finishes loading, and an editor opened after it
    // used features whose services were never set up. Close and reopen.
    await page.waitForTimeout(1500)
    await card.getByRole('button', { name: 'HIDE', exact: true }).click()
    await card.getByRole('button', { name: 'EDIT', exact: true }).click()
    await expect(card.locator('.json-code-editor .monaco-editor')).toBeVisible()
    const box = (await card.locator('.view-lines').boundingBox())!
    for (let step = 0; step <= 10; step++)
      await page.mouse.move(box.x + 20 + step * 30, box.y + 10 + step * 12)
    // Hover a JSON error long enough for its hover to open.
    await caretAtStart(card, page)
    await page.keyboard.press('End')
    await page.keyboard.insertText(' oops')
    await page.mouse.move(box.x + 30, box.y + 12)
    await page.waitForTimeout(1200)
    await page.keyboard.press('ControlOrMeta+F')
    await page.keyboard.insertText('app')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    expect(pageErrors).toEqual([])
  })

  test('the open editor has no WCAG 2.2 AA violations', async ({ page }) => {
    await openConfigEditor(page)
    const results = await new AxeBuilder({ page })
      .withTags(WCAG_AA_TAGS)
      .include('.json-code-editor')
      .analyze()
    expect(results.violations).toEqual([])
  })
})
