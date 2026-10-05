import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The pre-paint script inlined in `index.html` publishes the palettes as
 * `<html data-theme>` / `<html data-map-theme>` before Vue boots, so the first
 * paint already shows the right basemap. It runs outside the app (no store, no
 * bundle), so it is extracted from the HTML and run here on its own.
 */
function prePaintScript(): string {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!)
  const script = scripts.find((body) => body.includes('sentinel_map_theme'))
  if (!script) throw new Error('no pre-paint script reads sentinel_map_theme')
  return script
}

function runPrePaint(): void {
  new Function(prePaintScript())()
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.mapTheme
})

describe('index.html pre-paint script', () => {
  it.each([
    ['"light"', 'light'],
    ['light', 'light'],
    ['"dark"', 'dark'],
    // COLOUR was renamed LIGHT: an install that chose it must not flash dark.
    ['"colour"', 'light'],
    ['colour', 'light'],
    ['"sepia"', 'dark'],
  ])('publishes a stored %s as the %s map', (stored, expected) => {
    localStorage.setItem('sentinel_map_theme', stored)
    runPrePaint()
    expect(document.documentElement.dataset.mapTheme).toBe(expected)
  })

  it('defaults to the dark map with nothing stored', () => {
    runPrePaint()
    expect(document.documentElement.dataset.mapTheme).toBe('dark')
  })

  it('always publishes the dark interface', () => {
    localStorage.setItem('sentinel_map_theme', '"light"')
    runPrePaint()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
