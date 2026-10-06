import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { createFlagBadge, FLAG_WIDTH_PX, FLAG_HEIGHT_PX } from './vesselFlagBadge'

describe('createFlagBadge', () => {
  it('builds a fixed-size flag image from the vendored SVGs, named for the country', () => {
    const badge = createFlagBadge('235052783')!
    expect(badge).not.toBeNull()
    const image = badge.querySelector('img')!
    expect(image.getAttribute('src')).toBe('/assets/flags/gb.svg')
    expect(image.alt).toBe('Flag: United Kingdom')
    expect(image.title).toBe('United Kingdom')
    expect(image.draggable).toBe(false)
    expect(image.style.width).toBe(`${FLAG_WIDTH_PX}px`)
    expect(image.style.height).toBe(`${FLAG_HEIGHT_PX}px`)
    expect(image.style.objectFit).toBe('cover')
    expect(badge.style.alignSelf).toBe('stretch')
  })

  it('lower-cases the code for the asset path', () => {
    expect(createFlagBadge('374275000')!.querySelector('img')!.getAttribute('src')).toBe(
      '/assets/flags/pa.svg',
    )
  })

  it('returns null when the MMSI resolves to no flag state', () => {
    expect(createFlagBadge('100000000')).toBeNull()
    expect(createFlagBadge('bogus')).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const host = document.createElement('div')
    host.appendChild(createFlagBadge('235052783')!)
    document.body.appendChild(host)
    expect(await axe(host)).toHaveNoViolations()
    host.remove()
  })
})
