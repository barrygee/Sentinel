import { describe, it, expect } from 'vitest'
import { buildMarkerDetailsPill, type MarkerDetails } from './markerDetailsPill'

function details(overrides: Partial<MarkerDetails> = {}): MarkerDetails {
  return {
    name: 'Roof Pi',
    latitude: 51.5,
    longitude: -0.1,
    address: '192.168.1.60:8000',
    reachable: true,
    ...overrides,
  }
}

function statusDot(pill: HTMLElement): HTMLElement {
  return pill.querySelector<HTMLElement>('.sdr-manager-map-marker-status')!
}

describe('buildMarkerDetailsPill', () => {
  it('reads name, position, then address', () => {
    const pill = buildMarkerDetailsPill(details())
    expect(pill.className).toBe('sdr-manager-map-marker-info')
    expect([...pill.children].map((child) => child.className)).toEqual([
      'sdr-manager-map-marker-name',
      'sdr-manager-map-marker-coords',
      'sdr-manager-map-marker-meta',
    ])
    expect(pill.querySelector('.sdr-manager-map-marker-name')!.textContent).toBe('Roof Pi')
    expect(pill.querySelector('.sdr-manager-map-marker-coords')!.textContent).toBe(
      '51.50000° N  0.10000° W',
    )
    expect(pill.querySelector('.sdr-manager-map-marker-meta')!.textContent).toBe(
      '192.168.1.60:8000',
    )
  })

  it('leads the name with the status dot, outside the name text', () => {
    const name = buildMarkerDetailsPill(details()).querySelector('.sdr-manager-map-marker-name')!
    expect(name.firstElementChild!.className).toContain('sdr-manager-map-marker-status')
    expect(name.textContent).toBe('Roof Pi')
  })

  it('colours the dot online, off air, or leaves it plain when unknown', () => {
    expect(statusDot(buildMarkerDetailsPill(details({ reachable: true }))).className).toBe(
      'sdr-manager-map-marker-status sdr-manager-map-marker-status--online',
    )
    expect(statusDot(buildMarkerDetailsPill(details({ reachable: false }))).className).toBe(
      'sdr-manager-map-marker-status sdr-manager-map-marker-status--offair',
    )
    expect(statusDot(buildMarkerDetailsPill(details({ reachable: null }))).className).toBe(
      'sdr-manager-map-marker-status',
    )
  })

  it('leaves the address line out when there is no address', () => {
    const pill = buildMarkerDetailsPill(details({ address: null }))
    expect(pill.querySelector('.sdr-manager-map-marker-meta')).toBeNull()
    expect(pill.children).toHaveLength(2)
  })

  it('writes southern and eastern positions with their own hemispheres', () => {
    const pill = buildMarkerDetailsPill(details({ latitude: -33.8688, longitude: 151.2093 }))
    expect(pill.querySelector('.sdr-manager-map-marker-coords')!.textContent).toBe(
      '33.86880° S  151.20930° E',
    )
  })

  it('writes a name as text, never as markup', () => {
    const pill = buildMarkerDetailsPill(details({ name: '<img src=x onerror="alert(1)">' }))
    expect(pill.querySelector('img')).toBeNull()
    expect(pill.querySelector('.sdr-manager-map-marker-name')!.textContent).toBe(
      '<img src=x onerror="alert(1)">',
    )
  })

  it('is hidden from assistive tech, which hears the marker name instead', () => {
    expect(buildMarkerDetailsPill(details()).getAttribute('aria-hidden')).toBe('true')
  })
})
