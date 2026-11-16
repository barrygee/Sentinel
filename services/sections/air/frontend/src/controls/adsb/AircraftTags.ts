/**
 * The ADS-B map's two kinds of data tag: the hover tag, shown while the pointer
 * is over an aircraft or its label, and the selected tag, pinned beside the
 * selected (or tracked) aircraft. Both are MapLibre markers holding the same
 * tag markup.
 *
 * `AdsbLiveControl` owns one instance. It decides *when* a tag shows (selection,
 * follow, polling); this class builds the markup, places and moves the markers,
 * and remembers which aircraft each tag belongs to. What it needs from the
 * control comes through {@link AircraftTagsHost}.
 */
import * as maplibregl from 'maplibre-gl'
import { escapeHtml } from '@sentinel/ui/utils/escapeHtml'
import { isLeftFacing } from '@sentinel/map-kit/map-label/mapLabelParts'
import {
  parseSilhouetteImageId,
  silhouetteSideReachPx,
} from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import type { AircraftIconStyle } from '../../stores/air'
import { silhouetteZoomScale } from './adsbIconStyle'
import type { AircraftGeoFeature, AircraftProperties } from './adsbFeature'

/**
 * A callsign's padding beside a silhouette, with no arrow to balance. The right
 * side gives back the 1.68px of letter spacing (.12em at 14px) that trails the
 * last letter, so the gap measures the same on both sides.
 */
export const SILHOUETTE_NAME_PADDING = '3px 8.32px 3px 10px'

/** Pixel gap between a silhouette's edge and its label. */
const SILHOUETTE_LABEL_GAP_PX = 6

/**
 * Horizontal offset that puts a label's glyph well (26px, centred) on the
 * aircraft's position in arrow mode — the label's own arrow marks the aircraft.
 */
const ARROW_LABEL_OFFSET_PX = 13

/** How long the pointer may be off a hover tag before it goes, so moving between aircraft and tag keeps it. */
const HOVER_HIDE_DELAY_MS = 80

/** What the tags read from, and report back to, the control that owns them. */
export interface AircraftTagsHost {
  /** The map the markers are added to (set once the control is on a map). */
  getMap(): maplibregl.Map
  iconStyle(): AircraftIconStyle
  /** True while every aircraft is hidden: a revealed label must stay hidden then. */
  allHidden(): boolean
  /** The selected aircraft, which never gets a hover tag. */
  selectedHex(): string | null
  /** True while the selected aircraft is being followed (its tag shows TRACKING). */
  isFollowing(): boolean
  /** Which optional fields the tag shows, for military or civil aircraft. */
  tagFields(military: boolean): Record<string, boolean>
  /** True when alerts are on for this aircraft (the tag shows its bell). */
  isAlertEnabled(hex: string): boolean
  /** Where the aircraft is drawn right now, or null when it is not on the map. */
  interpolatedCoords(hex: string): [number, number] | null
  /** The aircraft's resting callsign label, if it has one. */
  restingLabel(hex: string): HTMLElement | undefined
  categoryLabel(code: string): string | null
  formatAltitude(altitudeFeet: number): string
  arrowColour(props: AircraftProperties, isEmergency: boolean, isMilitary: boolean): string
  arrowSvg(colour: string, track: number, category?: string, type?: string): string
  /** The tracked tag's UNTRACK button was clicked. */
  onUntrack(): void
  /** A hover tag was clicked: select its aircraft. */
  onHoverTagClick(hex: string): void
}

/** The hover and selected tag markers of one ADS-B map. */
export class AircraftTags {
  /** The aircraft the selected tag belongs to, or null when none is pinned. */
  selectedHex: string | null = null
  selectedMarker: maplibregl.Marker | null = null
  /**
   * Which way the selected tag faced when it was placed. Its anchor is fixed
   * then (a MapLibre marker's can't change), so when the aircraft turns to
   * face the other way the tag has to be placed again on its new side.
   */
  selectedLeftFacing: boolean | null = null

