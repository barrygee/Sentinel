import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'

// ---- Marker stand-in: records its options and what was done to it ----
interface FakeMarker {
  options: { element: HTMLElement; anchor?: string; offset?: [number, number] }
  lngLat: unknown
  addedTo: unknown
  removed: boolean
  setLngLat: ReturnType<typeof vi.fn>
  addTo: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  setOffset: ReturnType<typeof vi.fn>
  getElement: () => HTMLElement
}
const markerRegistry = vi.hoisted(() => ({ instances: [] as FakeMarker[] }))

vi.mock('maplibre-gl', () => {
  function Marker(this: FakeMarker, options: FakeMarker['options']) {
    this.options = options
    this.lngLat = null
    this.addedTo = null
    this.removed = false
    this.getElement = () => this.options.element
    this.setOffset = vi.fn()
    this.setLngLat = vi.fn((coords: unknown) => {
      this.lngLat = coords
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

import { CallsignLabels, type CallsignLabelsHost } from './CallsignLabels'
import { SILHOUETTE_NAME_PADDING } from './AircraftTags'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'
import { altitudeColour } from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'

// ---- Fixtures ----

// isLeftFacing reads 1–189° as left-facing (the label sits on the aircraft's left).
const RIGHT_FACING_TRACK = 270
const LEFT_FACING_TRACK = 90

function aircraftProperties(overrides: Partial<AircraftProperties> = {}): AircraftProperties {
  return {
    hex: 'abc123',
    flight: 'BAW123',
    r: 'G-EUUA',
    t: 'a320',
    alt_baro: 30000,
    alt_geom: null,
    gs: 401.6,
    ias: null,
    mach: null,
    track: RIGHT_FACING_TRACK,
    baro_rate: 0,
    nav_altitude: null,
    nav_heading: null,
    category: 'A3',
    emergency: '',
    squawk: '1000',
    squawkEmerg: 0,
    rssi: null,
    military: false,
    stale: 0,
    silhouetteImage: '',
    silhouetteRadiusPx: 0,
    silhouetteRotates: 0,
    ...overrides,
  }
}

function aircraftFeature(
  overrides: Partial<AircraftProperties> = {},
  coordinates: [number, number] = [-1, 51],
): AircraftGeoFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: aircraftProperties(overrides),
  }
}

const ALL_FIELDS_ON = {
  callsign: true,
  squawk: true,
  aircraftType: true,
  altitude: true,
  heading: true,
  speed: true,
  registration: true,
  category: true,
}

/** A CSS colour as jsdom reports it back, so assertions don't depend on its formatting. */
function cssColour(colour: string): string {
  const probe = document.createElement('div')
  probe.style.color = colour
  return probe.style.color
}

/** A host whose state each test sets directly; every callback is a spy. */
function createHost() {
  const fakeMap = { getZoom: vi.fn(() => 5) }
  const state = {
    map: fakeMap as unknown as maplibregl.Map | undefined,
    labelsVisible: true,
    features: [] as AircraftGeoFeature[],
    iconStyle: 'arrow' as 'arrow' | 'silhouette',
    altitudeColouring: false,
    fields: {
      civil: { ...ALL_FIELDS_ON } as Record<string, boolean>,
      mil: { ...ALL_FIELDS_ON } as Record<string, boolean>,
      always: {} as Record<string, boolean>,
    },
    allHidden: false,
    selectedHex: null as string | null,
    isolatedHex: null as string | null,
    typeFilter: 'all' as 'all' | 'civil' | 'mil',
    hideGroundVehicles: false,
    hideTowers: false,
    layerVisible: true,
    following: false,
    taggedHex: null as string | null,
    alertHexes: new Set<string>(),
    staleHexes: new Set<string>(),
    interpolated: {} as Record<string, [number, number]>,
  }
  const host = {
    getMap: vi.fn(() => state.map),
    labelsVisible: vi.fn(() => state.labelsVisible),
    features: vi.fn(() => state.features),
    iconStyle: vi.fn(() => state.iconStyle),
    altitudeColouring: vi.fn(() => state.altitudeColouring),
    labelFields: vi.fn(() => state.fields),
    allHidden: vi.fn(() => state.allHidden),
    selectedHex: vi.fn(() => state.selectedHex),
    isolatedHex: vi.fn(() => state.isolatedHex),
    typeFilter: vi.fn(() => state.typeFilter),
    hideGroundVehicles: vi.fn(() => state.hideGroundVehicles),
    hideTowers: vi.fn(() => state.hideTowers),
    layerVisible: vi.fn(() => state.layerVisible),
    isFollowing: vi.fn(() => state.following),
    taggedHex: vi.fn(() => state.taggedHex),
    isAlertEnabled: vi.fn((hex: string) => state.alertHexes.has(hex)),
    isStale: vi.fn((hex: string) => state.staleHexes.has(hex)),
    interpolatedCoords: vi.fn((hex: string) => state.interpolated[hex] ?? null),
    labelOffset: vi.fn((_props: AircraftProperties, leftFacing: boolean): [number, number] =>
      leftFacing ? [-13, 0] : [13, 0],
    ),
    categoryLabel: vi.fn((code: string) => (code === 'A3' ? 'Large aircraft' : null)),
    formatAltitude: vi.fn((altitudeFeet: number) => `FL${altitudeFeet / 100}`),
    onLabelPlaced: vi.fn(),
    onLabelUntrack: vi.fn(),
    onLabelEnter: vi.fn(),
    onLabelLeave: vi.fn(),
    onLabelClick: vi.fn(),
  } satisfies CallsignLabelsHost
  return { host, state, fakeMap }
}

let host: ReturnType<typeof createHost>['host']
let state: ReturnType<typeof createHost>['state']
let fakeMap: ReturnType<typeof createHost>['fakeMap']
let labels: CallsignLabels

beforeEach(() => {
  markerRegistry.instances.length = 0
  ;({ host, state, fakeMap } = createHost())
  labels = new CallsignLabels(host)
})

/** The label element of `hex`'s current marker. */
function labelOf(hex: string): HTMLElement {
  const marker = labels.markers[hex]
  if (!marker) throw new Error(`no label for ${hex}`)
  return marker.getElement()
}

/** The text of each direct child of a label, in order (the arrow well reads as ARROW). */
function segmentTexts(label: HTMLElement): string[] {
  return [...label.children].map((child) =>
    child.classList.contains('adsb-arrow-wrap') ? 'ARROW' : (child.textContent ?? ''),
  )
}

/** Places one aircraft's label, then returns its marker and element for an in-place update. */
function placeLabel(overrides: Partial<AircraftProperties> = {}) {
  state.features = [aircraftFeature(overrides)]
  labels.update()
  const hex = overrides.hex ?? 'abc123'
  const marker = labels.markers[hex] as unknown as FakeMarker
  return { marker, label: labelOf(hex), hex }
}

/** Replaces the one aircraft's properties and runs an update. */
function updateWith(overrides: Partial<AircraftProperties>) {
  state.features = [aircraftFeature(overrides)]
  labels.update()
}

// ---- glyphMarkup ----

describe('glyphMarkup', () => {
  it.each(['C1', 'c2'])('draws an upright vehicle for surface category %s', (category) => {
    const markup = labels.glyphMarkup({ category }, '#123456', 90)
    expect(markup).toContain('<path')
    expect(markup).toContain('fill="#123456"')
    expect(markup).toContain('rotate(0deg)')
  })

  it.each([
    [{ category: 'C3' }],
    [{ category: 'C4' }],
    [{ category: 'c5' }],
    [{ category: 'A3', t: 'twr' }],
  ])('draws an upright dot for a fixed target %o', (props) => {
    const markup = labels.glyphMarkup(props, '#123456', 90)
    expect(markup).toContain('<circle')
    expect(markup).toContain('fill="#123456"')
    expect(markup).toContain('rotate(0deg)')
  })

  it('draws an arrow rotated to the track for anything else', () => {
    const markup = labels.glyphMarkup({ category: 'A3', t: 'A320' }, '#123456', 123)
    expect(markup).toContain('<polygon')
    expect(markup).toContain('stroke="#123456"')
    expect(markup).toContain('rotate(123deg)')
  })

  it('treats a missing category and type as an aircraft', () => {
    expect(labels.glyphMarkup({}, '#fff', 45)).toContain('<polygon')
  })
})

// ---- arrowColour ----

describe('arrowColour', () => {
  it('is red for an emergency, even with altitude colouring on', () => {
    state.altitudeColouring = true
    expect(labels.arrowColour(aircraftProperties(), true, true)).toBe('#ff2222')
  })

  it('follows the dark altitude ramp while colouring is on', () => {
    state.altitudeColouring = true
    expect(labels.arrowColour(aircraftProperties({ alt_baro: 30000 }), false, true)).toBe(
      altitudeColour(30000, 'dark'),
    )
    expect(labels.arrowColour(aircraftProperties({ alt_baro: 2000 }), false, false)).toBe(
      altitudeColour(2000, 'dark'),
    )
  })

  it.each([
    [true, '#c8ff00'],
    [false, '#00aaff'],
  ])('falls back to the flat colour on the ground (military %s)', (isMilitary, colour) => {
    state.altitudeColouring = true
    expect(labels.arrowColour(aircraftProperties({ alt_baro: 0 }), false, isMilitary)).toBe(colour)
  })

  it.each([
    [true, '#c8ff00'],
    [false, '#00aaff'],
  ])('uses the flat colour at height while colouring is off (military %s)', (isMil, colour) => {
    expect(labels.arrowColour(aircraftProperties({ alt_baro: 30000 }), false, isMil)).toBe(colour)
  })
})

// ---- arrowSvg ----

describe('arrowSvg', () => {
  it('is empty in silhouette mode, where the map draws the aircraft', () => {
    state.iconStyle = 'silhouette'
    expect(labels.arrowSvg('#fff', 90, 'A3', 'A320')).toBe('')
  })

  it('is a black glyph well holding the glyph for the category and type', () => {
    const holder = document.createElement('div')
    holder.innerHTML = labels.arrowSvg('#abcdef', 45, 'A3', 'A320')
    const well = holder.firstElementChild as HTMLElement
    expect(well.className).toBe('adsb-arrow-wrap')
    expect(well.style.background).toBe(cssColour('#000'))
    expect(well.querySelector('polygon')?.getAttribute('stroke')).toBe('#abcdef')
    expect(well.innerHTML).toContain('rotate(45deg)')
  })

  it('passes the type through, so a tower gets its dot', () => {
    expect(labels.arrowSvg('#fff', 45, 'A3', 'TWR')).toContain('<circle')
    expect(labels.arrowSvg('#fff', 45, 'C1')).toContain('<path')
  })
})

// ---- restingLabelFields ----

describe('restingLabelFields', () => {
  it('returns the military or civil selection unchanged in arrow mode', () => {
    state.fields.mil = { callsign: true }
    state.fields.civil = { altitude: true }
    expect(labels.restingLabelFields(true)).toEqual({ callsign: true })
    expect(labels.restingLabelFields(false)).toEqual({ altitude: true })
  })

  it('keeps only the fields also set to ALWAYS in silhouette mode', () => {
    state.iconStyle = 'silhouette'
    state.fields.civil = { callsign: true, altitude: true, speed: false }
    state.fields.always = { callsign: true, speed: true }
    expect(labels.restingLabelFields(false)).toEqual({
      callsign: true,
      altitude: false,
      speed: false,
    })
  })
})

// ---- buildLabelEl ----

describe('buildLabelEl', () => {
  it.each([
    [{ flight: ' BAW123 ' }, 'BAW123'],
    [{ flight: '  ', r: ' G-EUUA ' }, 'G-EUUA'],
    [{ flight: '', r: '', hex: ' abc123 ' }, 'abc123'],
    [{ flight: '', r: '', hex: '' }, 'UNKNOWN'],
  ])('names the aircraft by callsign, then registration, then hex (%o)', (overrides, name) => {
    const label = labels.buildLabelEl(aircraftProperties(overrides))
    expect(label.querySelector('.adsb-label-name')?.textContent).toBe(name)
  })

  it('leads with the arrow and trails the fields for a right-facing aircraft', () => {
    const label = labels.buildLabelEl(aircraftProperties({ track: RIGHT_FACING_TRACK }))
    expect(label.dataset.dir).toBe('right')
    expect(segmentTexts(label)).toEqual([
      'ARROW',
      'BAW123',
      'A320',
      'SQK1000',
      'ALTFL300',
      'HDG270°',
      'SPD402kt',
      'REGG-EUUA',
      'CATLarge aircraft',
    ])
  })

  it('mirrors the segments for a left-facing aircraft, keeping the arrow on the nose', () => {
    const label = labels.buildLabelEl(aircraftProperties({ track: LEFT_FACING_TRACK }))
    expect(label.dataset.dir).toBe('left')
    const texts = segmentTexts(label)
    expect(texts[0]).toBe('CATLarge aircraft')
    expect(texts.at(-1)).toBe('ARROW')
  })

  it('treats a missing track as heading north (right-facing)', () => {
    const label = labels.buildLabelEl(aircraftProperties({ track: undefined }))
    expect(label.dataset.dir).toBe('right')
  })

  it('shows only the fields selected for the aircraft', () => {
    state.fields.civil = { callsign: true }
    const label = labels.buildLabelEl(aircraftProperties())
    expect(segmentTexts(label)).toEqual(['ARROW', 'BAW123'])
  })

  it('uses the military selection for a military aircraft', () => {
    state.fields.civil = { callsign: true }
    state.fields.mil = { aircraftType: true }
    const label = labels.buildLabelEl(aircraftProperties({ military: true }))
    expect(segmentTexts(label)).toEqual(['ARROW', 'A320'])
    expect(label.querySelector('.mil-model-badge')).not.toBeNull()
  })

  it('leaves out fields the aircraft has no value for', () => {
    host.categoryLabel.mockReturnValue(null)
    // The type says gs is always a number, but the feed can omit it, which the label guards.
    const missingGroundSpeed = null as unknown as number
    const label = labels.buildLabelEl(
      aircraftProperties({ t: '', squawk: '', alt_baro: 0, gs: missingGroundSpeed, r: '' }),
    )
    // No type, squawk, altitude, speed, registration or category; heading remains.
    expect(segmentTexts(label)).toEqual(['ARROW', 'BAW123', 'HDG270°'])
  })

  it('labels the type and altitude badges for civil aircraft', () => {
    const label = labels.buildLabelEl(aircraftProperties())
    expect(label.querySelector('.civil-model-badge')?.textContent).toBe('A320')
    expect(label.querySelector('.civil-alt-badge')?.textContent).toBe('ALTFL300')
    expect(host.formatAltitude).toHaveBeenCalledWith(30000)
  })

  it('labels the type and altitude badges for military aircraft', () => {
    const label = labels.buildLabelEl(aircraftProperties({ military: true }))
    const typeBadge = label.querySelector('.mil-model-badge') as HTMLElement
    expect(typeBadge.textContent).toBe('A320')
    expect(typeBadge.style.background).toBe(cssColour('#4d6600'))
    expect(label.querySelector('.mil-alt-badge')).not.toBeNull()
  })

  it('colours a civil label blue and white on black', () => {
    const label = labels.buildLabelEl(aircraftProperties())
    expect(label.style.background).toBe(cssColour('#000000'))
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.getPropertyValue('color')).toBe(cssColour('#ffffff'))
    const typeBadge = label.querySelector('.civil-model-badge') as HTMLElement
    expect(typeBadge.style.background).toBe(cssColour('#002244'))
    expect(typeBadge.style.getPropertyValue('color')).toBe(cssColour('#00aaff'))
  })

  it('turns an emergency label red and shows its squawk as a red badge', () => {
    const label = labels.buildLabelEl(aircraftProperties({ squawkEmerg: 1, squawk: '7700' }))
    expect(label.style.background).toBe(cssColour('rgba(180,0,0,0.85)'))
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.getPropertyValue('color')).toBe(cssColour('#ff4040'))
    const squawk = label.querySelector('.sqk-badge') as HTMLElement
    expect(squawk.textContent).toBe('7700')
    expect(squawk.style.getPropertyValue('color')).toBe(cssColour('#ff2222'))
    // The emergency badge replaces the plain SQK field.
    expect(segmentTexts(label)).not.toContain('SQK7700')
    const typeBadge = label.querySelector('.civil-model-badge') as HTMLElement
    expect(typeBadge.style.background).toBe(cssColour('#4d0000'))
  })

  it('shows the emergency squawk badge even with the squawk field off', () => {
    state.fields.civil = { callsign: true }
    const label = labels.buildLabelEl(aircraftProperties({ squawkEmerg: 1, squawk: '7600' }))
    expect(label.querySelector('.sqk-badge')?.textContent).toBe('7600')
  })

  it('colours the arrow with the arrow colour', () => {
    const label = labels.buildLabelEl(aircraftProperties({ military: true }))
    expect(label.querySelector('polygon')?.getAttribute('stroke')).toBe('#c8ff00')
  })

  it('drops the arrow and pads the name for silhouettes in silhouette mode', () => {
    state.iconStyle = 'silhouette'
    state.fields.always = { ...ALL_FIELDS_ON }
    const label = labels.buildLabelEl(aircraftProperties())
    expect(label.querySelector('.adsb-arrow-wrap')).toBeNull()
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.padding).toBe(SILHOUETTE_NAME_PADDING)
  })

  it('records whether alerts are on, and shows the bell when they are', () => {
    expect(labels.buildLabelEl(aircraftProperties()).dataset.notif).toBe('0')
    expect(labels.buildLabelEl(aircraftProperties()).querySelector('.tag-notif-btn')).toBeNull()
    state.alertHexes.add('abc123')
    const label = labels.buildLabelEl(aircraftProperties())
    expect(label.dataset.notif).toBe('1')
    const bell = label.querySelector('.tag-notif-btn') as HTMLElement
    expect(bell.dataset.hex).toBe('abc123')
    expect(bell.getAttribute('aria-label')).toBe('Toggle alerts')
    bell.dispatchEvent(new MouseEvent('mouseenter'))
    bell.dispatchEvent(new MouseEvent('mouseleave'))
    expect(bell.style.color).toBe(cssColour('#c8ff00'))
  })

  describe('the TRACKING button', () => {
    beforeEach(() => {
      state.following = true
      state.taggedHex = 'abc123'
    })

    it('shows on a followed military aircraft, in place of the bell', () => {
      state.alertHexes.add('abc123')
      const label = labels.buildLabelEl(aircraftProperties({ military: true }))
      expect(label.querySelector('.mil-trk-btn')?.textContent).toBe('TRACKING')
      expect(label.querySelector('.tag-notif-btn')).toBeNull()
    })

    it('does not show on a followed civil aircraft', () => {
      const label = labels.buildLabelEl(aircraftProperties())
      expect(label.querySelector('.mil-trk-btn')).toBeNull()
    })

    it('does not show while not following, or on another aircraft', () => {
      state.following = false
      expect(
        labels.buildLabelEl(aircraftProperties({ military: true })).querySelector('.mil-trk-btn'),
      ).toBeNull()
      state.following = true
      state.taggedHex = 'other'
      expect(
        labels.buildLabelEl(aircraftProperties({ military: true })).querySelector('.mil-trk-btn'),
      ).toBeNull()
    })

    it('reads UNTRACK under the pointer', () => {
      const button = labels
        .buildLabelEl(aircraftProperties({ military: true }))
        .querySelector('.mil-trk-btn') as HTMLElement
      button.dispatchEvent(new MouseEvent('mouseenter'))
      expect(button.textContent).toBe('UNTRACK')
      button.dispatchEvent(new MouseEvent('mouseleave'))
      expect(button.textContent).toBe('TRACKING')
    })

    it('reports a click as an untrack, without it reaching the label', () => {
      const label = labels.buildLabelEl(aircraftProperties({ military: true }))
      const button = label.querySelector('.mil-trk-btn') as HTMLElement
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(host.onLabelUntrack).toHaveBeenCalledWith('abc123')
      expect(host.onLabelClick).not.toHaveBeenCalled()
    })
  })

  it('reports pointer enter and leave', () => {
    const label = labels.buildLabelEl(aircraftProperties())
    label.dispatchEvent(new MouseEvent('mouseenter'))
    expect(host.onLabelEnter).toHaveBeenCalledWith('abc123', label)
    label.dispatchEvent(new MouseEvent('mouseleave'))
    expect(host.onLabelLeave).toHaveBeenCalledOnce()
  })

  it('reports a click and keeps it from reaching the map', () => {
    const container = document.createElement('div')
    const mapClick = vi.fn()
    container.addEventListener('click', mapClick)
    const label = labels.buildLabelEl(aircraftProperties())
    container.appendChild(label)
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(host.onLabelClick).toHaveBeenCalledWith('abc123')
    expect(mapClick).not.toHaveBeenCalled()
  })
})

