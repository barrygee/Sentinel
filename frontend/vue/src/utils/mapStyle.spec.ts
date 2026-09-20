import { describe, it, expect, vi } from 'vitest'
import type { Map, StyleSpecification } from 'maplibre-gl'
import { absoluteSpriteTransform, setMapStyle } from './mapStyle'

function style(sprite: StyleSpecification['sprite']): StyleSpecification {
  return { version: 8, sources: {}, layers: [], sprite }
}

describe('absoluteSpriteTransform', () => {
  it('resolves a root-relative sprite URL against the page origin', () => {
    const next = style('/assets/sprites/ofm')
    const result = absoluteSpriteTransform(undefined, next)
    expect(result.sprite).toBe(`${window.location.origin}/assets/sprites/ofm`)
    // The rest of the style is carried over untouched, on a fresh object.
    expect(result).not.toBe(next)
    expect(result.layers).toBe(next.layers)
    expect(next.sprite).toBe('/assets/sprites/ofm')
  })

  it('leaves an already-absolute sprite URL alone', () => {
    const next = style('https://tiles.example/sprites/ofm')
    expect(absoluteSpriteTransform(undefined, next)).toBe(next)
  })

  it('leaves a style with no sprite alone', () => {
    const next = style(undefined)
    expect(absoluteSpriteTransform(undefined, next)).toBe(next)
  })

  it('leaves a multi-sprite array alone', () => {
    const next = style([{ id: 'ofm', url: '/assets/sprites/ofm' }])
    expect(absoluteSpriteTransform(undefined, next)).toBe(next)
  })

  it('ignores the previous style entirely', () => {
    const previous = style('/assets/sprites/old')
    const next = style('/assets/sprites/ofm')
    expect(absoluteSpriteTransform(previous, next).sprite).toBe(
      `${window.location.origin}/assets/sprites/ofm`,
    )
  })
})

describe('setMapStyle', () => {
  it('swaps the style by URL with the sprite transform attached', () => {
    const map = { setStyle: vi.fn() } as unknown as Map
    setMapStyle(map, '/assets/fiord.json')
    expect(map.setStyle).toHaveBeenCalledTimes(1)
    expect(map.setStyle).toHaveBeenCalledWith('/assets/fiord.json', {
      transformStyle: absoluteSpriteTransform,
    })
  })
})
