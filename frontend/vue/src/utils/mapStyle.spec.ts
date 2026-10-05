import { describe, it, expect, vi } from 'vitest'
import type { Map, StyleSpecification } from 'maplibre-gl'
import {
  absoluteSpriteTransform,
  basemapStyleUrl,
  ignoreOfflineTileErrors,
  setMapStyle,
} from './mapStyle'

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

describe('basemapStyleUrl', () => {
  it.each([
    [true, 'dark', '/assets/fiord-online.json'],
    [false, 'dark', '/assets/fiord.json'],
    [true, 'light', '/assets/osm-light-online.json'],
    [false, 'light', '/assets/osm-light.json'],
  ] as const)('picks the %s/%s basemap', (online, theme, expected) => {
    expect(basemapStyleUrl(online, theme)).toBe(expected)
  })

  it('keeps the offline pair distinct from the online one in both themes', () => {
    // The offline styles read the local PMTiles archives; picking an online
    // style off grid leaves the map blank, which is the failure this guards.
    expect(basemapStyleUrl(false, 'dark')).not.toBe(basemapStyleUrl(true, 'dark'))
    expect(basemapStyleUrl(false, 'light')).not.toBe(basemapStyleUrl(true, 'light'))
  })
})

describe('ignoreOfflineTileErrors', () => {
  function mapWithErrorHandler() {
    let errorHandler: ((event: { error?: unknown }) => void) | undefined
    const map = {
      on: vi.fn((eventName: string, handler: (event: { error?: unknown }) => void) => {
        if (eventName === 'error') errorHandler = handler
      }),
    }
    ignoreOfflineTileErrors(map as unknown as Map)
    return (event: { error?: unknown }) => errorHandler!(event)
  }

  it('stays quiet about a tile that failed because there is no network (status 0)', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reportError = mapWithErrorHandler()
    reportError({ error: { status: 0, url: 'https://tiles.openfreemap.org/planet/2/1/1.pbf' } })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('still logs a server error, a missing url, or any other map error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reportError = mapWithErrorHandler()
    const serverError = { status: 500, url: '/api/offline-map/basemap/1/1/1' }
    const noUrl = { status: 0 }
    const styleError = new Error('style is broken')
    reportError({ error: serverError })
    reportError({ error: noUrl })
    reportError({ error: styleError })
    reportError({ error: null })
    expect(consoleError.mock.calls.map((call) => call[0])).toEqual([
      serverError,
      noUrl,
      styleError,
      null,
    ])
    consoleError.mockRestore()
  })
})
