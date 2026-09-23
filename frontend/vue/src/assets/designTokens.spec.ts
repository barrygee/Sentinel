import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Cross-file design-token invariants that no component test can see.
 *
 * The SENTINEL logo mark's outer ring and its wordmark are one colour — white
 * — but the logo is a standalone SVG whose wordmark is outlined paths, so the
 * ring stroke and the path fill are two separate literals in the same file.
 * Recolour one without the other and it goes red.
 */
describe('design tokens', () => {
  it('keeps the logo mark’s outer ring the same white as the wordmark', () => {
    // Paths resolve from the vitest root (frontend/vue) up to the repo-level
    // frontend/assets — import.meta.url is http-scheme under jsdom, so it
    // can't be used to locate the files.
    const logoSvg = readFileSync(resolve(process.cwd(), '../../frontend/assets/logo.svg'), 'utf8')

    // The mark's ring is the only stroked circle in the logo; the wordmark is
    // the only <path>.
    const logoRingStroke = logoSvg.match(/<circle[^>]*stroke="(#[0-9a-fA-F]{6})"/)?.[1]
    const wordmarkFill = logoSvg.match(/<path[^>]*fill="(#[0-9a-fA-F]{6})"/)?.[1]

    expect(logoRingStroke).toBeDefined()
    expect(wordmarkFill).toBeDefined()
    expect(logoRingStroke?.toLowerCase()).toBe('#ffffff')
    expect(logoRingStroke?.toLowerCase()).toBe(wordmarkFill?.toLowerCase())
  })

  it('keeps the favicon’s ring the same white as the logo mark', () => {
    // The favicon is the same ⊙ mark on a tile; the raster variants
    // (favicon-16/32.png, favicon.ico, apple-touch-icon.png) are generated
    // from this SVG, so guarding the source covers them.
    const faviconSvg = readFileSync(
      resolve(process.cwd(), '../../frontend/assets/favicon.svg'),
      'utf8',
    )

    // The ring is the only stroked circle; the inner dot is filled, not stroked.
    const faviconRingStroke = faviconSvg.match(/<circle[^>]*stroke="(#[0-9a-fA-F]{6})"/)?.[1]

    expect(faviconRingStroke).toBeDefined()
    expect(faviconRingStroke?.toLowerCase()).toBe('#ffffff')
  })
})

/**
 * The semantic theme tokens (frontend/assets/template.css) and their first
 * consumer, the settings panel. Both files are plain CSS, so nothing else in
 * the suite can see them: a renamed token, a light value with no dark default
 * or a colour literal sneaking back into a retrofitted stylesheet all ship
 * silently otherwise. These are the invariants the chrome retrofit rests on.
 */
describe('semantic theme tokens', () => {
  const templateCss = readFileSync(
    resolve(process.cwd(), '../../frontend/assets/template.css'),
    'utf8',
  )
  const settingsPanelCss = readFileSync(
    resolve(process.cwd(), 'src/components/shared/SettingsPanel.css'),
    'utf8',
  )
  const settingsPanelVue = readFileSync(
    resolve(process.cwd(), 'src/components/shared/SettingsPanel.vue'),
    'utf8',
  )

  /** Comments carry example values and prose colours — never treat them as code. */
  function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, '')
  }

  /**
   * Rule bodies keyed by their (whitespace-normalised) selector list. The
   * pattern only matches brace-free bodies, so an `@media` wrapper is stepped
   * over and its inner rules are keyed on their own selectors.
   */
  function ruleBodies(css: string): Map<string, string[]> {
    const bodiesBySelector = new Map<string, string[]>()
    for (const [, selector, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const key = selector.replace(/\s+/g, ' ').trim()
      const existing = bodiesBySelector.get(key)
      if (existing) existing.push(body)
      else bodiesBySelector.set(key, [body])
    }
    return bodiesBySelector
  }

  /** Custom-property names declared by every rule whose selector passes `matches`. */
  function tokensDeclaredBy(css: string, matches: (selector: string) => boolean): Set<string> {
    const declared = new Set<string>()
    for (const [selector, bodies] of ruleBodies(css)) {
      if (!matches(selector)) continue
      for (const body of bodies) {
        for (const [, token] of body.matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(token)
      }
    }
    return declared
  }

  const LIGHT_SELECTOR = ":root[data-theme='light'], .theme-light"

  it('defines every token the settings panel references', () => {
    const declared = new Set([
      ...tokensDeclaredBy(templateCss, () => true),
      ...tokensDeclaredBy(settingsPanelCss, () => true),
    ])

    const referenced = [...stripComments(settingsPanelCss).matchAll(/var\((--[a-z0-9-]+)/g)].map(
      (match) => match[1] as string,
    )

    // `--ba-*` are set inline on the base atoms by the components that render
    // them, so they are deliberately absent from both stylesheets.
    const undefinedTokens = referenced.filter(
      (token) => !token.startsWith('--ba-') && !declared.has(token),
    )

    expect(referenced.length).toBeGreaterThan(0)
    expect([...new Set(undefinedTokens)]).toEqual([])
  })

  it('gives every light-theme token a dark default to fall back to', () => {
    const darkTokens = tokensDeclaredBy(templateCss, (selector) => selector === ':root')
    const lightTokens = tokensDeclaredBy(templateCss, (selector) => selector === LIGHT_SELECTOR)

    expect(lightTokens.size).toBeGreaterThan(0)
    // A light-only token would resolve to nothing in the dark theme — the
    // declaration that consumes it silently drops.
    expect([...lightTokens].filter((token) => !darkTokens.has(token))).toEqual([])
  })

  it('scopes the light palette to both the themed root and an always-light island', () => {
    // The settings panel is light in BOTH themes, which only works while the
    // light values are also reachable through the `.theme-light` class the
    // panel carries.
    expect(ruleBodies(templateCss).has(LIGHT_SELECTOR)).toBe(true)
    expect(settingsPanelVue).toContain('class="theme-light"')
  })

  it('leaves no colour literals in the retrofitted settings panel stylesheet', () => {
    // Every colour must come through the token layer, or the panel stops
    // tracking the palette the moment a token's value changes.
    const literals = stripComments(settingsPanelCss).match(/#[0-9a-f]{3,8}\b|rgba?\(\s*[0-9]/gi)

    expect(literals ?? []).toEqual([])
  })
})