// ---- update: which aircraft get a label ----

describe('update: which aircraft get a label', () => {
  it('does nothing without a map', () => {
    state.map = undefined
    state.features = [aircraftFeature()]
    labels.update()
    expect(labels.markers).toEqual({})
  })

  it('does nothing while labels are off', () => {
    state.labelsVisible = false
    state.features = [aircraftFeature()]
    labels.update()
    expect(labels.markers).toEqual({})
  })

  it('places a label for an aircraft in flight', () => {
    state.interpolated.abc123 = [-2, 52]
    state.features = [aircraftFeature()]
    labels.update()
    const marker = labels.markers.abc123 as unknown as FakeMarker
    expect(marker.options.anchor).toBe('left')
    expect(marker.options.offset).toEqual([13, 0])
    expect(marker.lngLat).toEqual([-2, 52])
    expect(marker.addedTo).toBe(fakeMap)
    expect(host.onLabelPlaced).toHaveBeenCalledWith('abc123', marker.options.element)
  })

  it('anchors a left-facing aircraft’s label on its right', () => {
    state.features = [aircraftFeature({ track: LEFT_FACING_TRACK })]
    labels.update()
    const marker = labels.markers.abc123 as unknown as FakeMarker
    expect(marker.options.anchor).toBe('right')
    expect(host.labelOffset).toHaveBeenCalledWith(expect.anything(), true)
  })

  it('dims a new label for a stale aircraft', () => {
    state.staleHexes.add('abc123')
    state.features = [aircraftFeature()]
    labels.update()
    const label = labelOf('abc123')
    expect(label.style.opacity).toBe('0.3')
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.color).toBe(cssColour('rgba(255,255,255,0.45)'))
  })

  it('skips an aircraft with no hex', () => {
    state.features = [aircraftFeature({ hex: '' })]
    labels.update()
    expect(labels.markers).toEqual({})
  })

  it('gives a silhouette no label when no field is set to ALWAYS', () => {
    state.iconStyle = 'silhouette'
    state.features = [aircraftFeature()]
    labels.update()
    expect(labels.markers).toEqual({})
    state.fields.always = { callsign: true }
    labels.update()
    expect(labels.markers.abc123).toBeDefined()
  })

  it('removes a silhouette’s label once its ALWAYS fields are cleared', () => {
    state.iconStyle = 'silhouette'
    state.fields.always = { callsign: true }
    const { marker } = placeLabel()
    state.fields.always = {}
    labels.update()
    expect(marker.removed).toBe(true)
    expect(labels.markers.abc123).toBeUndefined()
  })

  it('hides an aircraft on the ground until zoom 10', () => {
    state.features = [aircraftFeature({ alt_baro: 0 })]
    labels.update()
    expect(labels.markers.abc123).toBeUndefined()
    fakeMap.getZoom.mockReturnValue(10)
    labels.update()
    expect(labels.markers.abc123).toBeDefined()
  })

  it.each([
    ['a ground vehicle', { category: 'C1', alt_baro: 0 }],
    ['a tower', { category: 'A0', t: 'TWR', alt_baro: 0 }],
    ['a fixed obstacle', { category: 'C3', alt_baro: 0 }],
  ])('labels %s at any zoom', (_kind, overrides) => {
    state.features = [aircraftFeature(overrides)]
    labels.update()
    expect(labels.markers.abc123).toBeDefined()
  })

  it('removes a placed label when its aircraft is hidden', () => {
    const { marker } = placeLabel()
    state.layerVisible = false
    labels.update()
    expect(marker.removed).toBe(true)
    expect(labels.markers.abc123).toBeUndefined()
  })

  it('hides every label while all are hidden and nothing is selected', () => {
    state.allHidden = true
    state.features = [
      aircraftFeature({ hex: 'a1' }),
      aircraftFeature({ hex: 'g1', category: 'C1' }),
    ]
    labels.update()
    expect(labels.markers).toEqual({})
  })

  it('still labels the others while all are hidden but one is selected', () => {
    state.allHidden = true
    state.selectedHex = 'sel'
    state.features = [aircraftFeature({ hex: 'sel' }), aircraftFeature({ hex: 'other' })]
    labels.update()
    expect(Object.keys(labels.markers)).toEqual(['other'])
  })

  it('never labels the selected aircraft, which shows its tag instead', () => {
    const { marker } = placeLabel()
    state.selectedHex = 'abc123'
    labels.update()
    expect(marker.removed).toBe(true)
    expect(labels.markers.abc123).toBeUndefined()
  })

  it('labels only the isolated aircraft while one is isolated', () => {
    state.features = [aircraftFeature({ hex: 'iso' }), aircraftFeature({ hex: 'other' })]
    labels.update()
    const otherMarker = labels.markers.other as unknown as FakeMarker
    state.isolatedHex = 'iso'
    labels.update()
    expect(Object.keys(labels.markers)).toEqual(['iso'])
    expect(otherMarker.removed).toBe(true)
  })

  describe('type filter', () => {
    const civil = () => aircraftFeature({ hex: 'civ', military: false })
    const military = () => aircraftFeature({ hex: 'mil', military: true })
    const vehicle = () => aircraftFeature({ hex: 'veh', category: 'C2', alt_baro: 0 })
    const tower = () => aircraftFeature({ hex: 'twr', category: 'C4', alt_baro: 0 })

    beforeEach(() => {
      state.features = [civil(), military(), vehicle(), tower()]
    })

    it('labels everything on ALL', () => {
      labels.update()
      expect(Object.keys(labels.markers).sort()).toEqual(['civ', 'mil', 'twr', 'veh'])
    })

    it('labels only civil aircraft on CIVIL (no vehicles or towers)', () => {
      state.typeFilter = 'civil'
      labels.update()
      expect(Object.keys(labels.markers)).toEqual(['civ'])
    })

    it('labels only military aircraft on MIL', () => {
      state.typeFilter = 'mil'
      labels.update()
      expect(Object.keys(labels.markers)).toEqual(['mil'])
    })

    it('hides ground vehicles when they are hidden', () => {
      state.hideGroundVehicles = true
      labels.update()
      expect(Object.keys(labels.markers).sort()).toEqual(['civ', 'mil', 'twr'])
    })

    it('hides towers when they are hidden', () => {
      state.hideTowers = true
      labels.update()
      expect(Object.keys(labels.markers).sort()).toEqual(['civ', 'mil', 'veh'])
    })

    it('keeps vehicles and towers labelled when the ADS-B layer is hidden', () => {
      state.layerVisible = false
      labels.update()
      expect(Object.keys(labels.markers).sort()).toEqual(['twr', 'veh'])
    })
  })

  it('removes the label of an aircraft that has gone', () => {
    const { marker } = placeLabel()
    state.features = []
    labels.update()
    expect(marker.removed).toBe(true)
    expect(labels.markers).toEqual({})
  })
})

