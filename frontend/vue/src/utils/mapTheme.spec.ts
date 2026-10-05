import { describe, it, expect, beforeEach } from 'vitest'
import { currentMapTheme, isBrightBasemap, overlayAccentColor } from './mapTheme'

beforeEach(() => {
  delete document.documentElement.dataset.mapTheme
})

describe('currentMapTheme', () => {
  it.each(['dark', 'light'])('reports the published %s palette', (theme) => {
    document.documentElement.dataset.mapTheme = theme
    expect(currentMapTheme()).toBe(theme)
  })

  it('falls back to dark when no palette has been published yet', () => {
    expect(currentMapTheme()).toBe('dark')
  })

  it.each(['sepia', 'colour'])('falls back to dark for an unrecognised value (%s)', (value) => {
    // "colour" is retired: the store migrates it to light before publishing.
    document.documentElement.dataset.mapTheme = value
    expect(currentMapTheme()).toBe('dark')
  })
})

describe('isBrightBasemap', () => {
  it('is true for the light basemap', () => {
    document.documentElement.dataset.mapTheme = 'light'
    expect(isBrightBasemap()).toBe(true)
  })

  it('is false for the dark basemap', () => {
    document.documentElement.dataset.mapTheme = 'dark'
    expect(isBrightBasemap()).toBe(false)
  })

  it('is false when no palette has been published yet', () => {
    expect(isBrightBasemap()).toBe(false)
  })
})

describe('overlayAccentColor', () => {
  it('is black on the light basemap, where lime would disappear', () => {
    document.documentElement.dataset.mapTheme = 'light'
    expect(overlayAccentColor()).toBe('#000000')
  })

  it('is the brand lime on the dark basemap', () => {
    document.documentElement.dataset.mapTheme = 'dark'
    expect(overlayAccentColor()).toBe('#c8ff00')
  })

  it('defaults to the lime when no palette has been published yet', () => {
    expect(overlayAccentColor()).toBe('#c8ff00')
  })
})
