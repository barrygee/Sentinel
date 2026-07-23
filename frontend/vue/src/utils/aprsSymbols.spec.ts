import { describe, it, expect } from 'vitest'
import { aprsSymbolIcon, aprsSymbolSvg, FALLBACK_SYMBOL } from './aprsSymbols'

describe('aprsSymbolIcon', () => {
  it('decodes a known two-char symbol by its symbol char', () => {
    expect(aprsSymbolIcon('/>').label).toBe('Car')
    expect(aprsSymbolIcon('/_').label).toBe('Weather station')
    expect(aprsSymbolIcon('/#').label).toBe('Digipeater')
  })

  it('decodes overlay symbols (non-slash table char) by the same symbol char', () => {
    // e.g. a numbered/overlaid digipeater "1#" still resolves to the digi icon.
    expect(aprsSymbolIcon('1#').label).toBe('Digipeater')
  })

  it('accepts a bare single-char symbol', () => {
    expect(aprsSymbolIcon('>').label).toBe('Car')
  })

  it('falls back to a generic beacon for an unknown symbol char', () => {
    expect(aprsSymbolIcon('/ ')).toBe(FALLBACK_SYMBOL)
    expect(aprsSymbolIcon('/€')).toBe(FALLBACK_SYMBOL)
  })

  it('falls back for null/empty input', () => {
    expect(aprsSymbolIcon(null)).toBe(FALLBACK_SYMBOL)
    expect(aprsSymbolIcon(undefined)).toBe(FALLBACK_SYMBOL)
    expect(aprsSymbolIcon('')).toBe(FALLBACK_SYMBOL)
  })
})

describe('aprsSymbolSvg', () => {
  it('builds a self-contained SVG with the decoded label and default size', () => {
    const svg = aprsSymbolSvg('/>')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="Car"')
    expect(svg).toContain('width="20"')
    expect(svg).toContain('style="color:currentColor"')
  })

  it('applies a custom size and colour', () => {
    const svg = aprsSymbolSvg('/#', { size: 18, color: '#c8ff00' })
    expect(svg).toContain('width="18"')
    expect(svg).toContain('height="18"')
    expect(svg).toContain('style="color:#c8ff00"')
    expect(svg).toContain('aria-label="Digipeater"')
  })

  it('renders the fallback beacon for an unknown symbol', () => {
    const svg = aprsSymbolSvg(null)
    expect(svg).toContain('aria-label="Station"')
    expect(svg).toContain(FALLBACK_SYMBOL.paths)
  })
})
