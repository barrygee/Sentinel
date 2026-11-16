import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

import { AircraftTags, SILHOUETTE_NAME_PADDING, type AircraftTagsHost } from './AircraftTags'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'
import { silhouetteSideReachPx } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'

// ---- Fixtures ----

// isLeftFacing reads 1–189° as left-facing (the tag sits on the aircraft's left).
const RIGHT_FACING_TRACK = 270
const LEFT_FACING_TRACK = 90
const A320_SILHOUETTE = 'aircraft-silhouette:type:A320:civil'

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

/** A host whose state each test sets directly; every callback is a spy. */
function createHost() {
  const fakeMap = { getZoom: vi.fn(() => 5) }
  const state = {
    map: fakeMap as unknown as maplibregl.Map | null,
    iconStyle: 'arrow' as 'arrow' | 'silhouette',
    allHidden: false,
    selectedHex: null as string | null,
    following: false,
    civilFields: { ...ALL_FIELDS_ON } as Record<string, boolean>,
    militaryFields: { ...ALL_FIELDS_ON } as Record<string, boolean>,
    alertHexes: new Set<string>(),
    interpolated: {} as Record<string, [number, number]>,
    restingLabels: {} as Record<string, HTMLElement>,
  }
  const host = {
    getMap: vi.fn(() => state.map as maplibregl.Map),
    iconStyle: vi.fn(() => state.iconStyle),
    allHidden: vi.fn(() => state.allHidden),
    selectedHex: vi.fn(() => state.selectedHex),
    isFollowing: vi.fn(() => state.following),
    tagFields: vi.fn((military: boolean) => (military ? state.militaryFields : state.civilFields)),
    isAlertEnabled: vi.fn((hex: string) => state.alertHexes.has(hex)),
    interpolatedCoords: vi.fn((hex: string) => state.interpolated[hex] ?? null),
    restingLabel: vi.fn((hex: string) => state.restingLabels[hex]),
    categoryLabel: vi.fn((code: string) => (code ? `CAT-${code}` : null)),
    formatAltitude: vi.fn((altitudeFeet: number) => `ALT${altitudeFeet}`),
    arrowColour: vi.fn(
      (_props: AircraftProperties, isEmergency: boolean, isMilitary: boolean) =>
        `colour-${isEmergency ? 'emerg' : isMilitary ? 'mil' : 'civil'}`,
    ),
    arrowSvg: vi.fn(
      (colour: string, track: number) =>
        `<svg class="test-arrow" data-colour="${colour}" data-track="${track}"></svg>`,
    ),
    onUntrack: vi.fn(),
    onHoverTagClick: vi.fn(),
  } satisfies AircraftTagsHost
  return { host, state, fakeMap }
}

/** Parse tag markup into its root element. */
function parseTag(markup: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = markup
  return wrapper.firstElementChild as HTMLElement
}

/** The label text of each dim badge, in the order they appear. */
function badgeLabels(tag: HTMLElement): string[] {
  return Array.from(tag.querySelectorAll('span > span:first-child'))
    .map((span) => span.textContent ?? '')
    .filter((text) => /^[A-Z]{3}$/.test(text))
}

function lastMarker(): FakeMarker {
  const marker = markerRegistry.instances.at(-1)
  if (!marker) throw new Error('no marker was created')
  return marker
}

function labelElement(direction?: 'left' | 'right'): HTMLElement {
  const element = document.createElement('div')
  if (direction) element.dataset.dir = direction
  return element
}

let hostFixture: ReturnType<typeof createHost>
let tags: AircraftTags

beforeEach(() => {
  markerRegistry.instances.length = 0
  hostFixture = createHost()
  tags = new AircraftTags(hostFixture.host)
})

afterEach(() => {
  vi.useRealTimers()
})

// ---- Markup ----

