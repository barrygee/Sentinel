import type { MonacoApi } from '@sentinel/shell-api/settings/codeEditor/loadMonaco'

/** The one theme name Sentinel registers; redefined from the page's colours each time an editor opens. */
export const SENTINEL_EDITOR_THEME = 'sentinel'

/**
 * Resolves a CSS colour (any syntax, `var()` included) to `#rrggbbaa` as the
 * browser computes it inside `host`, which is the form Monaco's themes take.
 * Monaco can't read CSS variables itself, so this is how the editor follows
 * the app's palette instead of its own.
 */
export function resolveCssColour(host: HTMLElement, cssColour: string): string {
  const probe = document.createElement('span')
  probe.style.color = cssColour
  probe.style.display = 'none'
  host.appendChild(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const channels = computed.match(/[\d.]+/g)?.map(Number) ?? []
  const [red = 0, green = 0, blue = 0, alpha = 1] = channels
  const toHex = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}${toHex(alpha * 255)}`
}

/** Monaco token rules want `rrggbb`, without the `#` or alpha. */
function tokenColour(hexWithAlpha: string): string {
  return hexWithAlpha.slice(1, 7)
}

/**
 * Defines the `sentinel` editor theme from the colour tokens in force at
 * `host` (Settings' light island, or the dark app), so the editor looks like
 * the field it replaced: the field's grey, the app's ink, accent-coloured
 * values and the app's danger red for errors.
 */
export function defineSentinelTheme(monaco: MonacoApi, host: HTMLElement): void {
  const colour = (cssColour: string): string => resolveCssColour(host, cssColour)
  const background = colour('var(--surface)')
  const ink = colour('rgba(var(--ink-rgb), 0.85)')
  const inkStrong = colour('var(--ink-strong)')
  const inkSecondary = colour('rgba(var(--ink-rgb), 0.62)')
  // The accent green is too light for text on the editor's grey (3.4:1 on the
  // light island): darken it toward the ink until it reads at AA.
  const accentText = withReadableContrast(colour('var(--accent-text)'), background, inkStrong)
  const danger = colour('var(--danger)')
  const isDark = luminance(background) < 0.18

  monaco.editor.defineTheme(SENTINEL_EDITOR_THEME, {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: false,
    rules: [
      { token: '', foreground: tokenColour(ink) },
      { token: 'string.key.json', foreground: tokenColour(inkStrong) },
      { token: 'string.value.json', foreground: tokenColour(ink) },
      { token: 'number.json', foreground: tokenColour(accentText) },
      { token: 'keyword.json', foreground: tokenColour(accentText) },
      { token: 'delimiter', foreground: tokenColour(inkSecondary) },
      { token: 'delimiter.bracket.json', foreground: tokenColour(inkSecondary) },
      { token: 'delimiter.array.json', foreground: tokenColour(inkSecondary) },
    ],
    colors: {
      'editor.background': background,
      'editor.foreground': ink,
      'editorCursor.foreground': inkStrong,
      'editorLineNumber.foreground': inkSecondary,
      'editorLineNumber.activeForeground': inkStrong,
      'editor.lineHighlightBackground': colour('rgba(var(--ink-rgb), 0.04)'),
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': colour('rgba(var(--ink-rgb), 0.14)'),
      'editor.inactiveSelectionBackground': colour('rgba(var(--ink-rgb), 0.08)'),
      // Brackets in the app's ink: Monaco otherwise paints nesting levels (and a
      // bracket it can't pair) in its own blue, gold and red.
      ...Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map((level) => [
          `editorBracketHighlight.foreground${level}`,
          inkSecondary,
        ]),
      ),
      'editorBracketHighlight.unexpectedBracket.foreground': inkSecondary,
      'editorBracketMatch.background': colour('rgba(var(--ink-rgb), 0.08)'),
      'editorBracketMatch.border': accentText,
      'editorIndentGuide.background1': colour('rgba(var(--ink-rgb), 0.08)'),
      'editorIndentGuide.activeBackground1': colour('rgba(var(--ink-rgb), 0.2)'),
      'editorGutter.background': background,
      'editorError.foreground': danger,
      'editorWarning.foreground': danger,
      'editorWidget.background': colour('var(--surface-sunken)'),
      'editorWidget.foreground': ink,
      'editorWidget.border': colour('rgba(var(--ink-rgb), 0.12)'),
      'editorHoverWidget.background': colour('var(--surface-sunken)'),
      'editorHoverWidget.border': colour('rgba(var(--ink-rgb), 0.12)'),
      'input.background': background,
      'input.foreground': ink,
      focusBorder: '#00000000',
      'scrollbar.shadow': '#00000000',
      'scrollbarSlider.background': colour('rgba(var(--ink-rgb), 0.15)'),
      'scrollbarSlider.hoverBackground': colour('rgba(var(--ink-rgb), 0.25)'),
      'scrollbarSlider.activeBackground': colour('rgba(var(--ink-rgb), 0.3)'),
      'editorOverviewRuler.border': '#00000000',
    },
  })
}

/** WCAG relative luminance (0–1) of a `#rrggbb…` colour; also picks Monaco's light or dark base. */
function luminance(hexColour: string): number {
  const channelWeights = [0.2126, 0.7152, 0.0722]
  return channelWeights.reduce((total, weight, channelIndex) => {
    const value = parseInt(hexColour.slice(1 + channelIndex * 2, 3 + channelIndex * 2), 16) / 255
    const linear = value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    return total + weight * linear
  }, 0)
}

/** WCAG contrast ratio between two `#rrggbb…` colours (alpha ignored). */
export function contrastRatio(firstColour: string, secondColour: string): number {
  const [lighter, darker] = [luminance(firstColour), luminance(secondColour)].sort(
    (first, second) => second - first,
  ) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * `colour` mixed toward `towardColour` in 10% steps until it reaches the WCAG AA
 * text contrast (4.5:1) on `background` — the same hue, just deep enough to read.
 */
export function withReadableContrast(
  colour: string,
  background: string,
  towardColour: string,
): string {
  for (let mixPercent = 0; mixPercent <= 100; mixPercent += 10) {
    const mixed = mixColours(colour, towardColour, mixPercent / 100)
    if (contrastRatio(mixed, background) >= 4.5) return mixed
  }
  return towardColour
}

/** `#rrggbbaa` that is `amount` (0–1) of the way from `fromColour` to `toColour`, fully opaque. */
function mixColours(fromColour: string, toColour: string, amount: number): string {
  const channel = (hexColour: string, channelIndex: number): number =>
    parseInt(hexColour.slice(1 + channelIndex * 2, 3 + channelIndex * 2), 16)
  const mixedChannels = [0, 1, 2].map((channelIndex) =>
    Math.round(
      channel(fromColour, channelIndex) * (1 - amount) + channel(toColour, channelIndex) * amount,
    )
      .toString(16)
      .padStart(2, '0'),
  )
  return `#${mixedChannels.join('')}ff`
}
