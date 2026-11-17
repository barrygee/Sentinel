import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'

// ---- Marker mock: records every marker so a test can read its element and position ----
interface FakeMarker {
  options: { element: HTMLDivElement; anchor?: string; offset?: [number, number] }
  lngLat: [number, number] | null
  addedTo: unknown
  removed: boolean
  setLngLat: ReturnType<typeof vi.fn>
  addTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  getElement: () => HTMLDivElement
}
const markerRegistry = vi.hoisted(() => ({ instances: [] as FakeMarker[] }))

vi.mock('maplibre-gl', () => {
  function Marker(this: FakeMarker, options: FakeMarker['options']) {
    this.options = options
    this.lngLat = null
    this.addedTo = null
    this.removed = false
    this.getElement = () => this.options.element
    this.setLngLat = vi.fn((coordinates: [number, number]) => {
      this.lngLat = coordinates
      return this
    })
    this.addTo = vi.fn((map: unknown) => {
      this.addedTo = map
      return this
    })
    this.remove = vi.fn(() => {
      this.removed = true
      return this
    })
    markerRegistry.instances.push(this)
  }
  return { Marker }
})

import { SatelliteLabel } from './SatelliteLabel'

const fakeMap = { id: 'space-map' } as unknown as maplibregl.Map

function latestMarker(): FakeMarker {
  const marker = markerRegistry.instances.at(-1)
  if (!marker) throw new Error('no marker was created')
  return marker
}

function spanTexts(marker: FakeMarker): string[] {
  return Array.from(marker.getElement().querySelectorAll('span')).map(
    (span) => span.textContent ?? '',
  )
}

let label: SatelliteLabel

beforeEach(() => {
  markerRegistry.instances.length = 0
  label = new SatelliteLabel(() => fakeMap)
})

describe('SatelliteLabel.show', () => {
  it('starts with no label on the map', () => {
    expect(label.isShown).toBe(false)
    expect(markerRegistry.instances).toHaveLength(0)
  })

  it('adds a plain label, anchored left and offset clear of the icon, at the position', () => {
    label.show(10, 20, 'ISS (ZARYA)')

    const marker = latestMarker()
    expect(label.isShown).toBe(true)
    expect(marker.options.anchor).toBe('left')
    expect(marker.options.offset).toEqual([26, 0])
    expect(marker.lngLat).toEqual([10, 20])
    expect(marker.addedTo).toBe(fakeMap)
    expect(marker.getElement().className).toBe('iss-label')
    expect(spanTexts(marker)).toEqual(['ISS (ZARYA)'])
  })

  it('moves the label already shown rather than adding a second one', () => {
    label.show(10, 20, 'ISS (ZARYA)')
    label.show(30, 40, 'ignored once shown')

    expect(markerRegistry.instances).toHaveLength(1)
    expect(latestMarker().lngLat).toEqual([30, 40])
    expect(spanTexts(latestMarker())).toEqual(['ISS (ZARYA)'])
  })
})

describe('SatelliteLabel.replace', () => {
  it('adds the TRACKING form when given an untrack callback', () => {
    label.replace(1, 2, 'NOAA 19', () => {})

    const marker = latestMarker()
    expect(marker.getElement().className).toBe('iss-label iss-label--tracking')
    expect(spanTexts(marker)).toEqual(['NOAA 19', 'TRACKING'])
    expect(marker.getElement().querySelector('.iss-tracking-badge')).not.toBeNull()
    expect(marker.lngLat).toEqual([1, 2])
  })

  it('swaps the badge text to UNTRACK on hover and back on leave', () => {
    label.replace(1, 2, 'NOAA 19', () => {})
    const element = latestMarker().getElement()

    element.dispatchEvent(new MouseEvent('mouseenter'))
    expect(spanTexts(latestMarker())[1]).toBe('UNTRACK')
    element.dispatchEvent(new MouseEvent('mouseleave'))
    expect(spanTexts(latestMarker())[1]).toBe('TRACKING')
  })

  it('calls the untrack callback on click and keeps the click off the map', () => {
    const onUntrack = vi.fn()
    const mapClick = vi.fn()
    document.body.addEventListener('click', mapClick)
    label.replace(1, 2, 'NOAA 19', onUntrack)
    const element = latestMarker().getElement()
    document.body.appendChild(element)

    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onUntrack).toHaveBeenCalledOnce()
    expect(mapClick).not.toHaveBeenCalled()
    document.body.removeEventListener('click', mapClick)
    element.remove()
  })

  it('adds the plain form without a callback, with no badge and no click handling', () => {
    label.replace(5, 6, 'NOAA 19')

    const marker = latestMarker()
    expect(marker.getElement().className).toBe('iss-label')
    expect(spanTexts(marker)).toEqual(['NOAA 19'])
  })

  it('removes the label shown before adding the new one', () => {
    label.show(10, 20, 'ISS (ZARYA)')
    const first = latestMarker()

    label.replace(10, 20, 'ISS (ZARYA)', () => {})

    expect(first.removed).toBe(true)
    expect(markerRegistry.instances).toHaveLength(2)
    expect(latestMarker().removed).toBe(false)
    expect(label.isShown).toBe(true)
  })
})