// ---- update: a label already placed ----

describe('update: a label already placed', () => {
  it('moves it to where the aircraft is drawn, keeping the same marker', () => {
    const { marker } = placeLabel()
    state.interpolated.abc123 = [3, 4]
    labels.update()
    expect(labels.markers.abc123).toBe(marker as unknown as maplibregl.Marker)
    expect(marker.setLngLat).toHaveBeenLastCalledWith([3, 4])
  })

  it('falls back to the feature position when nothing is interpolated', () => {
    const { marker } = placeLabel()
    updateWith({})
    expect(marker.setLngLat).toHaveBeenLastCalledWith([-1, 51])
  })

  it('dims and undims with the aircraft’s staleness', () => {
    const { label } = placeLabel()
    state.staleHexes.add('abc123')
    labels.update()
    expect(label.style.opacity).toBe('0.3')
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.getPropertyValue('color')).toBe(cssColour('rgba(255,255,255,0.45)'))
    state.staleHexes.clear()
    labels.update()
    expect(label.style.opacity).toBe('1')
    expect(name.style.getPropertyValue('color')).toBe(cssColour('#ffffff'))
  })

  it('refreshes the name from the feed', () => {
    const { label } = placeLabel()
    updateWith({ flight: 'EZY42' })
    expect(label.querySelector('.adsb-label-name')?.textContent).toBe('EZY42')
    updateWith({ flight: '', r: 'G-ABCD' })
    expect(label.querySelector('.adsb-label-name')?.textContent).toBe('G-ABCD')
    updateWith({ flight: '', r: '' })
    expect(label.querySelector('.adsb-label-name')?.textContent).toBe('abc123')
  })

  it.each([
    [RIGHT_FACING_TRACK, '3px 12px 3px 6px'],
    [LEFT_FACING_TRACK, '3px 6px 3px 12px'],
  ])('pads the name for the side it faces (track %d)', (track, padding) => {
    const { label } = placeLabel({ track })
    labels.update()
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.padding).toBe(padding)
  })

  it('pads the name for a silhouette and moves the label as it turns', () => {
    state.iconStyle = 'silhouette'
    state.fields.always = { ...ALL_FIELDS_ON }
    const { marker, label } = placeLabel()
    host.labelOffset.mockClear()
    labels.update()
    expect(label.querySelector<HTMLElement>('.adsb-label-name')?.style.padding).toBe(
      SILHOUETTE_NAME_PADDING,
    )
    expect(host.labelOffset).toHaveBeenCalledWith(expect.anything(), false)
    expect(marker.setOffset).toHaveBeenCalledWith([13, 0])
  })

  it('leaves the offset alone in arrow mode', () => {
    const { marker } = placeLabel()
    labels.update()
    expect(marker.setOffset).not.toHaveBeenCalled()
  })

  it('rotates and recolours the arrow as the aircraft turns and climbs', () => {
    state.altitudeColouring = true
    const { label } = placeLabel({ track: 270, alt_baro: 10000 })
    updateWith({ track: 300, alt_baro: 35000 })
    const arrow = label.querySelector('.adsb-arrow') as SVGElement
    expect(arrow.style.transform).toBe('rotate(300deg)')
    expect(label.querySelector('polygon')?.getAttribute('stroke')).toBe(
      altitudeColour(35000, 'dark'),
    )
  })

  it('rotates to north when the track goes missing', () => {
    const { label } = placeLabel({ track: 270 })
    updateWith({ track: undefined })
    // track 0 is right-facing, so the label keeps its side and is updated in place.
    expect(labelOf('abc123')).toBe(label)
    expect((label.querySelector('.adsb-arrow') as SVGElement).style.transform).toBe('rotate(0deg)')
  })

  it.each([
    ['a ground vehicle', { category: 'C1' }, 'path'],
    ['a tower', { t: 'TWR' }, 'circle'],
  ])('keeps %s upright and fills its glyph', (_kind, overrides, shapeTag) => {
    const { label } = placeLabel({ ...overrides, alt_baro: 0, track: 270 })
    updateWith({ ...overrides, alt_baro: 0, track: 300, military: true })
    expect((label.querySelector('.adsb-arrow') as SVGElement).style.transform).toBe('rotate(0deg)')
    expect(label.querySelector(shapeTag)?.getAttribute('fill')).toBe('#c8ff00')
  })

  it('rebuilds the label on the other side when the aircraft turns round', () => {
    const { marker } = placeLabel({ track: RIGHT_FACING_TRACK })
    host.onLabelPlaced.mockClear()
    state.staleHexes.add('abc123')
    updateWith({ track: LEFT_FACING_TRACK })
    expect(marker.removed).toBe(true)
    const rebuilt = labels.markers.abc123 as unknown as FakeMarker
    expect(rebuilt).not.toBe(marker)
    expect(rebuilt.options.anchor).toBe('right')
    expect(rebuilt.options.offset).toEqual([-13, 0])
    expect(rebuilt.addedTo).toBe(fakeMap)
    expect(rebuilt.options.element.dataset.dir).toBe('left')
    expect(rebuilt.options.element.style.opacity).toBe('0.3')
    const name = rebuilt.options.element.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.color).toBe(cssColour('rgba(255,255,255,0.45)'))
    expect(host.onLabelPlaced).toHaveBeenCalledWith('abc123', rebuilt.options.element)
  })

  it('rebuilds a turned label undimmed when the aircraft is fresh', () => {
    placeLabel({ track: RIGHT_FACING_TRACK })
    updateWith({ track: LEFT_FACING_TRACK })
    expect(labelOf('abc123').style.opacity).toBe('')
  })

  it('rebuilds the label when alerts are switched on, to add the bell', () => {
    const { marker } = placeLabel()
    state.alertHexes.add('abc123')
    labels.update()
    expect(marker.removed).toBe(true)
    expect(labelOf('abc123').querySelector('.tag-notif-btn')).not.toBeNull()
  })

  describe('military badges', () => {
    it('adds, updates and removes the altitude badge', () => {
      state.fields.mil = { callsign: true, altitude: true }
      // Zoomed in, so the label stays placed while the aircraft is on the ground.
      fakeMap.getZoom.mockReturnValue(12)
      const { label } = placeLabel({ military: true, alt_baro: 0 })
      expect(label.querySelector('.mil-alt-badge')).toBeNull()
      updateWith({ military: true, alt_baro: 25000 })
      const badge = label.querySelector('.mil-alt-badge') as HTMLElement
      expect(badge.textContent).toBe('ALTFL250')
      updateWith({ military: true, alt_baro: 26000 })
      expect(label.querySelector('.mil-alt-badge')).toBe(badge)
      expect(badge.textContent).toBe('ALTFL260')
      state.fields.mil = { callsign: true }
      labels.update()
      expect(label.querySelector('.mil-alt-badge')).toBeNull()
    })

    it('places a new altitude badge before the TRACKING button', () => {
      state.fields.mil = { callsign: true }
      state.following = true
      state.taggedHex = 'abc123'
      const { label } = placeLabel({ military: true })
      state.fields.mil = { callsign: true, altitude: true }
      labels.update()
      const children = [...label.children]
      expect(children.indexOf(label.querySelector('.mil-alt-badge') as Element)).toBe(
        children.indexOf(label.querySelector('.mil-trk-btn') as Element) - 1,
      )
    })

    it('adds, recolours and removes the type badge', () => {
      state.fields.mil = { callsign: true }
      const { label } = placeLabel({ military: true })
      expect(label.querySelector('.mil-model-badge')).toBeNull()
      state.fields.mil = { callsign: true, aircraftType: true }
      labels.update()
      const badge = label.querySelector('.mil-model-badge') as HTMLElement
      expect(badge.textContent).toBe('A320')
      expect(badge.style.background).toBe(cssColour('#4d6600'))
      updateWith({ military: true, squawkEmerg: 1, squawk: '7700', t: 'eufi' })
      expect(badge.textContent).toBe('EUFI')
      expect(badge.style.background).toBe(cssColour('#4d0000'))
      expect(badge.style.getPropertyValue('color')).toBe(cssColour('#ff2222'))
      updateWith({ military: true, t: '' })
      expect(label.querySelector('.mil-model-badge')).toBeNull()
    })

    it('places a new type badge before the altitude badge', () => {
      state.fields.mil = { callsign: true, altitude: true }
      const { label } = placeLabel({ military: true })
      state.fields.mil = { callsign: true, altitude: true, aircraftType: true }
      labels.update()
      const children = [...label.children]
      expect(children.indexOf(label.querySelector('.mil-model-badge') as Element)).toBe(
        children.indexOf(label.querySelector('.mil-alt-badge') as Element) - 1,
      )
    })

    it('adds the TRACKING button when followed and removes it when not', () => {
      state.fields.mil = { callsign: true }
      const { label } = placeLabel({ military: true })
      expect(label.querySelector('.mil-trk-btn')).toBeNull()
      state.following = true
      state.taggedHex = 'abc123'
      labels.update()
      const button = label.querySelector('.mil-trk-btn') as HTMLElement
      expect(button.textContent).toBe('TRACKING')
      button.dispatchEvent(new MouseEvent('mouseenter'))
      expect(button.textContent).toBe('UNTRACK')
      button.dispatchEvent(new MouseEvent('mouseleave'))
      expect(button.textContent).toBe('TRACKING')
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(host.onLabelUntrack).toHaveBeenCalledWith('abc123')
      expect(host.onLabelClick).not.toHaveBeenCalled()
      // A second update while still tracked keeps the one button.
      labels.update()
      expect(label.querySelectorAll('.mil-trk-btn')).toHaveLength(1)
      state.following = false
      labels.update()
      expect(label.querySelector('.mil-trk-btn')).toBeNull()
    })
  })

  describe('civil badges', () => {
    it('adds, recolours and removes the type badge', () => {
      state.fields.civil = { callsign: true }
      const { label } = placeLabel()
      expect(label.querySelector('.civil-model-badge')).toBeNull()
      state.fields.civil = { callsign: true, aircraftType: true }
      labels.update()
      const badge = label.querySelector('.civil-model-badge') as HTMLElement
      expect(badge.textContent).toBe('A320')
      expect(badge.style.background).toBe(cssColour('#002244'))
      expect(badge.style.getPropertyValue('color')).toBe(cssColour('#00aaff'))
      updateWith({ squawkEmerg: 1, squawk: '7700', t: 'b738' })
      expect(label.querySelector('.civil-model-badge')).toBe(badge)
      expect(badge.textContent).toBe('B738')
      expect(badge.style.background).toBe(cssColour('#4d0000'))
      updateWith({ t: '' })
      expect(label.querySelector('.civil-model-badge')).toBeNull()
    })

    it('places a new type badge before the altitude badge', () => {
      state.fields.civil = { callsign: true, altitude: true }
      const { label } = placeLabel()
      state.fields.civil = { callsign: true, altitude: true, aircraftType: true }
      labels.update()
      const children = [...label.children]
      expect(children.indexOf(label.querySelector('.civil-model-badge') as Element)).toBe(
        children.indexOf(label.querySelector('.civil-alt-badge') as Element) - 1,
      )
    })

    it('adds, updates and removes the altitude badge', () => {
      state.fields.civil = { callsign: true }
      const { label } = placeLabel()
      expect(label.querySelector('.civil-alt-badge')).toBeNull()
      state.fields.civil = { callsign: true, altitude: true }
      labels.update()
      const badge = label.querySelector('.civil-alt-badge') as HTMLElement
      expect(badge.textContent).toBe('ALTFL300')
      updateWith({ alt_baro: 31000 })
      expect(label.querySelector('.civil-alt-badge')).toBe(badge)
      expect(badge.textContent).toBe('ALTFL310')
      fakeMap.getZoom.mockReturnValue(12)
      updateWith({ alt_baro: 0 })
      expect(label.querySelector('.civil-alt-badge')).toBeNull()
    })

    it('places a new altitude badge before the emergency squawk', () => {
      state.fields.civil = { callsign: true }
      const { label } = placeLabel({ squawkEmerg: 1, squawk: '7700' })
      state.fields.civil = { callsign: true, altitude: true }
      updateWith({ squawkEmerg: 1, squawk: '7700' })
      const children = [...label.children]
      expect(children.indexOf(label.querySelector('.civil-alt-badge') as Element)).toBe(
        children.indexOf(label.querySelector('.sqk-badge') as Element) - 1,
      )
    })
  })

  describe('emergency squawk', () => {
    it('turns the label red and adds the squawk badge when an emergency starts', () => {
      state.fields.civil = { callsign: true }
      const { label } = placeLabel()
      updateWith({ squawkEmerg: 1, squawk: '7500' })
      expect(label.style.background).toBe(cssColour('rgba(180,0,0,0.85)'))
      expect(label.style.gap).toBe('0px')
      const badge = label.querySelector('.sqk-badge') as HTMLElement
      expect(badge.textContent).toBe('7500')
      updateWith({ squawkEmerg: 1, squawk: '7700' })
      expect(label.querySelectorAll('.sqk-badge')).toHaveLength(1)
      expect(badge.textContent).toBe('7700')
    })

    it('restores the label when the emergency ends, padding a bare arrow label', () => {
      state.fields.civil = { callsign: true }
      const { label } = placeLabel({ squawkEmerg: 1, squawk: '7700' })
      updateWith({})
      expect(label.querySelector('.sqk-badge')).toBeNull()
      expect(label.style.background).toBe(cssColour('#000000'))
      expect(label.style.gap).toBe('5px')
      expect(label.style.paddingRight).toBe('8px')
    })

    it.each([
      ['a military type badge', { military: true }, { callsign: true, aircraftType: true }],
      ['a civil altitude badge', {}, { callsign: true, altitude: true }],
    ])(
      'does not pad the label when it ends with %s',
      (_kind, aircraft: Partial<AircraftProperties>, fields) => {
        state.fields.civil = fields
        state.fields.mil = fields
        const { label } = placeLabel({ ...aircraft, squawkEmerg: 1, squawk: '7700' })
        updateWith(aircraft)
        expect(label.style.paddingRight).toBe('0px')
      },
    )

    it('does not pad the label when it ends with a military altitude badge', () => {
      state.fields.mil = { callsign: true, altitude: true }
      const { label } = placeLabel({ military: true, squawkEmerg: 1, squawk: '7700' })
      updateWith({ military: true })
      expect(label.style.paddingRight).toBe('0px')
    })

    it('does not pad the label when it ends with the TRACKING button', () => {
      state.fields.mil = { callsign: true }
      state.following = true
      state.taggedHex = 'abc123'
      const { label } = placeLabel({ military: true, squawkEmerg: 1, squawk: '7700' })
      updateWith({ military: true })
      expect(label.style.paddingRight).toBe('0px')
    })

    it('does not pad a silhouette label when the emergency ends', () => {
      state.iconStyle = 'silhouette'
      state.fields.civil = { callsign: true }
      state.fields.always = { callsign: true }
      const { label } = placeLabel({ squawkEmerg: 1, squawk: '7700' })
      updateWith({})
      expect(label.style.gap).toBe('5px')
      expect(label.style.paddingRight).toBe('0px')
    })
  })
})

