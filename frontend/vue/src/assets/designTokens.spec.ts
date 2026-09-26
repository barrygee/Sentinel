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
/**
 * The three basemap palettes are one map with three paints: same sources, same
 * layers in the same order, same ids — bar the low-zoom land cover the colour
 * build adds, tagged `sentinel:colour-only`. That is what makes a palette change a
 * repaint rather than a different map, and what lets every layer-id-driven
 * control (`RoadsToggleControl`, `NamesToggleControl`, the terrain contours)
 * work across all three. The colour pair is generated from the light one by
 * `frontend/scripts/build_colour_basemap.py`; this is what fails when someone
 * hand-edits the output instead of re-running the script.
 */
describe('basemap palettes', () => {
  interface StyleLayer {
    id: string
    metadata?: Record<string, unknown>
  }

  function styleLayers(styleName: string): StyleLayer[] {
    const style = JSON.parse(
      readFileSync(resolve(process.cwd(), `../../frontend/assets/${styleName}.json`), 'utf8'),
    )
    return style.layers
  }

  /** Every layer id, minus the low-zoom land cover only the colour build adds. */
  function sharedLayerIds(styleName: string): string[] {
    return styleLayers(styleName)
      .filter((layer) => !layer.metadata?.['sentinel:colour-only'])
      .map((layer) => layer.id)
  }

  it.each([
    ['offline', 'positron', 'cartographic'],
    ['online', 'positron-online', 'cartographic-online'],
  ])('keeps the %s colour build on the light build’s geometry', (_kind, light, colour) => {
    expect(sharedLayerIds(colour)).toEqual(sharedLayerIds(light))
  })

  it.each([
    ['offline', 'positron', 'cartographic'],
    ['online', 'positron-online', 'cartographic-online'],
  ])('adds %s land cover to the colour build only', (_kind, light, colour) => {
    const colourOnly = (styleName: string) =>
      styleLayers(styleName).filter((layer) => layer.metadata?.['sentinel:colour-only'])
    expect(colourOnly(colour).length).toBeGreaterThan(0)
    expect(colourOnly(light)).toEqual([])
  })

  it('recolours the colour build rather than copying the light one', () => {
    const colour = readFileSync(
      resolve(process.cwd(), '../../frontend/assets/cartographic.json'),
      'utf8',
    )
    const light = readFileSync(
      resolve(process.cwd(), '../../frontend/assets/positron.json'),
      'utf8',
    )
    expect(colour).not.toBe(light)
    // The generator stamps where the file came from; a hand-written style
    // would not carry it.
    expect(JSON.parse(colour).metadata['sentinel:provenance']).toContain('build_colour_basemap.py')
  })
})

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

  /** Custom-property declarations ({name: value}) from rules passing `matches`. */
  function declarationsFrom(
    css: string,
    matches: (selector: string) => boolean,
    bodyMatches: (body: string) => boolean = () => true,
  ): Map<string, string> {
    const declarations = new Map<string, string>()
    for (const [selector, bodies] of ruleBodies(css)) {
      if (!matches(selector)) continue
      for (const body of bodies) {
        if (!bodyMatches(body)) continue
        for (const [, token, value] of body.matchAll(/(--[a-z0-9-]+)\s*:([^;]*)/g)) {
          declarations.set(token as string, (value as string).trim())
        }
      }
    }
    return declarations
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

  /** Whether a rule's selector list contains `target` as one of its selectors. */
  function selectorListHas(selectorList: string, target: string): boolean {
    return selectorList.split(',').some((selector) => selector.trim() === target)
  }

  /** The palette block for a scope: the rule declaring the ink hue against it. */
  function paletteDeclarations(scopeSelector: string): Map<string, string> {
    return declarationsFrom(
      templateCss,
      (selector) => selectorListHas(selector, scopeSelector),
      (body) => body.includes('--ink-rgb:'),
    )
  }

  const DARK_SELECTORS = [':root', '.theme-dark']
  const LIGHT_SELECTORS = [":root[data-theme='light']", '.theme-light']

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
    const darkTokens = tokensDeclaredBy(templateCss, (selector) =>
      selectorListHas(selector, ':root'),
    )
    const lightTokens = tokensDeclaredBy(templateCss, (selector) =>
      selectorListHas(selector, '.theme-light'),
    )

    expect(lightTokens.size).toBeGreaterThan(0)
    // A light-only token would resolve to nothing in the dark theme — the
    // declaration that consumes it silently drops.
    expect([...lightTokens].filter((token) => !darkTokens.has(token))).toEqual([])
  })

  it('re-declares every derived token in the light palette', () => {
    // A custom property that references another one is substituted where it is
    // DECLARED, and the substituted value inherits. So a light block that
    // overrides `--ink-rgb` alone leaves `--ink` frozen at the dark palette's
    // white — the settings panel goes dark-on-dark and nothing else notices.
    // Scoped to the palette blocks — the ones declaring the ink hue — so the
    // legacy `:root` token block above them is not swept in.
    const darkDeclarations = paletteDeclarations(':root')
    const lightDeclarations = paletteDeclarations('.theme-light')

    const derived = [...darkDeclarations].filter(([, value]) => value.includes('var('))
    expect(derived.length).toBeGreaterThan(0)

    const frozen = derived
      .filter(([token]) => !lightDeclarations.has(token))
      .map(([token]) => token)
    expect(frozen, 'derived tokens missing from the light palette').toEqual([])
  })

  it('scopes each palette to both the themed root and a pinned island', () => {
    // An island class pins its palette regardless of `<html data-theme>`: the
    // settings panel is light in both themes, and the map sidebar is pinned
    // dark until the domain panes inside it move onto the tokens. Both only
    // work while the values are reachable through the class as well as the
    // root selector.
    const selectorLists = [...ruleBodies(templateCss).keys()]

    // Each palette must be declared ONCE against both of its selectors — a
    // block carrying only the root selector would leave the island class with
    // nothing to pin, and vice versa.
    for (const [rootSelector, islandSelector] of [DARK_SELECTORS, LIGHT_SELECTORS]) {
      const block = selectorLists.find(
        (selector) =>
          selectorListHas(selector, rootSelector as string) &&
          selectorListHas(selector, islandSelector as string),
      )
      expect(
        block,
        `no palette block declares both ${rootSelector} and ${islandSelector}`,
      ).toBeDefined()
    }

    expect(settingsPanelVue).toContain('class="theme-light"')
    // The sidebar pins the panes whose contents have not moved onto the tokens
    // yet (passes, playback, radio) — the class may sit alongside others.
    expect(
      readFileSync(resolve(process.cwd(), 'src/components/shared/MapSidebar.vue'), 'utf8'),
    ).toMatch(/class="[^"]*\btheme-dark\b/)
  })

  it('leaves no colour literals in the retrofitted settings panel stylesheet', () => {
    // Every colour must come through the token layer, or the panel stops
    // tracking the palette the moment a token's value changes.
    //
    // The exception is the panel's own palette block: it pins the greys it was
    // designed against (`--canvas-rgb`, `--surface`…) so the app's light stack
    // can be restacked around it without moving this island. Those lines ARE
    // token declarations, so they are allowed to carry values; anything else
    // must reference a token.
    const literals = stripComments(settingsPanelCss)
      .split('\n')
      .filter((line) => !/^\s*--[a-z0-9-]+\s*:/.test(line))
      .join('\n')
      .match(/#[0-9a-f]{3,8}\b|rgba?\(\s*[0-9]/gi)

    expect(literals ?? []).toEqual([])
  })
})
