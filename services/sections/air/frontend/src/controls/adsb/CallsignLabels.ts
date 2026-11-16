/**
 * The resting callsign labels of the ADS-B map: one MapLibre marker per aircraft,
 * holding a pill with its glyph (arrow mode), callsign and whichever data fields
 * are set to show at rest.
 *
 * `AdsbLiveControl` owns one instance. It decides *when* the labels refresh
 * (each poll, zoom, filter or style change); this class decides which aircraft
 * get a label, builds and updates the markup, and places, moves and removes the
 * markers. What it needs from the control comes through {@link CallsignLabelsHost}.
 */
import * as maplibregl from 'maplibre-gl'
import {
  appendMirrored,
  createAccentBadge,
  createDimBadge,
  createDirectionArrowShape,
  createFilledDotShape,
  createGlyphSvg,
  createGlyphWell,
  createGroundVehicleShape,
  createLabelPill,
  createNameSegment,
  isLeftFacing,
} from '@sentinel/map-kit/map-label/mapLabelParts'
import { altitudeColour } from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'
import { ARROW_COLOURS } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import type { AircraftIconStyle } from '../../stores/air'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'
import { SILHOUETTE_NAME_PADDING } from './AircraftTags'

/** The data-field selections a label reads: civil, military, and those set to ALWAYS. */
export interface LabelFieldSelection {
  civil: Record<string, boolean>
  mil: Record<string, boolean>
  always: Record<string, boolean>
}

/** What the labels read from, and report back to, the control that owns them. */
export interface CallsignLabelsHost {
  /** The map the markers are added to, or undefined before the control is on one. */
  getMap(): maplibregl.Map | undefined
  /** False stops every update (labels are permanently on today; kept as the gate). */
  labelsVisible(): boolean
  /** The aircraft currently known, as map features. */
  features(): AircraftGeoFeature[]
  iconStyle(): AircraftIconStyle
  /** True when arrows take their altitude's colour. */
  altitudeColouring(): boolean
  labelFields(): LabelFieldSelection
  /** True while every aircraft is hidden (only a selected one would still show). */
  allHidden(): boolean
  /** The selected aircraft, which shows its tag instead of a resting label. */
  selectedHex(): string | null
  /** The isolated aircraft: while set, every other aircraft loses its label. */
  isolatedHex(): string | null
  typeFilter(): 'all' | 'civil' | 'mil'
  hideGroundVehicles(): boolean
  hideTowers(): boolean
  /** True when the ADS-B layer itself is shown (ground vehicles and towers ignore it). */
  layerVisible(): boolean
  /** True while the selected aircraft is being followed. */
  isFollowing(): boolean
  /** The aircraft whose selected tag is pinned, or null. */
  taggedHex(): string | null
  isAlertEnabled(hex: string): boolean
  /** True when the aircraft's last report is old enough to draw it dimmed. */
  isStale(hex: string): boolean
  /** Where the aircraft is drawn right now, or null when it is not on the map. */
  interpolatedCoords(hex: string): [number, number] | null
  /** Where a label sits off its aircraft, for the side it faces. */
  labelOffset(props: AircraftProperties, leftFacing: boolean): [number, number]
  categoryLabel(code: string): string | null
  formatAltitude(altitudeFeet: number): string
  /** A label was (re)placed: hide it if the hover tag is open over this aircraft. */
  onLabelPlaced(hex: string, labelEl: HTMLElement): void
  /** A military label's TRACKING button was clicked. */
  onLabelUntrack(hex: string): void
  onLabelEnter(hex: string, labelEl: HTMLElement): void
  onLabelLeave(): void
  /** A label was clicked: select its aircraft. */
  onLabelClick(hex: string): void
}

/** The resting callsign label markers of one ADS-B map. */
export class CallsignLabels {
  /** Each labelled aircraft's marker, by hex. */
  markers: Record<string, maplibregl.Marker> = {}

  constructor(private readonly host: CallsignLabelsHost) {}

  /**
   * The glyph drawn in a label's leading well: a rotated arrowhead for aircraft
   * in flight, or an upright tug (ground vehicles) or dot (towers), whose
   * ADS-B "track" is not a meaningful heading.
   */
  glyphMarkup(props: { category?: string; t?: string }, color: string, track: number): string {
    const cat = (props.category || '').toUpperCase()
    const isTwr = (props.t || '').toUpperCase() === 'TWR'
    if (cat === 'C1' || cat === 'C2') return createGlyphSvg(createGroundVehicleShape(color))
    if (cat === 'C3' || cat === 'C4' || cat === 'C5' || isTwr)
      return createGlyphSvg(createFilledDotShape(color))
    return createGlyphSvg(createDirectionArrowShape(color), track)
  }

