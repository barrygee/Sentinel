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
 * The two basemap palettes are one map with two paints: same sources, same
 * layers in the same order, same ids, same filters. That is what makes a
 * palette change a repaint rather than a different map, and what lets every
 * layer-id-driven control (`RoadsToggleControl`, `NamesToggleControl`, the
 * terrain contours) work on both. The light pair is generated from the dark one
 * by `frontend/scripts/build_light_basemap.py`; this is what fails when someone
 * hand-edits the output instead of re-running the script.
 */
interface StyleLayer {
  id: string
  type?: string
  filter?: unknown
  layout?: { visibility?: string } & Record<string, unknown>
  paint?: Record<string, unknown>
}

interface Style {
  sources: Record<string, unknown>
  layers: StyleLayer[]
  metadata?: Record<string, string>
}

function readStyle(styleName: string): Style {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `../../frontend/assets/${styleName}.json`), 'utf8'),
  ) as Style
}

function layerById(styleName: string, layerId: string): StyleLayer | undefined {
  return readStyle(styleName).layers.find((layer) => layer.id === layerId)
}

const STYLE_PAIRS = [
  ['offline', 'fiord', 'osm-light'],
  ['online', 'fiord-online', 'osm-light-online'],
] as const

describe('basemap palettes', () => {
  it.each(STYLE_PAIRS)(
    'keeps the %s light build on the dark build’s geometry',
    (_kind, dark, light) => {
      const darkStyle = readStyle(dark)
      const lightStyle = readStyle(light)
      expect(lightStyle.sources).toEqual(darkStyle.sources)
      expect(lightStyle.layers.map((layer) => layer.id)).toEqual(
        darkStyle.layers.map((layer) => layer.id),
      )
      // Everything but paint matches — except the one layer the light map hides.
      const withoutPaint = ({ paint: _paint, ...rest }: StyleLayer) => rest
      lightStyle.layers.forEach((layer, index) => {
        const darkLayer = darkStyle.layers[index] as StyleLayer
        if (layer.id === 'park') {
          expect(layer.filter).toEqual(darkLayer.filter)
          return
        }
        expect(withoutPaint(layer), layer.id).toEqual(withoutPaint(darkLayer))
      })
    },
  )

  it.each(STYLE_PAIRS)(
    'recolours the %s light build rather than copying the dark one',
    (_kind, dark, light) => {
      expect(JSON.stringify(readStyle(light).layers)).not.toBe(
        JSON.stringify(readStyle(dark).layers),
      )
      // The generator stamps where the file came from; a hand-written style
      // would not carry it.
      expect(readStyle(light).metadata?.['sentinel:provenance']).toContain('build_light_basemap.py')
    },
  )
})

/**
 * Marine protected areas reach far offshore, so a park fill drawn above water
 * paints straight-edged slabs across the sea. Every basemap must draw its park
 * layers beneath `water`, which then covers their offshore parts.
 */
describe('basemap park layers beneath water', () => {
  const PARK_LAYER_IDS = ['park', 'park_outline', 'national_park', 'national_park_outline']

  it.each(['fiord', 'fiord-online', 'osm-light', 'osm-light-online'])(
    'draws every %s park layer before water',
    (styleName) => {
      const ids = readStyle(styleName).layers.map((layer) => layer.id)
      const waterIndex = ids.indexOf('water')
      const presentParkIds = PARK_LAYER_IDS.filter((layerId) => ids.includes(layerId))

      expect(waterIndex).toBeGreaterThan(-1)
      // Online builds have no national park source; they still carry `park`.
      expect(presentParkIds).toContain('park')
      for (const layerId of presentParkIds) {
        expect(ids.indexOf(layerId), layerId).toBeLessThan(waterIndex)
      }
    },
  )
})

/**
 * The light map hides only the park fill: the park layer is every OSM park AND
 * every protected area, so a fill would paint legal boundaries (Northeast
 * Greenland's ice cap, offshore conservation zones) as parkland. Woodland and
 * the national parks stay green, as on the OpenStreetMap map. The dark palette
 * is untouched.
 */
describe('light basemap green areas', () => {
  it.each(['osm-light', 'osm-light-online'])('hides the %s park fill', (styleName) => {
    expect(layerById(styleName, 'park')?.layout?.visibility).toBe('none')
  })

  it.each([
    ['osm-light', 'landcover_wood'],
    ['osm-light-online', 'landcover_wood'],
    ['osm-light', 'national_park'],
    ['osm-light', 'national_park_outline'],
  ])('draws the %s %s layer', (styleName, layerId) => {
    const layer = layerById(styleName, layerId)
    expect(layer).toBeDefined()
    expect(layer?.layout?.visibility).not.toBe('none')
  })

  it.each(['osm-light', 'osm-light-online'])(
    'keeps the %s park outline, faded in from z6 to z8',
    (styleName) => {
      const outline = layerById(styleName, 'park_outline')
      expect(outline?.layout?.visibility).not.toBe('none')
      expect(outline?.paint?.['line-opacity']).toEqual([
        'interpolate',
        ['linear'],
        ['zoom'],
        6,
        0,
        8,
        1,
      ])
    },
  )

  it.each([
    ['fiord', 'landcover_wood'],
    ['fiord', 'park'],
    ['fiord', 'national_park'],
  ])('leaves the dark %s %s fill drawn', (styleName, layerId) => {
    expect(layerById(styleName, layerId)?.layout?.visibility).not.toBe('none')
  })
})

