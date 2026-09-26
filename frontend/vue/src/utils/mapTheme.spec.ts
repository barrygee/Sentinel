import { describe, it, expect, beforeEach } from 'vitest'
import { isLightTheme, overlayAccentColor } from './mapTheme'

beforeEach(() => {
  delete document.documentElement.dataset.mapTheme
})

describe('isLightTheme', () => {
  it('is true when the document element declares the light theme', () => {
    document.documentElement.dataset.mapTheme = 'light'
    expect(isLightTheme()).toBe(true)
  })

  it('is false when the document element declares the dark theme', () => {
    document.documentElement.dataset.mapTheme = 'dark'
    expect(isLightTheme()).toBe(false)
  })

  it('is false when no theme has been published yet', () => {
    expect(isLightTheme()).toBe(false)
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

  it('defaults to the lime when no theme has been published yet', () => {
    expect(overlayAccentColor()).toBe('#c8ff00')
  })
})