  /**
   * An arrow's colour: red for an emergency, otherwise its altitude's. Always
   * the dark ramp, because an arrow sits in a black well on either map. With no
   * altitude it falls back to the military or civil colour.
   */
  arrowColour(props: AircraftProperties, isEmerg: boolean, isMil: boolean): string {
    if (isEmerg) return ARROW_COLOURS.emergency
    if (this.host.altitudeColouring() && props.alt_baro > 0) {
      return altitudeColour(props.alt_baro, 'dark')
    }
    return isMil ? ARROW_COLOURS.military : ARROW_COLOURS.civil
  }

  /** A tag's leading glyph well as markup, or nothing in silhouette mode. */
  arrowSvg(color: string, track: number, category?: string, type?: string): string {
    // In silhouette mode the map draws the aircraft itself; the tag is text only.
    if (this.host.iconStyle() === 'silhouette') return ''
    const well = createGlyphWell(this.glyphMarkup({ category, t: type }, color, track), '#000')
    return well.outerHTML
  }

  /**
   * The fields on a resting label: the civil or military selection, which in
   * silhouette mode is narrowed to those also set to ALWAYS. Hover and click
   * tags show the full selection in either mode.
   */
  restingLabelFields(isMil: boolean): Record<string, boolean> {
    const fields = isMil ? this.host.labelFields().mil : this.host.labelFields().civil
    if (this.host.iconStyle() !== 'silhouette') return fields
    return Object.fromEntries(
      Object.entries(fields).map(([field, shown]) => [
        field,
        shown && !!this.host.labelFields().always[field],
      ]),
    )
  }