describe('AircraftTags.buildTagHTML', () => {
  it('names the aircraft by flight, then registration, then hex, then UNKNOWN', () => {
    const nameOf = (overrides: Partial<AircraftProperties>) =>
      parseTag(tags.buildTagHTML(aircraftProperties(overrides))).querySelector('.adsb-label-name')
        ?.textContent
    expect(nameOf({ flight: ' BAW123 ' })).toBe('BAW123')
    expect(nameOf({ flight: '  ', r: 'G-EUUA' })).toBe('G-EUUA')
    expect(nameOf({ flight: '', r: '', hex: 'abc123' })).toBe('abc123')
    expect(nameOf({ flight: '', r: '', hex: '' })).toBe('UNKNOWN')
  })

  it('escapes every feed value, since the tag is set with innerHTML', () => {
    const markup = tags.buildTagHTML(
      aircraftProperties({
        flight: '<img src=x onerror=alert(1)>',
        r: '<b>reg</b>',
        squawk: '<i>sq</i>',
        t: '<u>type</u>',
      }),
    )
    const tag = parseTag(markup)
    expect(tag.querySelector('img, b, i, u')).toBeNull()
    expect(tag.querySelector('.adsb-label-name')?.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(tag.textContent).toContain('<b>reg</b>')
    expect(tag.textContent).toContain('<i>sq</i>')
    expect(tag.textContent).toContain('<U>TYPE</U>')
  })

  it('leaves the callsign out when the callsign field is off', () => {
    hostFixture.state.civilFields.callsign = false
    const tag = parseTag(tags.buildTagHTML(aircraftProperties()))
    expect(tag.querySelector('.adsb-label-name')).toBeNull()
  })

  it('reads the military field set for a military aircraft and the civil set otherwise', () => {
    hostFixture.state.civilFields = { callsign: true }
    hostFixture.state.militaryFields = { callsign: true, registration: true }
    expect(badgeLabels(parseTag(tags.buildTagHTML(aircraftProperties())))).toEqual([])
    expect(
      badgeLabels(parseTag(tags.buildTagHTML(aircraftProperties({ military: true })))),
    ).toEqual(['REG'])
    expect(hostFixture.host.tagFields).toHaveBeenCalledWith(true)
    expect(hostFixture.host.tagFields).toHaveBeenCalledWith(false)
  })

  it('shows each enabled field with its formatted value', () => {
    const tag = parseTag(tags.buildTagHTML(aircraftProperties()))
    const text = tag.textContent ?? ''
    expect(text).toContain('A320')
    expect(text).toContain('SQK1000')
    expect(text).toContain('ALTALT30000')
    expect(text).toContain('HDG270°')
    expect(text).toContain('SPD402kt')
    expect(text).toContain('REGG-EUUA')
    expect(text).toContain('CATCAT-A3')
    expect(hostFixture.host.formatAltitude).toHaveBeenCalledWith(30000)
    expect(hostFixture.host.categoryLabel).toHaveBeenCalledWith('A3')
  })

  it('drops each field that is off or has no value', () => {
    hostFixture.state.civilFields = { callsign: true }
    const allOff = parseTag(tags.buildTagHTML(aircraftProperties()))
    expect(badgeLabels(allOff)).toEqual([])
    expect(allOff.textContent).not.toContain('A320')

    hostFixture.state.civilFields = { ...ALL_FIELDS_ON }
    hostFixture.host.formatAltitude.mockClear()
    const noValues = parseTag(
      tags.buildTagHTML(
        aircraftProperties({
          t: '',
          squawk: '',
          alt_baro: 0,
          track: null as unknown as number,
          gs: null as unknown as number,
          r: '',
          category: '',
        }),
      ),
    )
    expect(badgeLabels(noValues)).toEqual([])
    expect(hostFixture.host.formatAltitude).not.toHaveBeenCalled()
  })

  it('orders the fields outward from the aircraft, mirrored for a left-facing one', () => {
    const rightFacing = parseTag(
      tags.buildTagHTML(aircraftProperties({ track: RIGHT_FACING_TRACK })),
    )
    expect(badgeLabels(rightFacing)).toEqual(['SQK', 'ALT', 'HDG', 'SPD', 'REG', 'CAT'])
    const leftFacing = parseTag(tags.buildTagHTML(aircraftProperties({ track: LEFT_FACING_TRACK })))
    expect(badgeLabels(leftFacing)).toEqual(['CAT', 'REG', 'SPD', 'HDG', 'ALT', 'SQK'])
  })

  it('puts the arrow nearest the aircraft: first facing right, last facing left', () => {
    const rightFacing = parseTag(
      tags.buildTagHTML(aircraftProperties({ track: RIGHT_FACING_TRACK })),
    )
    expect(rightFacing.firstElementChild?.classList.contains('test-arrow')).toBe(true)
    const leftFacing = parseTag(tags.buildTagHTML(aircraftProperties({ track: LEFT_FACING_TRACK })))
    expect(leftFacing.lastElementChild?.classList.contains('test-arrow')).toBe(true)
    expect(hostFixture.host.arrowSvg).toHaveBeenCalledWith(
      'colour-civil',
      LEFT_FACING_TRACK,
      'A3',
      'a320',
    )
  })

  it('faces the side it is told to, whatever the track says', () => {
    const forcedLeft = parseTag(
      tags.buildTagHTML(aircraftProperties({ track: RIGHT_FACING_TRACK }), true),
    )
    expect(forcedLeft.lastElementChild?.classList.contains('test-arrow')).toBe(true)
    const forcedRight = parseTag(
      tags.buildTagHTML(aircraftProperties({ track: LEFT_FACING_TRACK }), false),
    )
    expect(forcedRight.firstElementChild?.classList.contains('test-arrow')).toBe(true)
  })

  it('treats a missing track as heading 0 (facing right)', () => {
    const tag = parseTag(
      tags.buildTagHTML(aircraftProperties({ track: null as unknown as number })),
    )
    expect(tag.firstElementChild?.getAttribute('data-track')).toBe('0')
  })

  it('pads the callsign for the arrow side in arrow mode and evenly beside a silhouette', () => {
    const paddingOf = (track: number) =>
      (
        parseTag(tags.buildTagHTML(aircraftProperties({ track }))).querySelector(
          '.adsb-label-name',
        ) as HTMLElement
      ).style.padding
    expect(paddingOf(RIGHT_FACING_TRACK)).toBe('3px 12px 3px 6px')
    expect(paddingOf(LEFT_FACING_TRACK)).toBe('3px 6px 3px 12px')
    hostFixture.state.iconStyle = 'silhouette'
    expect(paddingOf(RIGHT_FACING_TRACK)).toBe(SILHOUETTE_NAME_PADDING)
  })

  describe('emergencies', () => {
    it('colours the callsign red and always shows the squawk, in red', () => {
      hostFixture.state.civilFields = { callsign: true }
      const tag = parseTag(
        tags.buildTagHTML(aircraftProperties({ squawkEmerg: 1, squawk: '7700' })),
      )
      expect((tag.querySelector('.adsb-label-name') as HTMLElement).style.color).toBe(
        'rgb(255, 64, 64)',
      )
      const squawk = Array.from(tag.querySelectorAll('span')).find(
        (span) => span.textContent === '7700',
      ) as HTMLElement
      expect(squawk.style.color).toBe('rgb(255, 34, 34)')
      expect(hostFixture.host.arrowColour).toHaveBeenCalledWith(
        expect.objectContaining({ squawk: '7700' }),
        true,
        false,
      )
    })

    it('counts a declared emergency, but not "none"', () => {
      const callsignColour = (emergency: string) =>
        (
          parseTag(tags.buildTagHTML(aircraftProperties({ emergency }))).querySelector(
            '.adsb-label-name',
          ) as HTMLElement
        ).style.color
      expect(callsignColour('general')).toBe('rgb(255, 64, 64)')
      expect(callsignColour('none')).toBe('rgb(255, 255, 255)')
      expect(callsignColour('')).toBe('rgb(255, 255, 255)')
    })

    it('shows no squawk for an emergency without one when the field is off', () => {
      hostFixture.state.civilFields = { callsign: true }
      const tag = parseTag(tags.buildTagHTML(aircraftProperties({ squawkEmerg: 1, squawk: '' })))
      expect(tag.querySelectorAll('span')).toHaveLength(1)
    })
  })

  describe('alert bell (untracked tag)', () => {
    it('is shown only for an aircraft with alerts on', () => {
      expect(
        parseTag(tags.buildTagHTML(aircraftProperties())).querySelector('.tag-notif-btn'),
      ).toBeNull()
      hostFixture.state.alertHexes.add('abc123')
      const bell = parseTag(tags.buildTagHTML(aircraftProperties())).querySelector(
        '.tag-notif-btn',
      ) as HTMLElement
      expect(bell.dataset.hex).toBe('abc123')
      expect(bell.getAttribute('aria-label')).toBe('Toggle alerts')
      // An enabled bell is drawn without the strike-through line.
      expect(bell.querySelector('line')).toBeNull()
    })

    it('escapes the hex it carries', () => {
      const hex = '"><b>x</b>'
      hostFixture.state.alertHexes.add(hex)
      const tag = parseTag(tags.buildTagHTML(aircraftProperties({ hex })))
      expect(tag.querySelector('b')).toBeNull()
      expect((tag.querySelector('.tag-notif-btn') as HTMLElement).dataset.hex).toBe(hex)
    })

    it('sits at the outer end of the tag', () => {
      hostFixture.state.alertHexes.add('abc123')
      const rightFacing = parseTag(
        tags.buildTagHTML(aircraftProperties({ track: RIGHT_FACING_TRACK })),
      )
      expect(rightFacing.lastElementChild?.classList.contains('tag-notif-btn')).toBe(true)
      const leftFacing = parseTag(
        tags.buildTagHTML(aircraftProperties({ track: LEFT_FACING_TRACK })),
      )
      expect(leftFacing.firstElementChild?.classList.contains('tag-notif-btn')).toBe(true)
    })
  })

  describe('tracked tag', () => {
    beforeEach(() => {
      hostFixture.state.following = true
      tags.selectedHex = 'abc123'
    })

    it('carries a TRACKING button in civil blue instead of the bell', () => {
      hostFixture.state.alertHexes.add('abc123')
      const tag = parseTag(tags.buildTagHTML(aircraftProperties()))
      const followButton = tag.querySelector('.tag-follow-btn') as HTMLElement
      expect(followButton.textContent).toBe('TRACKING')
      expect(followButton.style.color).toBe('rgb(0, 170, 255)')
      expect(tag.querySelector('.tag-notif-btn')).toBeNull()
      expect(tag.lastElementChild).toBe(followButton)
    })

    it('colours the TRACKING button green for a military aircraft', () => {
      const tag = parseTag(tags.buildTagHTML(aircraftProperties({ military: true })))
      expect((tag.querySelector('.tag-follow-btn') as HTMLElement).style.color).toBe(
        'rgb(200, 255, 0)',
      )
    })

    it('faces by its track, ignoring a forced side', () => {
      const tag = parseTag(
        tags.buildTagHTML(aircraftProperties({ track: LEFT_FACING_TRACK }), false),
      )
      expect(tag.firstElementChild?.classList.contains('tag-follow-btn')).toBe(true)
      expect(tag.lastElementChild?.classList.contains('test-arrow')).toBe(true)
    })

    it('marks a tracked emergency red, by squawk or by declared emergency', () => {
      for (const emergencyProps of [{ squawkEmerg: 1 as const }, { emergency: 'general' }]) {
        hostFixture.host.arrowColour.mockClear()
        const tag = parseTag(tags.buildTagHTML(aircraftProperties(emergencyProps)))
        expect((tag.querySelector('.adsb-label-name') as HTMLElement).style.color).toBe(
          'rgb(255, 64, 64)',
        )
        expect(hostFixture.host.arrowColour).toHaveBeenCalledWith(expect.anything(), true, false)
      }
      hostFixture.host.arrowColour.mockClear()
      tags.buildTagHTML(aircraftProperties({ emergency: 'none' }))
      expect(hostFixture.host.arrowColour).toHaveBeenCalledWith(expect.anything(), false, false)
    })

    it('treats a missing track as heading 0', () => {
      const tag = parseTag(
        tags.buildTagHTML(aircraftProperties({ track: null as unknown as number })),
      )
      expect(tag.firstElementChild?.getAttribute('data-track')).toBe('0')
    })

    it('pads its callsign like the untracked tag, or leaves it out when off', () => {
      const tag = parseTag(tags.buildTagHTML(aircraftProperties({ track: LEFT_FACING_TRACK })))
      expect((tag.querySelector('.adsb-label-name') as HTMLElement).style.padding).toBe(
        '3px 6px 3px 12px',
      )
      hostFixture.state.civilFields.callsign = false
      expect(
        parseTag(tags.buildTagHTML(aircraftProperties())).querySelector('.adsb-label-name'),
      ).toBeNull()
    })

    it('is only the tagged aircraft, and only while following', () => {
      expect(
        parseTag(tags.buildTagHTML(aircraftProperties({ hex: 'other' }))).querySelector(
          '.tag-follow-btn',
        ),
      ).toBeNull()
      hostFixture.state.following = false
      expect(
        parseTag(tags.buildTagHTML(aircraftProperties())).querySelector('.tag-follow-btn'),
      ).toBeNull()
    })
  })
})

// ---- Follow button ----

describe('AircraftTags.wireTagButton', () => {
  function trackedTagElement(): { tagElement: HTMLElement; followButton: HTMLElement } {
    hostFixture.state.following = true
    tags.selectedHex = 'abc123'
    const tagElement = document.createElement('div')
    tagElement.innerHTML = tags.buildTagHTML(aircraftProperties())
    tags.wireTagButton(tagElement)
    return {
      tagElement,
      followButton: tagElement.querySelector('.tag-follow-btn') as HTMLElement,
    }
  }

  it('offers UNTRACK while the pointer is over the tag', () => {
    const { tagElement, followButton } = trackedTagElement()
    tagElement.dispatchEvent(new MouseEvent('mouseenter'))
    expect(followButton.textContent).toBe('UNTRACK')
    tagElement.dispatchEvent(new MouseEvent('mouseleave'))
    expect(followButton.textContent).toBe('TRACKING')
  })

  it('untracks on click without the click reaching the map', () => {
    const { tagElement, followButton } = trackedTagElement()
    const reachedTag = vi.fn()
    tagElement.addEventListener('click', reachedTag)
    followButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(hostFixture.host.onUntrack).toHaveBeenCalledOnce()
    expect(reachedTag).not.toHaveBeenCalled()
  })

  it('keeps a press on the button from reaching the map', () => {
    const { tagElement, followButton } = trackedTagElement()
    const reachedTag = vi.fn()
    tagElement.addEventListener('mousedown', reachedTag)
    followButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(reachedTag).not.toHaveBeenCalled()
  })

  it('does nothing to a tag without a follow button', () => {
    const tagElement = document.createElement('div')
    tagElement.innerHTML = tags.buildTagHTML(aircraftProperties())
    const before = tagElement.innerHTML
    tags.wireTagButton(tagElement)
    tagElement.dispatchEvent(new MouseEvent('mouseenter'))
    tagElement.click()
    expect(tagElement.innerHTML).toBe(before)
    expect(hostFixture.host.onUntrack).not.toHaveBeenCalled()
  })
})

// ---- Selected tag ----

describe('AircraftTags selected tag', () => {
  it('pins the tag beside a right-facing aircraft, anchored on its left', () => {
    const props = aircraftProperties({ track: RIGHT_FACING_TRACK })
    const tagElement = tags.placeSelected(props, [-1, 51])
    const marker = lastMarker()
    expect(tags.selectedMarker).toBe(marker)
    expect(marker.options).toMatchObject({ element: tagElement, anchor: 'left', offset: [-13, 0] })
    expect(marker.lngLat).toEqual([-1, 51])
    expect(marker.addedTo).toBe(hostFixture.fakeMap)
    expect(tags.selectedLeftFacing).toBe(false)
    expect(tagElement.innerHTML).toBe(tags.buildTagHTML(props))
  })

  it("pins a left-facing aircraft's tag on its right, and remembers the side", () => {
    tags.placeSelected(aircraftProperties({ track: LEFT_FACING_TRACK }), [0, 0])
    expect(lastMarker().options).toMatchObject({ anchor: 'right', offset: [13, 0] })
    expect(tags.selectedLeftFacing).toBe(true)
  })

  it('treats a missing track as facing right', () => {
    tags.placeSelected(aircraftProperties({ track: null as unknown as number }), [0, 0])
    expect(lastMarker().options.anchor).toBe('left')
  })

  it('replaces the tag already pinned', () => {
    tags.placeSelected(aircraftProperties(), [0, 0])
    const first = lastMarker()
    tags.placeSelected(aircraftProperties(), [1, 1])
    expect(first.removed).toBe(true)
    expect(tags.selectedMarker).toBe(lastMarker())
    expect(lastMarker()).not.toBe(first)
  })

  it("wires the tracked tag's UNTRACK button", () => {
    hostFixture.state.following = true
    tags.selectedHex = 'abc123'
    const tagElement = tags.placeSelected(aircraftProperties(), [0, 0])
    ;(tagElement.querySelector('.tag-follow-btn') as HTMLElement).click()
    expect(hostFixture.host.onUntrack).toHaveBeenCalledOnce()
  })

  it("refreshes the pinned tag's markup in place", () => {
    tags.placeSelected(aircraftProperties({ squawk: '1000' }), [0, 0])
    const marker = lastMarker()
    tags.refreshSelected(aircraftProperties({ squawk: '2000' }))
    expect(markerRegistry.instances).toHaveLength(1)
    expect(marker.getElement().textContent).toContain('2000')
    expect(marker.getElement().textContent).not.toContain('1000')
    expect(marker.setOffset).not.toHaveBeenCalled()
  })

  it("moves a refreshed silhouette tag to the icon's new reach, on the side it was placed", () => {
    hostFixture.state.iconStyle = 'silhouette'
    tags.placeSelected(aircraftProperties({ track: LEFT_FACING_TRACK }), [0, 0])
    const turned = aircraftProperties({
      track: LEFT_FACING_TRACK,
      silhouetteImage: A320_SILHOUETTE,
      silhouetteRotates: 1,
    })
    tags.refreshSelected(turned)
    expect(lastMarker().setOffset).toHaveBeenCalledWith(tags.labelOffset(turned, true))
  })

  it("wires the refreshed tracked tag's button", () => {
    tags.placeSelected(aircraftProperties(), [0, 0])
    hostFixture.state.following = true
    tags.selectedHex = 'abc123'
    tags.refreshSelected(aircraftProperties())
    ;(lastMarker().getElement().querySelector('.tag-follow-btn') as HTMLElement).click()
    expect(hostFixture.host.onUntrack).toHaveBeenCalledOnce()
  })

  it('ignores a refresh with no tag pinned', () => {
    expect(() => tags.refreshSelected(aircraftProperties())).not.toThrow()
    expect(markerRegistry.instances).toHaveLength(0)
  })

  it('removes the pinned tag but keeps which aircraft it belonged to', () => {
    tags.selectedHex = 'abc123'
    tags.placeSelected(aircraftProperties(), [0, 0])
    const marker = lastMarker()
    tags.removeSelected()
    expect(marker.removed).toBe(true)
    expect(tags.selectedMarker).toBeNull()
    expect(tags.selectedHex).toBe('abc123')
    expect(() => tags.removeSelected()).not.toThrow()
  })
})

// ---- Hover tag ----

describe('AircraftTags hover tag', () => {
  it('shows nothing without a map', () => {
    hostFixture.state.map = null
    tags.showHover(aircraftFeature())
    expect(markerRegistry.instances).toHaveLength(0)
    expect(tags.hoverHex).toBeNull()
  })

  it('shows nothing without a feature', () => {
    tags.showHover(null as unknown as AircraftGeoFeature)
    expect(markerRegistry.instances).toHaveLength(0)
  })

  it('shows nothing for the selected aircraft, which has its own tag', () => {
    hostFixture.state.selectedHex = 'abc123'
    tags.showHover(aircraftFeature())
    expect(markerRegistry.instances).toHaveLength(0)
  })

  it('opens below-right of a label-less aircraft in arrow mode', () => {
    tags.showHover(aircraftFeature({}, [2, 50]))
    const marker = lastMarker()
    expect(marker.options).toMatchObject({ anchor: 'top-left', offset: [14, -13] })
    expect(marker.lngLat).toEqual([2, 50])
    expect(marker.addedTo).toBe(hostFixture.fakeMap)
    expect(marker.options.element.style.pointerEvents).toBe('auto')
    expect(tags.hoverMarker).toBe(marker)
    expect(tags.hoverHex).toBe('abc123')
    expect(tags.hoverFromLabel).toBe(false)
    expect(tags.hoverLabelEl).toBeNull()
  })

  it('opens where the aircraft is drawn now, not where it was reported', () => {
    hostFixture.state.interpolated.abc123 = [3, 52]
    tags.showHover(aircraftFeature({}, [2, 50]))
    expect(lastMarker().lngLat).toEqual([3, 52])
  })

  it('builds the hover tag from the tag markup', () => {
    tags.showHover(aircraftFeature())
    expect(lastMarker().options.element.outerHTML).toContain('BAW123')
  })

  it('sits beside the icon in silhouette mode, on the side of its track', () => {
    hostFixture.state.iconStyle = 'silhouette'
    tags.showHover(aircraftFeature({ track: LEFT_FACING_TRACK }))
    const marker = lastMarker()
    expect(marker.options.anchor).toBe('right')
    expect(marker.options.offset).toEqual(tags.labelOffset(aircraftProperties(), true))
    // The text faces the same way as the anchor: arrow last for a left-facing tag.
    expect(marker.options.element.lastElementChild?.classList.contains('test-arrow')).toBe(true)
  })

  it('treats a missing track as facing right', () => {
    hostFixture.state.iconStyle = 'silhouette'
    tags.showHover(aircraftFeature({ track: null as unknown as number }))
    expect(lastMarker().options.anchor).toBe('left')
  })

  it("takes the place of the aircraft's resting label, on the side the label was drawn", () => {
    const restingLabel = labelElement('left')
    hostFixture.state.restingLabels.abc123 = restingLabel
    tags.showHover(aircraftFeature({ track: RIGHT_FACING_TRACK }))
    expect(lastMarker().options).toMatchObject({ anchor: 'right', offset: [13, 0] })
    expect(restingLabel.style.visibility).toBe('hidden')
    expect(restingLabel.style.pointerEvents).toBe('none')
    expect(tags.hoverFromLabel).toBe(true)
    expect(tags.hoverLabelEl).toBe(restingLabel)
  })

  it('falls back to the track when the resting label has no side', () => {
    hostFixture.state.restingLabels.abc123 = labelElement()
    tags.showHover(aircraftFeature({ track: LEFT_FACING_TRACK }))
    expect(lastMarker().options.anchor).toBe('right')
  })

  it("uses the label it was opened from and that label's side", () => {
    const hoveredLabel = labelElement('right')
    // Opened from a label, the resting-label lookup is skipped.
    hostFixture.state.restingLabels.abc123 = labelElement('left')
    tags.showHover(aircraftFeature({ track: LEFT_FACING_TRACK }), true, hoveredLabel, 'right')
    expect(lastMarker().options.anchor).toBe('left')
    expect(hostFixture.host.restingLabel).not.toHaveBeenCalled()
    expect(hoveredLabel.style.visibility).toBe('hidden')
    expect(tags.hoverLabelEl).toBe(hoveredLabel)
  })

  it('uses a label passed without a resting one when hovering the aircraft', () => {
    const passedLabel = labelElement()
    tags.showHover(aircraftFeature(), false, passedLabel)
    expect(tags.hoverLabelEl).toBe(passedLabel)
    expect(passedLabel.style.visibility).toBe('hidden')
    // Not from a label and no resting label, so it keeps the below-right placement.
    expect(lastMarker().options.anchor).toBe('top-left')
  })

  it('moves the tag already showing for the same aircraft instead of building another', () => {
    tags.showHover(aircraftFeature())
    hostFixture.state.interpolated.abc123 = [5, 5]
    tags.showHover(aircraftFeature())
    expect(markerRegistry.instances).toHaveLength(1)
    expect(lastMarker().setLngLat).toHaveBeenLastCalledWith([5, 5])
  })

  it('swaps which label it hides when the same aircraft is hovered from another label', () => {
    const firstLabel = labelElement('right')
    const secondLabel = labelElement('right')
    tags.showHover(aircraftFeature(), true, firstLabel, 'right')
    hostFixture.state.allHidden = true
    tags.showHover(aircraftFeature(), true, secondLabel, 'right')
    expect(markerRegistry.instances).toHaveLength(1)
    // The first label comes back as every label is now: hidden.
    expect(firstLabel.style.visibility).toBe('hidden')
    expect(firstLabel.style.pointerEvents).toBe('')
    expect(secondLabel.style.visibility).toBe('hidden')
    expect(secondLabel.style.pointerEvents).toBe('none')
    expect(tags.hoverLabelEl).toBe(secondLabel)
  })

  it('gives the first label back visible when labels are showing', () => {
    const firstLabel = labelElement('right')
    tags.showHover(aircraftFeature(), true, firstLabel, 'right')
    tags.showHover(aircraftFeature(), true, labelElement('right'), 'right')
    expect(firstLabel.style.visibility).toBe('')
  })

  it('hides a label when the tag already showing had none', () => {
    tags.showHover(aircraftFeature())
    const lateLabel = labelElement('right')
    tags.showHover(aircraftFeature(), true, lateLabel, 'right')
    expect(tags.hoverLabelEl).toBe(lateLabel)
    expect(lateLabel.style.visibility).toBe('hidden')
  })

  it('keeps the same label hidden when hovered from it again', () => {
    const label = labelElement('right')
    tags.showHover(aircraftFeature(), true, label, 'right')
    label.style.pointerEvents = 'auto'
    tags.showHover(aircraftFeature(), true, label, 'right')
    // Untouched: the swap branch did not run.
    expect(label.style.pointerEvents).toBe('auto')
  })

  it('moves without touching labels when the same aircraft is hovered off its label', () => {
    const label = labelElement('right')
    tags.showHover(aircraftFeature(), true, label, 'right')
    tags.showHover(aircraftFeature(), false)
    expect(tags.hoverLabelEl).toBe(label)
  })

  it('replaces the tag of the aircraft hovered before', () => {
    tags.showHover(aircraftFeature({ hex: 'first' }))
    const first = lastMarker()
    tags.showHover(aircraftFeature({ hex: 'second' }))
    expect(first.removed).toBe(true)
    expect(tags.hoverHex).toBe('second')
  })

  it('cancels a pending hide when shown again', () => {
    vi.useFakeTimers()
    tags.showHover(aircraftFeature())
    tags.hideHover()
    tags.showHover(aircraftFeature())
    expect(tags.hoverHideTimer).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(lastMarker().removed).toBe(false)
  })

  it('hides a short moment after the pointer leaves, not at once', () => {
    vi.useFakeTimers()
    tags.showHover(aircraftFeature())
    const marker = lastMarker()
    marker.options.element.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(79)
    expect(marker.removed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(marker.removed).toBe(true)
    expect(tags.hoverHex).toBeNull()
    expect(tags.hoverHideTimer).toBeNull()
  })

  it('stays when the pointer comes back onto the tag before it hides', () => {
    vi.useFakeTimers()
    tags.showHover(aircraftFeature())
    const marker = lastMarker()
    marker.options.element.dispatchEvent(new MouseEvent('mouseleave'))
    marker.options.element.dispatchEvent(new MouseEvent('mouseenter'))
    expect(tags.hoverHideTimer).toBeNull()
    vi.advanceTimersByTime(1000)
    expect(marker.removed).toBe(false)
  })

  it('ignores the pointer entering when no hide is pending', () => {
    tags.showHover(aircraftFeature())
    lastMarker().options.element.dispatchEvent(new MouseEvent('mouseenter'))
    expect(tags.hoverHideTimer).toBeNull()
    expect(lastMarker().removed).toBe(false)
  })

  it('restarts the delay when asked to hide again', () => {
    vi.useFakeTimers()
    tags.showHover(aircraftFeature())
    tags.hideHover()
    vi.advanceTimersByTime(50)
    tags.hideHover()
    vi.advanceTimersByTime(50)
    expect(lastMarker().removed).toBe(false)
    vi.advanceTimersByTime(30)
    expect(lastMarker().removed).toBe(true)
  })

  it('selects its aircraft when clicked', () => {
    tags.showHover(aircraftFeature())
    lastMarker().options.element.click()
    expect(hostFixture.host.onHoverTagClick).toHaveBeenCalledWith('abc123')
  })

  it('hides at once and gives back the label it covered', () => {
    const label = labelElement('right')
    tags.showHover(aircraftFeature(), true, label, 'right')
    const marker = lastMarker()
    tags.hideHoverNow()
    expect(marker.removed).toBe(true)
    expect(tags.hoverMarker).toBeNull()
    expect(label.style.visibility).toBe('')
    expect(label.style.pointerEvents).toBe('')
    expect(tags.hoverLabelEl).toBeNull()
    expect(tags.hoverHex).toBeNull()
    expect(tags.hoverFromLabel).toBe(false)
  })

  it('gives the label back hidden while every aircraft is hidden', () => {
    const label = labelElement('right')
    tags.showHover(aircraftFeature(), true, label, 'right')
    hostFixture.state.allHidden = true
    tags.hideHoverNow()
    expect(label.style.visibility).toBe('hidden')
  })

  it('hides safely when nothing is showing', () => {
    expect(() => tags.hideHoverNow()).not.toThrow()
    expect(tags.hoverHex).toBeNull()
  })
})

// ---- Placement ----

describe('AircraftTags placement', () => {
  it('anchors a tag on the side facing the aircraft', () => {
    expect(tags.tagAnchor(true)).toBe('right')
    expect(tags.tagAnchor(false)).toBe('left')
  })

  it('pulls an arrow-mode label back so its arrow sits on the aircraft', () => {
    expect(tags.labelOffset(aircraftProperties(), true)).toEqual([13, 0])
    expect(tags.labelOffset(aircraftProperties(), false)).toEqual([-13, 0])
  })

  it('pushes a silhouette-mode label clear of an aircraft with no silhouette by its blip', () => {
    hostFixture.state.iconStyle = 'silhouette'
    expect(tags.labelOffset(aircraftProperties(), false)).toEqual([18, 0])
    expect(tags.labelOffset(aircraftProperties(), true)).toEqual([-18, 0])
  })

  it("pushes a silhouette-mode label clear of the icon's edge plus a gap", () => {
    hostFixture.state.iconStyle = 'silhouette'
    const props = aircraftProperties({
      silhouetteImage: A320_SILHOUETTE,
      silhouetteRotates: 1,
      track: 45,
    })
    const rightReach = silhouetteSideReachPx('type:A320', 45, 'right')
    const leftReach = silhouetteSideReachPx('type:A320', 45, 'left')
    expect(rightReach).toBeGreaterThan(0)
    expect(tags.labelOffset(props, false)).toEqual([rightReach + 6, 0])
    expect(tags.labelOffset(props, true)).toEqual([-(leftReach + 6), 0])
  })

  it('measures a non-turning silhouette upright, whatever its track', () => {
    hostFixture.state.iconStyle = 'silhouette'
    const props = aircraftProperties({
      silhouetteImage: A320_SILHOUETTE,
      silhouetteRotates: 0,
      track: 45,
    })
    expect(tags.labelOffset(props, false)).toEqual([
      silhouetteSideReachPx('type:A320', 0, 'right') + 6,
      0,
    ])
  })

  it('treats a missing track on a turning silhouette as heading 0', () => {
    hostFixture.state.iconStyle = 'silhouette'
    const props = aircraftProperties({
      silhouetteImage: A320_SILHOUETTE,
      silhouetteRotates: 1,
      track: null as unknown as number,
    })
    expect(tags.labelOffset(props, false)).toEqual([
      silhouetteSideReachPx('type:A320', 0, 'right') + 6,
      0,
    ])
  })

  it('scales the reach with the zoomed-in silhouette size', () => {
    hostFixture.state.iconStyle = 'silhouette'
    hostFixture.fakeMap.getZoom.mockReturnValue(12)
    const props = aircraftProperties({ silhouetteImage: A320_SILHOUETTE, silhouetteRotates: 1 })
    const reach = silhouetteSideReachPx('type:A320', RIGHT_FACING_TRACK, 'right')
    expect(tags.labelOffset(props, false)[0]).toBeCloseTo(reach * 1.18 + 6)
  })
})