/**
 * LIGHT is OpenStreetMap's default style (openstreetmap-carto) in colour:
 * cream land, pale blue water, green woodland, and roads coloured by class.
 */
describe('light basemap palette', () => {
  it.each([
    ['osm-light', 'earth', 'fill-color', '#f2efe9'],
    ['osm-light-online', 'background', 'background-color', '#f2efe9'],
    ['osm-light', 'water', 'fill-color', '#aad3df'],
    ['osm-light-online', 'water', 'fill-color', '#aad3df'],
    ['osm-light', 'landcover_wood', 'fill-color', '#add19e'],
    ['osm-light', 'highway_motorway_inner', 'line-color', '#e892a2'],
    ['osm-light', 'highway_minor', 'line-color', '#ffffff'],
    ['osm-light', 'boundary_country_z5-', 'line-color', '#8d618b'],
  ])('paints %s %s %s as %s', (styleName, layerId, paintKey, colour) => {
    expect(layerById(styleName, layerId)?.paint?.[paintKey]).toBe(colour)
  })

  it('keeps the offline background as water, hiding the seam at 180°', () => {
    expect(layerById('osm-light', 'background')?.paint?.['background-color']).toBe('#aad3df')
  })

  it.each(['osm-light', 'osm-light-online'])(
    'colours %s major roads by class on either tile schema',
    (styleName) => {
      const fill = layerById(styleName, 'highway_major_inner')?.paint?.['line-color'] as unknown[]
      // Protomaps tiles carry `kind_detail`, OpenMapTiles ones `class`.
      expect(fill.slice(0, 2)).toEqual([
        'match',
        ['coalesce', ['get', 'kind_detail'], ['get', 'class']],
      ])
      expect(fill.slice(2)).toEqual([
        'trunk',
        '#f9b29c',
        'primary',
        '#fcd6a4',
        'secondary',
        '#f7fabf',
        'tertiary',
        '#ffffff',
        '#fcd6a4',
      ])
    },
  )
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
    // settings panel is light in both themes, and the SDR page is pinned dark
    // (its spectrum trace and waterfall are an instrument view). Both only
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
    // The SDR page pins the dark island — the class may sit alongside others.
    expect(readFileSync(resolve(process.cwd(), 'src/components/sdr/SdrView.vue'), 'utf8')).toMatch(
      /class="[^"]*\btheme-dark\b/,
    )
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

/**
 * Overlay text drawn straight onto the basemap (airport and military-base
 * labels) takes its ink from these tokens, so it can follow the BASEMAP
 * palette: white on the dimmed dark map, near-black with a white halo on the
 * undimmed light (OpenStreetMap-coloured) one, where white would vanish.
 */
describe('map overlay ink tokens', () => {
  const templateCss = readFileSync(
    resolve(process.cwd(), '../../frontend/assets/template.css'),
    'utf8',
  )

  /** The `--map-overlay-*` declarations across every rule with exactly this selector. */
  function overlayTokens(selector: string): Record<string, string> {
    const escaped = selector.replace(/[[\]()'.*+?^$|]/g, '\\$&')
    const rules = [...templateCss.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    expect(rules.length, `no "${selector}" rule`).toBeGreaterThan(0)
    const tokens: Record<string, string> = {}
    for (const rule of rules) {
      for (const [, name, value] of rule[1]!.matchAll(/(--map-overlay-[\w-]+)\s*:\s*([^;]+);/g)) {
        tokens[name!] = value!.trim()
      }
    }
    return tokens
  }

  it('keeps the dark map exactly as it was: white ink, no halo, lime accent', () => {
    expect(overlayTokens(':root')).toEqual({
      '--map-overlay-ink': '#ffffff',
      '--map-overlay-halo': 'none',
      '--map-overlay-accent': '#c8ff00',
    })
  })

  it('re-inks every overlay token for the light map', () => {
    const light = overlayTokens(":root[data-map-theme='light']")
    const dark = overlayTokens(':root')
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort())
    for (const name of Object.keys(dark)) {
      expect(light[name], name).not.toBe(dark[name])
    }
    expect(light['--map-overlay-halo']).toContain('#ffffff')
  })
})