  /** A resting label for this aircraft, facing its track, with its mouse handlers wired. */
  buildLabelEl(props: AircraftProperties): HTMLElement {
    const raw = (props.flight || '').trim() || (props.r || '').trim() || (props.hex || '').trim()
    const callsign = raw || 'UNKNOWN'
    const isEmerg = props.squawkEmerg === 1
    const isMil = !!props.military
    const arrowColor = this.arrowColour(props, isEmerg, isMil)
    const track = props.track ?? 0
    const fields = this.restingLabelFields(isMil)
    const has = (f: keyof typeof fields) => !!fields[f]
    const showCallsign = has('callsign')
    const showType = has('aircraftType')
    const showAlt = has('altitude')

    const leftFacing = isLeftFacing(track)
    const notifOn = this.host.isAlertEnabled(props.hex)

    const el = createLabelPill(isEmerg ? 'rgba(180,0,0,0.85)' : '#000000')
    el.dataset.dir = leftFacing ? 'left' : 'right'
    el.dataset.notif = notifOn ? '1' : '0'

    // Arrow mode leads a label with its arrow; in silhouette mode the map draws
    // the aircraft itself.
    const arrowWrap =
      this.host.iconStyle() === 'silhouette'
        ? null
        : createGlyphWell(this.glyphMarkup(props, arrowColor, track))
    const badgeColor = isEmerg ? '#ff4040' : isMil ? '#c8ff00' : 'rgba(255,255,255,0.7)'
    const nameColor = isEmerg ? '#ff4040' : '#ffffff'
    const typeBg = isEmerg ? '#4d0000' : isMil ? '#4d6600' : '#002244'
    const typeColor = isEmerg ? '#ff2222' : isMil ? '#c8ff00' : '#00aaff'
    const catLbl = this.host.categoryLabel(props.category)
    const isTracked = isMil && this.host.isFollowing() && props.hex === this.host.taggedHex()

    const dimBadge = (label: string, value: string) => createDimBadge(label, value, badgeColor)

    const makeCallsign = (side: 'left' | 'right') => {
      if (!showCallsign) return null
      const name = createNameSegment(callsign, side, nameColor)
      if (this.host.iconStyle() === 'silhouette') name.style.padding = SILHOUETTE_NAME_PADDING
      return name
    }

    const makeType = () => {
      if (!showType || !props.t) return null
      const b = createAccentBadge(props.t.toUpperCase(), typeBg, typeColor)
      b.className = isMil ? 'mil-model-badge' : 'civil-model-badge'
      return b
    }

    const makeAlt = () => {
      if (!showAlt || !props.alt_baro || props.alt_baro === 0) return null
      const b = dimBadge('ALT', this.host.formatAltitude(props.alt_baro as number))
      b.className = isMil ? 'mil-alt-badge' : 'civil-alt-badge'
      return b
    }

    const makeSqk = () => {
      if (!has('squawk') || !props.squawk) return null
      return dimBadge('SQK', props.squawk)
    }

    const makeEmergSqk = () => {
      const b = createAccentBadge(props.squawk, '#000', '#ff2222')
      b.className = 'sqk-badge'
      return b
    }

    const makeTrackBtn = () => {
      if (!isTracked) return null
      const btn = document.createElement('button')
      btn.className = 'mil-trk-btn'
      btn.textContent = 'TRACKING'
      btn.style.cssText =
        'background:none;border:none;cursor:pointer;padding:0 8px;color:#c8ff00;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.1em;align-self:stretch;display:flex;align-items:center;white-space:nowrap;'
      btn.addEventListener('mouseenter', () => {
        btn.textContent = 'UNTRACK'
      })
      btn.addEventListener('mouseleave', () => {
        btn.textContent = 'TRACKING'
      })
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.host.onLabelUntrack(props.hex)
      })
      return btn
    }

    const makeNotifBell = () => {
      if (!notifOn || isTracked) return null
      const btn = document.createElement('button')
      btn.className = 'tag-notif-btn'
      btn.dataset['hex'] = props.hex
      btn.setAttribute('aria-label', 'Toggle alerts')
      btn.style.cssText =
        'background:none;border:none;cursor:pointer;padding:0 6px;color:#c8ff00;display:flex;align-items:center;align-self:stretch;touch-action:manipulation;-webkit-tap-highlight-color:transparent;'
      btn.addEventListener('mouseenter', () => {
        btn.style.color = '#c8ff00'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.color = '#c8ff00'
      })
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/><path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/></svg>`
      return btn
    }

    // Segments in leading-edge order (arrow first, data trailing outward).
    // `appendMirrored` reverses the whole list for a left-facing aircraft, which
    // keeps the arrow on the nose and the data behind it.
    appendMirrored(
      el,
      [
        arrowWrap,
        makeCallsign(leftFacing ? 'left' : 'right'),
        makeType(),
        isEmerg ? makeEmergSqk() : makeSqk(),
        makeAlt(),
        has('heading') && props.track != null
          ? dimBadge('HDG', Math.round(props.track) + '°')
          : null,
        has('speed') && props.gs != null ? dimBadge('SPD', Math.round(props.gs) + 'kt') : null,
        has('registration') && props.r ? dimBadge('REG', props.r) : null,
        has('category') && catLbl ? dimBadge('CAT', catLbl) : null,
        makeNotifBell(),
        makeTrackBtn(),
      ],
      leftFacing,
    )
    el.addEventListener('mouseenter', () => this.host.onLabelEnter(props.hex, el))
    el.addEventListener('mouseleave', () => this.host.onLabelLeave())
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      this.host.onLabelClick(props.hex)
    })
    return el
  }

  /**
   * Brings the labels in line with the aircraft: adds a label for each one
   * that should show, updates the ones already placed, rebuilds one that has
   * turned to face the other way, and removes the rest.
   */
  update(): void {
    const map = this.host.getMap()
    if (!map || !this.host.labelsVisible()) return
    const features = this.host.features()
    const seen = new Set<string>()
    for (const f of features) {
      const hex = f.properties.hex
      if (!hex) continue
      // With no field set to ALWAYS, a silhouette has nothing to show at rest.
      if (!Object.values(this.restingLabelFields(!!f.properties.military)).some(Boolean)) continue
      seen.add(hex)
      const zoom = map.getZoom()
      const isMil = !!f.properties.military
      const cat = (f.properties.category || '').toUpperCase()
      const isGnd = ['C1', 'C2'].includes(cat)
      const isTower =
        ['C3', 'C4', 'C5'].includes(cat) || (f.properties.t || '').toUpperCase() === 'TWR'
      const iconVisible = isGnd || isTower || f.properties.alt_baro > 0 || zoom >= 10
      let typeVisible: boolean
      if (this.host.allHidden() && !this.host.selectedHex()) {
        typeVisible = false
      } else if (isGnd) {
        typeVisible = this.host.typeFilter() === 'all' && !this.host.hideGroundVehicles()
      } else if (isTower) {
        typeVisible = this.host.typeFilter() === 'all' && !this.host.hideTowers()
      } else {
        typeVisible =
          this.host.layerVisible() &&
          (this.host.typeFilter() === 'all' ||
            (this.host.typeFilter() === 'civil' && !isMil) ||
            (this.host.typeFilter() === 'mil' && isMil))
      }
      if (!iconVisible || !typeVisible) {
        if (this.markers[hex]) {
          this.markers[hex].remove()
          delete this.markers[hex]
        }
        continue
      }
      if (hex === this.host.selectedHex()) {
        if (this.markers[hex]) {
          this.markers[hex].remove()
          delete this.markers[hex]
        }
        continue
      }
      // Isolation mode: hide all markers except the isolated aircraft
      if (this.host.isolatedHex() && hex !== this.host.isolatedHex()) {
        if (this.markers[hex]) {
          this.markers[hex].remove()
          delete this.markers[hex]
        }
        continue
      }
      /* v8 ignore start -- defensive: f is from the collection so
         _interpolatedCoords always resolves; the || fallback never runs */
      const lngLat = this.host.interpolatedCoords(hex) || f.geometry.coordinates
      /* v8 ignore stop */
      const isDim = this.host.isStale(hex)
      if (this.markers[hex]) {
        this.markers[hex].setLngLat(lngLat)
        const labelEl = this.markers[hex].getElement()
        const box = labelEl
        const raw =
          (f.properties.flight || '').trim() ||
          (f.properties.r || '').trim() ||
          f.properties.hex ||
          /* v8 ignore start -- defensive: hex is always set here (blank-hex skipped above) */
          ''
        /* v8 ignore stop */
        const isEmerg = f.properties.squawkEmerg === 1
        const isMil = !!f.properties.military
        const lfields = this.restingLabelFields(isMil)
        const showType = !!lfields.aircraftType
        const showAlt = !!lfields.altitude
        box.style.background = isEmerg ? 'rgba(180,0,0,0.85)' : '#000000'
        labelEl.style.opacity = isDim ? '0.3' : '1'
        // A turning silhouette reaches further or less far towards its label.
        if (this.host.iconStyle() === 'silhouette') {
          const facingLeft = isLeftFacing(f.properties.track ?? 0)
          this.markers[hex].setOffset(this.host.labelOffset(f.properties, facingLeft))
        }
        const arrowSvg = box.querySelector('.adsb-arrow') as SVGElement | null
        /* v8 ignore start -- defensive: a built label always contains its arrow svg */
        if (arrowSvg) {
          /* v8 ignore stop */
          const arrowColor = this.arrowColour(f.properties, isEmerg, isMil)
          const cat = (f.properties.category || '').toUpperCase()
          const isTwr = (f.properties.t || '').toUpperCase() === 'TWR'
          const isGndOrTower = ['C1', 'C2', 'C3', 'C4', 'C5'].includes(cat) || isTwr
          arrowSvg.style.transform = `rotate(${isGndOrTower ? 0 : (f.properties.track ?? 0)}deg)`
          // The first shape carries the colour: the vehicle's body or the tower's
          // dot (filled), or the aircraft arrow (outlined).
          const shape = arrowSvg.querySelector('path, polygon, rect, circle') as SVGElement | null
          /* v8 ignore start -- defensive: the arrow svg always contains its shape node */
          if (shape) {
            /* v8 ignore stop */
            if (isGndOrTower) {
              shape.setAttribute('fill', arrowColor)
            } else {
              shape.setAttribute('stroke', arrowColor)
            }
          }
        }
        const newDir = isLeftFacing(f.properties.track ?? 0) ? 'left' : 'right'
        const newNotif = this.host.isAlertEnabled(hex) ? '1' : '0'
        if (box.dataset.dir !== newDir || box.dataset.notif !== newNotif) {
          // Direction or notification state changed — recreate the marker
          this.markers[hex].remove()
          delete this.markers[hex]
          const labelEl2 = this.buildLabelEl(f.properties)
          if (isDim) {
            labelEl2.style.opacity = '0.3'
            const nameSpan2 = labelEl2.querySelector('.adsb-label-name') as HTMLElement | null
            if (nameSpan2) nameSpan2.style.color = 'rgba(255,255,255,0.45)'
          }
          const isLeftFacing2 = isLeftFacing(f.properties.track ?? 0)
          const anchor2 = (isLeftFacing2 ? 'right' : 'left') as 'right' | 'left'
          const offset2 = this.host.labelOffset(f.properties, isLeftFacing2)
          this.markers[hex] = new maplibregl.Marker({
            element: labelEl2,
            anchor: anchor2,
            offset: offset2,
          })
            .setLngLat(lngLat)
            .addTo(map)
          this.host.onLabelPlaced(hex, labelEl2)
          continue
        }
        const nameSpan = box.querySelector('.adsb-label-name') as HTMLElement | null
        /* v8 ignore start -- defensive: raw is always truthy (hex present), so the || never runs */
        if (nameSpan) nameSpan.textContent = raw || 'UNKNOWN'
        /* v8 ignore stop */
        const arrowNamePad = box.dataset.dir === 'left' ? '3px 6px 3px 12px' : '3px 12px 3px 6px'
        const namePad =
          this.host.iconStyle() === 'silhouette' ? SILHOUETTE_NAME_PADDING : arrowNamePad
        if (isMil) {
          const dimColor = isDim
            ? 'color:rgba(255,255,255,0.45) !important'
            : 'color:#ffffff !important'
          if (nameSpan)
            nameSpan.style.cssText =
              dimColor + `;padding:${namePad};display:flex;align-items:center;`
          const isTracked = this.host.isFollowing() && hex === this.host.taggedHex()
          const hasBadge = showType && !!f.properties.t
          // alt badge
          let altBadge = box.querySelector('.mil-alt-badge') as HTMLElement | null
          if (showAlt && f.properties.alt_baro && f.properties.alt_baro !== 0) {
            if (!altBadge) {
              altBadge = document.createElement('span')
              altBadge.className = 'mil-alt-badge'
              altBadge.style.cssText =
                'background:#000000;color:#c8ff00 !important;font-size:12px;font-weight:700;padding:0 7px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;gap:4px;'
              altBadge.innerHTML =
                '<span style="opacity:0.45;font-weight:600;font-size:10px;letter-spacing:.12em">ALT</span><span></span>'
              box.insertBefore(
                altBadge,
                box.querySelector('.mil-trk-btn') || box.querySelector('.sqk-badge') || null,
              )
            }
            ;(altBadge.querySelector('span:last-child') as HTMLElement).textContent =
              this.host.formatAltitude(f.properties.alt_baro)
          } else if (altBadge) {
            altBadge.remove()
          }
          let modelBadge = box.querySelector('.mil-model-badge') as HTMLElement | null
          if (hasBadge) {
            if (!modelBadge) {
              modelBadge = document.createElement('span')
              modelBadge.className = 'mil-model-badge'
              box.insertBefore(
                modelBadge,
                box.querySelector('.mil-alt-badge') ||
                  box.querySelector('.mil-trk-btn') ||
                  box.querySelector('.sqk-badge') ||
                  null,
              )
            }
            modelBadge.style.cssText = `background:${isEmerg ? '#4d0000' : '#4d6600'};color:${isEmerg ? '#ff2222' : '#c8ff00'} !important;font-size:12px;font-weight:700;padding:0 7px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;`
            modelBadge.textContent = f.properties.t.toUpperCase()
          } else if (modelBadge) {
            modelBadge.remove()
          }
          let trkBtn = box.querySelector('.mil-trk-btn') as HTMLElement | null
          if (isTracked && !trkBtn) {
            trkBtn = document.createElement('button')
            trkBtn.className = 'mil-trk-btn'
            trkBtn.textContent = 'TRACKING'
            trkBtn.style.cssText =
              'background:none;border:none;cursor:pointer;padding:0 8px;color:#c8ff00;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.1em;align-self:stretch;display:flex;align-items:center;white-space:nowrap;'
            trkBtn.addEventListener('mouseenter', () => {
              ;(trkBtn as HTMLElement).textContent = 'UNTRACK'
            })
            trkBtn.addEventListener('mouseleave', () => {
              ;(trkBtn as HTMLElement).textContent = 'TRACKING'
            })
            trkBtn.addEventListener('click', (e) => {
              e.stopPropagation()
              this.host.onLabelUntrack(hex)
            })
            box.appendChild(trkBtn)
          } else if (!isTracked && trkBtn) {
            trkBtn.remove()
          }
        } else {
          const dimColor = isDim
            ? 'color:rgba(255,255,255,0.45) !important'
            : 'color:#ffffff !important'
          if (nameSpan)
            nameSpan.style.cssText =
              dimColor + `;padding:${namePad};display:flex;align-items:center;`
          let civilBadge = box.querySelector('.civil-model-badge') as HTMLElement | null
          if (showType && f.properties.t) {
            if (!civilBadge) {
              civilBadge = document.createElement('span')
              civilBadge.className = 'civil-model-badge'
              box.insertBefore(
                civilBadge,
                box.querySelector('.civil-alt-badge') || box.querySelector('.sqk-badge') || null,
              )
            }
            civilBadge.style.cssText = `background:${isEmerg ? '#4d0000' : '#002244'};color:${isEmerg ? '#ff2222' : '#00aaff'} !important;font-size:12px;font-weight:700;padding:0 7px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;`
            civilBadge.textContent = f.properties.t.toUpperCase()
          } else {
            civilBadge?.remove()
          }
          let altBadge = box.querySelector('.civil-alt-badge') as HTMLElement | null
          if (showAlt && f.properties.alt_baro && f.properties.alt_baro !== 0) {
            if (!altBadge) {
              altBadge = document.createElement('span')
              altBadge.className = 'civil-alt-badge'
              altBadge.style.cssText =
                'background:rgba(0,0,0,0.5);color:rgba(255,255,255,0.7) !important;font-size:12px;font-weight:700;padding:0 7px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;gap:4px;'
              altBadge.innerHTML =
                '<span style="opacity:0.45;font-weight:600;font-size:10px;letter-spacing:.12em">ALT</span><span></span>'
              box.insertBefore(altBadge, box.querySelector('.sqk-badge') || null)
            }
            ;(altBadge.querySelector('span:last-child') as HTMLElement).textContent =
              this.host.formatAltitude(f.properties.alt_baro)
          } else {
            altBadge?.remove()
          }
        }
        let badge = box.querySelector('.sqk-badge') as HTMLElement | null
        if (isEmerg) {
          box.style.gap = '0'
          if (!badge) {
            badge = document.createElement('span')
            badge.className = 'sqk-badge'
            badge.style.cssText =
              'background:#000;color:#ff2222 !important;font-size:12px;font-weight:700;padding:0 7px;letter-spacing:.05em;align-self:stretch;display:flex;align-items:center;'
            box.appendChild(badge)
          }
          badge.textContent = f.properties.squawk
        } else if (badge) {
          badge.remove()
          box.style.gap = '5px'
          if (
            this.host.iconStyle() !== 'silhouette' &&
            !box.querySelector('.mil-model-badge') &&
            !box.querySelector('.mil-trk-btn') &&
            !box.querySelector('.mil-alt-badge') &&
            !box.querySelector('.civil-alt-badge')
          ) {
            box.style.paddingRight = '8px'
          }
        }
      } else {
        const labelEl = this.buildLabelEl(f.properties)
        if (isDim) {
          labelEl.style.opacity = '0.3'
          const nameSpan = labelEl.querySelector('.adsb-label-name') as HTMLElement | null
          if (nameSpan) nameSpan.style.color = 'rgba(255,255,255,0.45)'
        }
        const labelLeftFacing = isLeftFacing(f.properties.track ?? 0)
        const anchor = (labelLeftFacing ? 'right' : 'left') as 'right' | 'left'
        const markerOffset = this.host.labelOffset(f.properties, labelLeftFacing)
        const marker = new maplibregl.Marker({ element: labelEl, anchor, offset: markerOffset })
          .setLngLat(lngLat)
          .addTo(map)
        this.markers[hex] = marker
        this.host.onLabelPlaced(hex, labelEl)
      }
    }
    for (const hex of Object.keys(this.markers)) {
      if (!seen.has(hex)) {
        this.markers[hex].remove()
        delete this.markers[hex]
      }
    }
  }

  /** Removes every label from the map. */
  clear(): void {
    for (const marker of Object.values(this.markers)) marker.remove()
    this.markers = {}
  }
}
