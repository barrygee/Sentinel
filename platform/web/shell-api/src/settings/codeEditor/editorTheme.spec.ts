import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SENTINEL_EDITOR_THEME,
  contrastRatio,
  defineSentinelTheme,
  resolveCssColour,
  withReadableContrast,
} from './editorTheme'
import type { MonacoApi } from './loadMonaco'

/**
 * jsdom doesn't resolve CSS variables, so these specs stand in for the
 * browser: each CSS colour the theme asks for computes to the `rgb()` string
 * given here.
 */
function computeColoursAs(computedByCss: Record<string, string>): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) =>
      ({
        color: computedByCss[(element as HTMLElement).style.color] ?? '',
      }) as CSSStyleDeclaration,
  )
}

/**
 * jsdom drops colours it can't parse (any `var()`), so each element the code
 * creates gets a plain style object that keeps the colour exactly as assigned.
 */
function keepAssignedColours(): void {
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = realCreateElement(tagName)
    Object.defineProperty(element, 'style', { value: {}, configurable: true })
    return element
  })
}

function fakeMonaco() {
  const defineTheme = vi.fn()
  return { api: { editor: { defineTheme } } as unknown as MonacoApi, defineTheme }
}

const LIGHT_ISLAND = {
  'var(--surface)': 'rgb(232, 234, 237)',
  'rgba(var(--ink-rgb), 0.85)': 'rgba(16, 19, 29, 0.85)',
  'var(--ink-strong)': 'rgb(22, 25, 29)',
  'rgba(var(--ink-rgb), 0.62)': 'rgba(16, 19, 29, 0.62)',
  'var(--accent-text)': 'rgb(90, 138, 0)',
  'var(--danger)': 'rgb(217, 68, 54)',
  'var(--surface-sunken)': 'rgb(241, 239, 233)',
}

describe('resolveCssColour', () => {
  afterEach(() => vi.restoreAllMocks())

  it('turns what the browser computes into #rrggbbaa, alpha included', () => {
    keepAssignedColours()
    computeColoursAs({ red: 'rgb(255, 0, 0)', faint: 'rgba(16, 19, 29, 0.5)' })
    expect(resolveCssColour(document.body, 'red')).toBe('#ff0000ff')
    expect(resolveCssColour(document.body, 'faint')).toBe('#10131d80')
  })

  it('clamps an over-range channel and reads an unresolvable colour as black', () => {
    keepAssignedColours()
    computeColoursAs({ wild: 'rgb(300, 0, 12)' })
    expect(resolveCssColour(document.body, 'wild')).toBe('#ff000cff')
    expect(resolveCssColour(document.body, 'nothing')).toBe('#000000ff')
  })

  it('measures inside the host (so its CSS variables apply) and leaves nothing behind', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const appended = vi.spyOn(host, 'appendChild')
    resolveCssColour(host, 'red')
    expect(appended).toHaveBeenCalledTimes(1)
    expect(host.childElementCount).toBe(0)
    host.remove()
  })
})

describe('defineSentinelTheme', () => {
  afterEach(() => vi.restoreAllMocks())

  it("defines the theme from the app's tokens on a light surface", () => {
    keepAssignedColours()
    computeColoursAs(LIGHT_ISLAND)
    const { api, defineTheme } = fakeMonaco()
    defineSentinelTheme(api, document.body)
    const [name, theme] = defineTheme.mock.calls[0]!
    expect(name).toBe(SENTINEL_EDITOR_THEME)
    expect(theme.base).toBe('vs')
    expect(theme.inherit).toBe(false)
    expect(theme.colors['editor.background']).toBe('#e8eaedff')
    expect(theme.colors['editor.foreground']).toBe('#10131dd9')
    expect(theme.colors['editorCursor.foreground']).toBe('#16191dff')
    expect(theme.colors['editorError.foreground']).toBe('#d94436ff')
    // Every bracket level is the app's secondary ink, not Monaco's rainbow.
    for (const level of [1, 2, 3, 4, 5, 6])
      expect(theme.colors[`editorBracketHighlight.foreground${level}`]).toBe('#10131d9e')
    // The accent green (#5a8a00, 3.4:1 here) is deepened toward the ink until it reads at AA.
    const numberRule = theme.rules.find((rule: { token: string }) => rule.token === 'number.json')
    expect(numberRule.foreground).not.toBe('5a8a00')
    expect(contrastRatio(`#${numberRule.foreground}`, '#e8eaedff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#5a8a00ff', '#e8eaedff')).toBeLessThan(4.5)
    expect(theme.rules).toContainEqual({ token: 'string.key.json', foreground: '16191d' })
  })

  it("uses Monaco's dark base on a dark surface", () => {
    keepAssignedColours()
    computeColoursAs({ ...LIGHT_ISLAND, 'var(--surface)': 'rgb(20, 22, 28)' })
    const { api, defineTheme } = fakeMonaco()
    defineSentinelTheme(api, document.body)
    expect(defineTheme.mock.calls[0]![1].base).toBe('vs-dark')
  })
})

describe('contrastRatio', () => {
  it('gives the WCAG ratio, whichever colour comes first', () => {
    expect(contrastRatio('#000000ff', '#ffffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffffff', '#000000ff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777ff', '#777777ff')).toBe(1)
    // A known pair: #767676 on white is the classic 4.54:1.
    expect(contrastRatio('#767676ff', '#ffffffff')).toBeCloseTo(4.54, 2)
  })
})

describe('withReadableContrast', () => {
  it('keeps a colour that already reads at AA', () => {
    expect(withReadableContrast('#16191dff', '#e8eaedff', '#000000ff')).toBe('#16191dff')
  })

  it('deepens a light colour toward the other until it reaches 4.5:1, no further', () => {
    const deepened = withReadableContrast('#5a8a00ff', '#e8eaedff', '#16191dff')
    expect(contrastRatio(deepened, '#e8eaedff')).toBeGreaterThanOrEqual(4.5)
    // It stops at the first step that reads, short of the ink itself.
    expect(deepened).not.toBe('#16191dff')
  })

  it('falls back to the other colour when no mix reaches AA', () => {
    expect(withReadableContrast('#eeeeeeff', '#ffffffff', '#ddddddff')).toBe('#ddddddff')
  })
})