  hoverMarker: maplibregl.Marker | null = null
  hoverHex: string | null = null
  /** True when the hover tag opened over a resting label, which it hides while open. */
  hoverFromLabel = false
  hoverLabelEl: HTMLElement | null = null
  hoverHideTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly host: AircraftTagsHost) {}

  // ---- Markup ----

  // Every value from the feed is escaped on its way into this markup: callsigns,
  // registrations, squawks and types come off the air (anyone with a transponder
  // or a feeder can send any text), and the tag is set with innerHTML.
  /** The tag markup for this aircraft, facing `forceLeftFacing` when given, else its track. */
  buildTagHTML(props: AircraftProperties, forceLeftFacing?: boolean): string {
    const raw = (props.flight || '').trim() || (props.r || '').trim() || (props.hex || '').trim()
    const callsign = escapeHtml(raw || 'UNKNOWN')
    const isEmergency = props.squawkEmerg === 1 || (props.emergency && props.emergency !== 'none')
    // Both tag styles sit on black, so the text is always light.
    const callsignColor = isEmergency ? '#ff4040' : '#ffffff'
    const isTracked = this.host.isFollowing() && props.hex === this.selectedHex
    const isMilProps = !!props.military
    const tfieldsProps = isMilProps ? this.host.tagFields(true) : this.host.tagFields(false)
    const showCallsign = !!tfieldsProps.callsign
    const notifOn = this.host.isAlertEnabled(props.hex)
    const trkColor = isTracked ? (isMilProps ? '#c8ff00' : '#00aaff') : 'rgba(255,255,255,0.3)'
    const trkBtnText = isTracked ? 'TRACKING' : 'TRACK'
    const plainText = this.host.iconStyle() === 'silhouette'
    const trkBtn = `<button class="tag-follow-btn" style="background:none;border:none;cursor:pointer;padding:0 12px;color:${trkColor};font-family:'Barlow Condensed','Barlow',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;line-height:1;display:flex;align-items:center;align-self:stretch;touch-action:manipulation;-webkit-tap-highlight-color:transparent">${trkBtnText}</button>`
    const bellColor = notifOn ? '#c8ff00' : 'rgba(255,255,255,0.3)'
    const bellHoverHandlers = notifOn
      ? `onmouseenter="this.style.color='#c8ff00'" onmouseleave="this.style.color='#c8ff00'"`
      : ''
    const bellBtn =
      `<button class="tag-notif-btn" data-hex="${escapeHtml(String(props.hex))}" ${bellHoverHandlers} style="background:none;border:none;cursor:pointer;padding:0 6px;color:${bellColor};display:flex;align-items:center;align-self:stretch;touch-action:manipulation;-webkit-tap-highlight-color:transparent" aria-label="Toggle alerts">` +
      `<svg width="11" height="11" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block">` +
      `<path d="M6.5 1C4.015 1 2 3.015 2 5.5V9H1v1h11V9h-1V5.5C11 3.015 8.985 1 6.5 1Z" fill="currentColor"/>` +
      `<path d="M5 10.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" stroke-width="1" fill="none"/>` +
      (notifOn
        ? ''
        : `<line x1="1.5" y1="1.5" x2="11.5" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>`) +
      `</svg></button>`

    // One tag design for both icon styles.
    const callsignPx = 14
    const fieldPx = 12
    const tagStyle = () =>
      `background:#000000;color:#fff;font-family:'Barlow Condensed','Barlow',sans-serif;font-size:${callsignPx}px;font-weight:400;letter-spacing:.12em;text-transform:uppercase;display:flex;` +
      'align-items:stretch;gap:0;min-height:26px;' +
      'white-space:nowrap;user-select:none;cursor:pointer;'
    const fieldPadding = '0 7px'
    const fieldWeight = 700
    const fieldLabelWeight = 600
    const fieldAlignSelf = 'stretch'

    const _dimBadge = (label: string, value: string, badgeColor: string) =>
      `<span style="background:#000000;color:${badgeColor};font-size:${fieldPx}px;font-weight:${fieldWeight};padding:${fieldPadding};letter-spacing:.05em;align-self:${fieldAlignSelf};display:flex;align-items:center;gap:4px;"><span style="opacity:0.45;font-weight:${fieldLabelWeight};font-size:10px;letter-spacing:.12em">${label}</span><span>${escapeHtml(value)}</span></span>`

    const _buildDataBadges = (isEmerg: boolean, isMil: boolean, leftFacing: boolean): string => {
      const tfields = isMil ? this.host.tagFields(true) : this.host.tagFields(false)
      const has = (field: keyof typeof tfields) => !!tfields[field]
      const badgeColor = isEmerg ? '#ff4040' : isMil ? '#c8ff00' : 'rgba(255,255,255,0.7)'
      const typeBg = isEmerg ? '#4d0000' : isMil ? '#4d6600' : '#002244'
      const typeColor = isEmerg ? '#ff2222' : isMil ? '#c8ff00' : '#00aaff'
      const emergencySquawkColor = '#ff2222'
      const catLbl = this.host.categoryLabel(props.category)
      const altStr =
        props.alt_baro && props.alt_baro !== 0 ? this.host.formatAltitude(props.alt_baro) : null
      const sqkBadge =
        isEmerg && props.squawk
          ? `<span style="background:#000;color:${emergencySquawkColor};font-size:${fieldPx}px;font-weight:${fieldWeight};padding:${fieldPadding};letter-spacing:.05em;align-self:${fieldAlignSelf};display:flex;align-items:center;">${escapeHtml(String(props.squawk))}</span>`
          : has('squawk') && props.squawk
            ? _dimBadge('SQK', String(props.squawk), badgeColor)
            : ''
      const typeBadge =
        has('aircraftType') && props.t
          ? `<span style="background:${typeBg};color:${typeColor};font-size:${fieldPx}px;font-weight:${fieldWeight};padding:${fieldPadding};letter-spacing:.05em;align-self:${fieldAlignSelf};display:flex;align-items:center;">${escapeHtml(String(props.t).toUpperCase())}</span>`
          : ''
      const altBadge = has('altitude') && altStr ? _dimBadge('ALT', altStr, badgeColor) : ''
      const hdgBadge =
        has('heading') && props.track != null
          ? _dimBadge('HDG', Math.round(props.track) + '°', badgeColor)
          : ''
      const spdBadge =
        has('speed') && props.gs != null
          ? _dimBadge('SPD', Math.round(props.gs) + 'kt', badgeColor)
          : ''
      const regBadge =
        has('registration') && props.r ? _dimBadge('REG', String(props.r), badgeColor) : ''
      const catBadge = has('category') && catLbl ? _dimBadge('CAT', catLbl, badgeColor) : ''
      return leftFacing
        ? `${catBadge}${regBadge}${spdBadge}${hdgBadge}${altBadge}${sqkBadge}${typeBadge}`
        : `${typeBadge}${sqkBadge}${altBadge}${hdgBadge}${spdBadge}${regBadge}${catBadge}`
    }

    /**
     * Assemble the tag: one row, mirrored for a left-facing aircraft so the
     * callsign stays nearest it. Silhouette mode is the same tag without the
     * arrow, since the map draws the aircraft.
     */
    const assembleTag = (
      leftFacing: boolean,
      arrowSvg: string,
      callsignSpan: string,
      isEmerg: boolean,
      isMil: boolean,
      actionButton: string,
    ): string => {
      const dataBadges = _buildDataBadges(isEmerg, isMil, leftFacing)
      const inner = leftFacing
        ? `${actionButton}${dataBadges}${callsignSpan}${arrowSvg}`
        : `${arrowSvg}${callsignSpan}${dataBadges}${actionButton}`
      return `<div style="${tagStyle()}">${inner}</div>`
    }
    // A stacked callsign lines up with the fields under it, so it has no padding.
    const callsignPadding = (leftFacing: boolean) =>
      plainText ? SILHOUETTE_NAME_PADDING : leftFacing ? '3px 6px 3px 12px' : '3px 12px 3px 6px'

    if (isTracked) {
      const isEmerg = !!(props.squawkEmerg === 1 || (props.emergency && props.emergency !== 'none'))
      const isMil = !!props.military
      const arrowColor = this.host.arrowColour(props, isEmerg, isMil)
      const track = props.track ?? 0
      const arrowSvg = this.host.arrowSvg(arrowColor, track, props.category, props.t)
      const leftFacing = isLeftFacing(track)
      const callsignSpan = showCallsign
        ? `<span class="adsb-label-name" style="color:${callsignColor};pointer-events:none;padding:${callsignPadding(leftFacing)};display:flex;align-items:center;">${callsign}</span>`
        : ''
      return assembleTag(leftFacing, arrowSvg, callsignSpan, isEmerg, isMil, trkBtn)
    }

    const isEmerg = !!(props.squawkEmerg === 1 || (props.emergency && props.emergency !== 'none'))
    const isMil = !!props.military
    const arrowColor = this.host.arrowColour(props, isEmerg, isMil)
    const heading = props.track ?? 0
    const leftFacing = forceLeftFacing !== undefined ? forceLeftFacing : isLeftFacing(heading)
    const arrowSvg = this.host.arrowSvg(arrowColor, heading, props.category, props.t)
    const callsignSpan = showCallsign
      ? `<span class="adsb-label-name" style="color:${callsignColor};pointer-events:none;padding:${callsignPadding(leftFacing)};display:flex;align-items:center;">${callsign}</span>`
      : ''
    // Only the notification bell is shown on the untracked tag, and only when the
    // aircraft is opted-in. The track button (and the bell on hover) live in the side
    // panel now, so hover tags carry no action buttons. The tracked tag with its
    // TRACKING/untrack button is built in the isTracked branch above.
    const activeBell = notifOn ? bellBtn : ''
    return assembleTag(leftFacing, arrowSvg, callsignSpan, isEmerg, isMil, activeBell)
  }

  /**
   * Wire the follow button on a tag element. The button only renders on the
   * tracked tag (labelled TRACKING), so it always shows UNTRACK on hover and
   * untracks on click. Starting or switching tracking is initiated from the side
   * panel, not the map tag. No-op when the element has no follow button (e.g. an
   * untracked tag or a hover tag).
   */
  wireTagButton(tagElement: HTMLElement): void {
    const followButton = tagElement.querySelector('.tag-follow-btn') as HTMLElement | null
    if (!followButton) return

    followButton.addEventListener('mousedown', (event) => {
      event.stopPropagation()
    })
    tagElement.addEventListener('mouseenter', () => {
      followButton.textContent = 'UNTRACK'
    })
    tagElement.addEventListener('mouseleave', () => {
      followButton.textContent = 'TRACKING'
    })
    followButton.addEventListener('click', (event) => {
      event.stopPropagation()
      this.host.onUntrack()
    })
  }

  // ---- Selected tag ----

  /**
   * Build the selected tag for this aircraft and pin it at `coords`, replacing
   * any tag already pinned. Returns the tag's element.
   */
  placeSelected(props: AircraftProperties, coords: maplibregl.LngLatLike): HTMLElement {
    const element = document.createElement('div')
    element.innerHTML = this.buildTagHTML(props)
    this.wireTagButton(element)
    this.removeSelected()
    this.selectedMarker = this.placeMarker(element, props, coords)
    return element
  }

  /**
   * Refresh the pinned tag's markup in place, for an aircraft still facing the
   * side the tag was placed on. Silhouette mode also moves it to the icon's new
   * reach, which changes as the silhouette turns.
   */
  refreshSelected(props: AircraftProperties): void {
    /* v8 ignore start -- defensive: callers only refresh a pinned tag */
    if (!this.selectedMarker) return
    /* v8 ignore stop */
    const element = this.selectedMarker.getElement()
    element.innerHTML = this.buildTagHTML(props)
    if (this.host.iconStyle() === 'silhouette') {
      this.selectedMarker.setOffset(this.labelOffset(props, this.selectedLeftFacing as boolean))
    }
    this.wireTagButton(element)
  }

  /** Take the pinned tag off the map (the aircraft it belonged to is kept). */
  removeSelected(): void {
    if (this.selectedMarker) {
      this.selectedMarker.remove()
      this.selectedMarker = null
    }
  }

  /**
   * Pin the selected (or tracked) tag beside its aircraft on the side its text
   * was built for, remembering that side for the next poll (see
   * {@link selectedLeftFacing}).
   */
  private placeMarker(
    element: HTMLElement,
    props: AircraftProperties,
    coords: maplibregl.LngLatLike,
  ): maplibregl.Marker {
    const leftFacing = isLeftFacing(props.track ?? 0)
    this.selectedLeftFacing = leftFacing
    return new maplibregl.Marker({
      element,
      anchor: this.tagAnchor(leftFacing),
      offset: this.labelOffset(props, leftFacing),
    })
      .setLngLat(coords)
      .addTo(this.host.getMap())
  }

  // ---- Hover tag ----

  /**
   * Show the hover tag for this aircraft, or move the one already showing for
   * it. Opened over a resting label, the tag takes the label's place (hiding it)
   * and the side it was drawn on, so it doesn't jump.
   */
  showHover(
    feature: AircraftGeoFeature,
    fromLabelArgument = false,
    labelElArgument: HTMLElement | null = null,
    labelDirArgument?: 'left' | 'right',
  ): void {
    if (!feature || !this.host.getMap()) return
    const hex = feature.properties.hex
    if (hex === this.host.selectedHex()) return
    // A hover that starts on the aircraft's trail or hit area, not its label,
    // still opens where the label sits. Otherwise the tag took the label-less
    // below-right placement and jumped sideways off the resting label.
    const restingLabel = fromLabelArgument ? null : this.host.restingLabel(hex)
    const fromLabel = fromLabelArgument || !!restingLabel
    const labelEl = restingLabel ?? labelElArgument
    const labelDir = restingLabel
      ? (restingLabel.dataset.dir as 'left' | 'right' | undefined)
      : labelDirArgument
    if (this.hoverHideTimer) {
      clearTimeout(this.hoverHideTimer)
      this.hoverHideTimer = null
    }
    const coords = this.host.interpolatedCoords(hex) || feature.geometry.coordinates
    if (this.hoverHex === hex && this.hoverMarker) {
      this.hoverMarker.setLngLat(coords)
      if (fromLabel && labelEl && labelEl !== this.hoverLabelEl) {
        if (this.hoverLabelEl) {
          this.hoverLabelEl.style.visibility = this.host.allHidden() ? 'hidden' : ''
          this.hoverLabelEl.style.pointerEvents = ''
        }
        this.hoverLabelEl = labelEl
        labelEl.style.visibility = 'hidden'
        labelEl.style.pointerEvents = 'none'
      }
      return
    }
    this.hideHoverNow()
    const wrapper = document.createElement('div')
    // When showing hover tag from a label, use the label's rendered direction to avoid
    // anchor/layout mismatch if the track crossed the left/right threshold since the
    // label was last built (crossing threshold flips anchor and causes a visible jump).
    const hoverLeftFacing =
      fromLabel && labelDir ? labelDir === 'left' : isLeftFacing(feature.properties.track ?? 0)
    // Silhouette mode has no resting labels, so the hover tag is the label: it
    // sits beside the icon on the same side a label would, not below-right.
    const besideIcon = fromLabel || this.host.iconStyle() === 'silhouette'
    wrapper.innerHTML = this.buildTagHTML(
      feature.properties,
      besideIcon ? hoverLeftFacing : undefined,
    )
    const hoverElement = wrapper.firstElementChild as HTMLElement
    hoverElement.style.pointerEvents = 'auto'
    hoverElement.addEventListener('mouseenter', () => {
      if (this.hoverHideTimer) {
        clearTimeout(this.hoverHideTimer)
        this.hoverHideTimer = null
      }
    })
    hoverElement.addEventListener('mouseleave', () => this.hideHover())
    hoverElement.addEventListener('click', (event) => {
      /* v8 ignore start -- defensive: the action buttons stopPropagation, so a
         click that lands on them never reaches this tag-level handler */
      if ((event.target as HTMLElement).closest('.tag-follow-btn, .tag-notif-btn')) return
      /* v8 ignore stop */
      this.host.onHoverTagClick(hex)
    })
    // Hover tags carry no action buttons (no follow/bell), so there is nothing to
    // wire — those actions live in the side panel.
    const hoverPlacement: { anchor: maplibregl.PositionAnchor; offset: [number, number] } =
      besideIcon
        ? {
            anchor: this.tagAnchor(hoverLeftFacing),
            offset: this.labelOffset(feature.properties, hoverLeftFacing),
          }
        : { anchor: 'top-left', offset: [14, -13] }
    this.hoverMarker = new maplibregl.Marker({ element: hoverElement, ...hoverPlacement })
      .setLngLat(coords)
      .addTo(this.host.getMap())
    this.hoverHex = hex
    this.hoverFromLabel = fromLabel
    this.hoverLabelEl = labelEl
    if (labelEl) {
      labelEl.style.visibility = 'hidden'
      labelEl.style.pointerEvents = 'none'
    }
  }

  /** Hide the hover tag after a short delay (see {@link HOVER_HIDE_DELAY_MS}). */
  hideHover(): void {
    if (this.hoverHideTimer) clearTimeout(this.hoverHideTimer)
    this.hoverHideTimer = setTimeout(() => {
      this.hoverHideTimer = null
      this.hideHoverNow()
    }, HOVER_HIDE_DELAY_MS)
  }

  /** Hide the hover tag at once and give back the label it covered. */
  hideHoverNow(): void {
    if (this.hoverMarker) {
      this.hoverMarker.remove()
      this.hoverMarker = null
    }
    if (this.hoverLabelEl) {
      this.hoverLabelEl.style.visibility = this.host.allHidden() ? 'hidden' : ''
      this.hoverLabelEl.style.pointerEvents = ''
      this.hoverLabelEl = null
    }
    this.hoverHex = null
    this.hoverFromLabel = false
  }

  // ---- Placement ----

  /**
   * How far a label sits from the aircraft's position in silhouette mode: the
   * edge of its icon (at the current zoom's scale) plus a small gap. Aircraft
   * with no silhouette keep their
   * map symbol (the 24px radar blip, ground ring or tower dot), so they use
   * that symbol's half-size instead.
   */
  private silhouetteLabelDistance(props: AircraftProperties, leftFacing: boolean): number {
    const shape = parseSilhouetteImageId(props.silhouetteImage)
    if (!shape) return 12 + SILHOUETTE_LABEL_GAP_PX
    const track = props.silhouetteRotates ? (props.track ?? 0) : 0
    const reachPx = silhouetteSideReachPx(shape.shapeKey, track, leftFacing ? 'left' : 'right')
    return reachPx * silhouetteZoomScale(this.host.getMap().getZoom()) + SILHOUETTE_LABEL_GAP_PX
  }

  /**
   * Marker offset for a label anchored on the side facing away from `leftFacing`.
   *
   * Arrow mode pulls the label 13px back over the position so its glyph well —
   * the arrow — sits exactly on the aircraft. Silhouette mode pushes it the
   * other way, clear of the icon the map draws there.
   */
  labelOffset(props: AircraftProperties, leftFacing: boolean): [number, number] {
    if (this.host.iconStyle() === 'silhouette') {
      const distance = this.silhouetteLabelDistance(props, leftFacing)
      return leftFacing ? [-distance, 0] : [distance, 0]
    }
    return leftFacing ? [ARROW_LABEL_OFFSET_PX, 0] : [-ARROW_LABEL_OFFSET_PX, 0]
  }

  /** Which side of a tag sits at the aircraft. */
  tagAnchor(leftFacing: boolean): maplibregl.PositionAnchor {
    return leftFacing ? 'right' : 'left'
  }
}
