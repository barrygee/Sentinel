import { describe, it, expect } from 'vitest'
import { baseHeadingSlug, createHeadingSlugger } from './headingSlug'

describe('baseHeadingSlug', () => {
  it('lower-cases and turns spaces into hyphens', () => {
    expect(baseHeadingSlug('Where Recordings Are Saved')).toBe('where-recordings-are-saved')
  })

  it('drops punctuation as GitHub does', () => {
    expect(baseHeadingSlug("What's new? (v2.0)")).toBe('whats-new-v20')
  })

  it('keeps hyphens, underscores and digits', () => {
    expect(baseHeadingSlug('rtl_tcp and ADS-B 1090')).toBe('rtl_tcp-and-ads-b-1090')
  })

  it('keeps letters outside ASCII', () => {
    expect(baseHeadingSlug('Café Müller')).toBe('café-müller')
  })

  it('turns each space into its own hyphen, so a dropped symbol leaves a double hyphen', () => {
    expect(baseHeadingSlug('Cats & Dogs')).toBe('cats--dogs')
  })

  it('trims surrounding whitespace', () => {
    expect(baseHeadingSlug('  Padded  ')).toBe('padded')
  })

  it('returns an empty string for text with nothing to keep', () => {
    expect(baseHeadingSlug('!!!')).toBe('')
    expect(baseHeadingSlug('')).toBe('')
  })
})

describe('createHeadingSlugger', () => {
  it('returns the plain slug for a heading seen once', () => {
    const slugify = createHeadingSlugger()
    expect(slugify('Install')).toBe('install')
  })

  it('numbers repeated headings -1, -2 in document order', () => {
    const slugify = createHeadingSlugger()
    expect([slugify('Setup'), slugify('Setup'), slugify('Setup')]).toEqual([
      'setup',
      'setup-1',
      'setup-2',
    ])
  })

  it('numbers repeats of different headings independently', () => {
    const slugify = createHeadingSlugger()
    expect([slugify('A b'), slugify('C d'), slugify('A b'), slugify('C d')]).toEqual([
      'a-b',
      'c-d',
      'a-b-1',
      'c-d-1',
    ])
  })

  it('treats headings that differ only in case or punctuation as repeats', () => {
    const slugify = createHeadingSlugger()
    expect([slugify('Setup'), slugify('SETUP!')]).toEqual(['setup', 'setup-1'])
  })

  it('keeps counting past a slug a literal heading already took', () => {
    // "Setup 1" really is "setup-1", so the second "Setup" must not reuse it.
    const slugify = createHeadingSlugger()
    expect([slugify('Setup'), slugify('Setup 1'), slugify('Setup')]).toEqual([
      'setup',
      'setup-1',
      'setup-2',
    ])
  })

  it('keeps counting when the literal heading comes first', () => {
    const slugify = createHeadingSlugger()
    expect([slugify('Setup 1'), slugify('Setup'), slugify('Setup')]).toEqual([
      'setup-1',
      'setup',
      'setup-2',
    ])
  })

  it('starts fresh for every slugger (one per document)', () => {
    const first = createHeadingSlugger()
    first('Install')
    const second = createHeadingSlugger()
    expect(second('Install')).toBe('install')
  })

  it('numbers repeated empty slugs too', () => {
    const slugify = createHeadingSlugger()
    expect([slugify('!'), slugify('?')]).toEqual(['', '-1'])
  })
})