// ---- update: feeds with gaps ----

describe('update: feeds with gaps', () => {
  it('handles an aircraft with no category or type, placed and updated', () => {
    const { label } = placeLabel({ category: '', t: '' })
    updateWith({ category: '', t: '', track: 300 })
    expect(labelOf('abc123')).toBe(label)
    expect((label.querySelector('.adsb-arrow') as SVGElement).style.transform).toBe(
      'rotate(300deg)',
    )
    expect(label.querySelector('polygon')?.getAttribute('stroke')).toBe('#00aaff')
  })

  it('places a silhouette’s label for a missing track as facing north', () => {
    state.iconStyle = 'silhouette'
    state.fields.always = { callsign: true }
    const { marker } = placeLabel({ track: undefined })
    host.labelOffset.mockClear()
    labels.update()
    expect(host.labelOffset).toHaveBeenCalledWith(expect.anything(), false)
    expect(marker.setOffset).toHaveBeenCalledWith([13, 0])
  })

  it('rebuilds a left-facing label as right-facing when its track goes missing', () => {
    const { marker } = placeLabel({ track: LEFT_FACING_TRACK })
    updateWith({ track: undefined })
    expect(marker.removed).toBe(true)
    const rebuilt = labels.markers.abc123 as unknown as FakeMarker
    expect(rebuilt.options.anchor).toBe('left')
    expect(rebuilt.options.offset).toEqual([13, 0])
    expect(rebuilt.options.element.dataset.dir).toBe('right')
  })

  it('never places the others when isolation is set before the first update', () => {
    state.isolatedHex = 'iso'
    state.features = [aircraftFeature({ hex: 'iso' }), aircraftFeature({ hex: 'other' })]
    labels.update()
    expect(Object.keys(labels.markers)).toEqual(['iso'])
    expect(markerRegistry.instances).toHaveLength(1)
  })

  it('dims a military label in place', () => {
    const { label } = placeLabel({ military: true })
    state.staleHexes.add('abc123')
    labels.update()
    const name = label.querySelector('.adsb-label-name') as HTMLElement
    expect(name.style.getPropertyValue('color')).toBe(cssColour('rgba(255,255,255,0.45)'))
    expect(label.style.opacity).toBe('0.3')
  })

  it.each([
    ['civil', false],
    ['military', true],
  ])('dims a %s label that has no name segment', (_kind, military) => {
    state.fields.civil = { aircraftType: true }
    state.fields.mil = { aircraftType: true }
    state.staleHexes.add('abc123')
    // New label, dimmed.
    const { label } = placeLabel({ military })
    expect(label.querySelector('.adsb-label-name')).toBeNull()
    expect(label.style.opacity).toBe('0.3')
    // Updated in place, dimmed.
    labels.update()
    expect(labelOf('abc123')).toBe(label)
    expect(label.style.opacity).toBe('0.3')
    // Rebuilt on a turn, dimmed.
    updateWith({ military, track: LEFT_FACING_TRACK })
    const rebuilt = labelOf('abc123')
    expect(rebuilt).not.toBe(label)
    expect(rebuilt.style.opacity).toBe('0.3')
    expect(rebuilt.querySelector('.adsb-label-name')).toBeNull()
  })
})

// ---- clear ----

describe('clear', () => {
  it('removes every label from the map', () => {
    state.features = [aircraftFeature({ hex: 'a1' }), aircraftFeature({ hex: 'a2' })]
    labels.update()
    const placed = Object.values(labels.markers) as unknown as FakeMarker[]
    expect(placed).toHaveLength(2)
    labels.clear()
    expect(placed.every((marker) => marker.removed)).toBe(true)
    expect(labels.markers).toEqual({})
  })
})