describe('SatelliteLabel.moveTo', () => {
  it('moves the label shown', () => {
    label.show(10, 20, 'ISS (ZARYA)')
    label.moveTo(-3, 4)
    expect(latestMarker().lngLat).toEqual([-3, 4])
  })

  it('does nothing and adds nothing when no label is shown', () => {
    expect(() => label.moveTo(-3, 4)).not.toThrow()
    expect(markerRegistry.instances).toHaveLength(0)
  })
})

describe('SatelliteLabel.showPreview and restoreName', () => {
  it('moves to the previewed satellite, shows its name and hides the TRACKING badge', () => {
    label.replace(10, 20, 'ISS (ZARYA)', () => {})

    label.showPreview(7, 8, 'STARLINK')

    const marker = latestMarker()
    expect(marker.lngLat).toEqual([7, 8])
    expect(spanTexts(marker)[0]).toBe('STARLINK')
    expect(marker.getElement().querySelector('.iss-tracking-badge')!.classList).toContain(
      'iss-tracking-badge--hidden',
    )
  })

  it('restores the name and shows the badge again, leaving the position to the caller', () => {
    label.replace(10, 20, 'ISS (ZARYA)', () => {})
    label.showPreview(7, 8, 'STARLINK')

    label.restoreName('ISS (ZARYA)')

    const marker = latestMarker()
    expect(spanTexts(marker)[0]).toBe('ISS (ZARYA)')
    expect(marker.getElement().querySelector('.iss-tracking-badge')!.classList).not.toContain(
      'iss-tracking-badge--hidden',
    )
    expect(marker.lngLat).toEqual([7, 8])
  })

  it('swaps only the name on a plain label, which has no badge', () => {
    label.show(10, 20, 'ISS (ZARYA)')

    label.showPreview(7, 8, 'STARLINK')
    expect(spanTexts(latestMarker())).toEqual(['STARLINK'])
    label.restoreName('ISS (ZARYA)')
    expect(spanTexts(latestMarker())).toEqual(['ISS (ZARYA)'])
  })

  it('does nothing when no label is shown', () => {
    expect(() => label.showPreview(7, 8, 'STARLINK')).not.toThrow()
    expect(() => label.restoreName('ISS (ZARYA)')).not.toThrow()
    expect(markerRegistry.instances).toHaveLength(0)
    expect(label.isShown).toBe(false)
  })
})

describe('SatelliteLabel.hide', () => {
  it('removes the label and lets the next show add a fresh one', () => {
    label.show(10, 20, 'ISS (ZARYA)')
    const first = latestMarker()

    label.hide()
    expect(first.removed).toBe(true)
    expect(label.isShown).toBe(false)

    label.show(30, 40, 'NOAA 19')
    expect(markerRegistry.instances).toHaveLength(2)
    expect(spanTexts(latestMarker())).toEqual(['NOAA 19'])
  })

  it('does nothing when no label is shown', () => {
    expect(() => label.hide()).not.toThrow()
    expect(label.isShown).toBe(false)
  })
})

describe('SatelliteLabel map lookup', () => {
  it('reads the map when a label is added, not when constructed', () => {
    const getMap = vi.fn(() => fakeMap)
    const lateLabel = new SatelliteLabel(getMap)
    expect(getMap).not.toHaveBeenCalled()

    lateLabel.show(1, 2, 'ISS (ZARYA)')
    expect(getMap).toHaveBeenCalledOnce()
  })
})
