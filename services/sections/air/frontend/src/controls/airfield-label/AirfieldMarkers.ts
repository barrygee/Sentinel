/**
 * Airport and military base labels, drawn as a map layer beneath the aircraft.
 *
 * Each site is a dot, blue for civil and green for military, until it is hovered
 * or clicked. Its label then opens over the dot: flat and black at aircraft tag
 * size, with the ICAO code in a block where the site shows one, then the name.
 * Labels are rendered to map
 * images rather than built as HTML markers, because HTML markers always sit above
 * the map canvas and so above every aircraft.
 */
import type * as maplibregl from 'maplibre-gl'
import { isBrightBasemap } from '@sentinel/map-kit/utils/mapTheme'

/** Whose airfield it is, which sets its colours. */
export type AirfieldKind = 'civil' | 'military'

/** One airfield on the map. */
export interface AirfieldSite {
  /** ICAO code, drawn in a block before the name; a site without one shows its name alone. */
  code?: string
  name: string
  coordinates: [number, number]
  onClick: () => void
}

/** A pointer event delegated from the airfield layers. */
type SiteEvent = maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }

/** The dot layer of each kind. */
export const AIRFIELD_LAYER_IDS: Readonly<Record<AirfieldKind, string>> = {
  civil: 'airfield-labels-civil',
  military: 'airfield-labels-military',
}

/** The layer each kind opens its labels on. */
export const AIRFIELD_OPEN_LABEL_LAYER_IDS: Readonly<Record<AirfieldKind, string>> = {
  civil: 'airfield-labels-civil-open',
  military: 'airfield-labels-military-open',
}

/**
 * Bottom to top, for `AdsbLiveControl` to keep beneath the aircraft. Every dot
 * comes first, so an open label is never crossed by the other kind's dots.
 */
export const AIRFIELD_LAYER_ORDER: readonly string[] = [
  ...Object.values(AIRFIELD_LAYER_IDS),
  ...Object.values(AIRFIELD_OPEN_LABEL_LAYER_IDS),
]

/** The dot and code text, and the code block's fill, per kind. */
const KIND_COLOURS: Readonly<Record<AirfieldKind, { accent: string; block: string }>> = {
  civil: { accent: '#00aaff', block: '#002244' },
  military: { accent: '#c8ff00', block: '#4d6600' },
}

/** Label fill per basemap: black on both, matching the aircraft tags. */
export const AIRFIELD_LABEL_FILLS = { dark: '#000000', light: '#000000' } as const

const FONT_FAMILY = "'Barlow Condensed', 'Barlow', sans-serif"
const NAME_FONT = `400 12.5px ${FONT_FAMILY}`
const CODE_FONT = `700 12px ${FONT_FAMILY}`

/** Label height, and the width of the square well the dot sits in, in CSS pixels. */
const LABEL_HEIGHT_PX = 26
const DOT_RADIUS_PX = 3.5

/** Invisible ring around a closed dot, so it is a 19px target rather than a 7px one. */
const DOT_POINTER_RING_PX = 6

const NAME_PADDING_PX = 10
const NAME_LETTER_SPACING = '1.5px'
const CODE_PADDING_PX = 7
const CODE_LETTER_SPACING = '0.6px'

/** Drawn at this multiple of CSS pixels, so labels stay sharp on high-density screens. */
const PIXEL_RATIO = 2

/** Render one site's label: dot, then code, then name. */
function renderLabel(site: AirfieldSite, kind: AirfieldKind, fill: string): ImageData | null {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null
  const name = site.name.toUpperCase()

  // The drawn ink, not the advance width: letter spacing trails the last glyph
  // and glyphs carry side bearings, either of which would make the padding on
  // the two sides differ.
  const measureInk = (text: string, font: string, letterSpacing: string) => {
    context.font = font
    context.letterSpacing = letterSpacing
    const metrics = context.measureText(text)
    return {
      left: metrics.actualBoundingBoxLeft,
      width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    }
  }
  const codeInk = site.code ? measureInk(site.code, CODE_FONT, CODE_LETTER_SPACING) : null
  const nameInk = measureInk(name, NAME_FONT, NAME_LETTER_SPACING)
  const codeWidth = codeInk ? codeInk.width + 2 * CODE_PADDING_PX : 0
  // With no block before it, the name sits straight after the dot's well.
  const nameInset = codeInk ? NAME_PADDING_PX : 0
  const width = LABEL_HEIGHT_PX + codeWidth + nameInset + nameInk.width + NAME_PADDING_PX

  // Resizing a canvas resets its context, so sizing comes after measuring.
  canvas.width = Math.ceil(width * PIXEL_RATIO)
  canvas.height = LABEL_HEIGHT_PX * PIXEL_RATIO
  context.scale(PIXEL_RATIO, PIXEL_RATIO)
  context.textBaseline = 'middle'

  context.fillStyle = fill
  context.fillRect(0, 0, width, LABEL_HEIGHT_PX)
  const { accent, block } = KIND_COLOURS[kind]
  context.fillStyle = accent
  context.beginPath()
  context.arc(LABEL_HEIGHT_PX / 2, LABEL_HEIGHT_PX / 2, DOT_RADIUS_PX, 0, 2 * Math.PI)
  context.fill()

  if (site.code && codeInk) {
    context.fillStyle = block
    context.fillRect(LABEL_HEIGHT_PX, 0, codeWidth, LABEL_HEIGHT_PX)
    context.fillStyle = accent
    context.font = CODE_FONT
    context.letterSpacing = CODE_LETTER_SPACING
    const codeLeft = LABEL_HEIGHT_PX + CODE_PADDING_PX + codeInk.left
    context.fillText(site.code, codeLeft, LABEL_HEIGHT_PX / 2 + 0.5)
  }

  context.fillStyle = '#ffffff'
  context.font = NAME_FONT
  context.letterSpacing = NAME_LETTER_SPACING
  const nameLeft = LABEL_HEIGHT_PX + codeWidth + nameInset + nameInk.left
  context.fillText(name, nameLeft, LABEL_HEIGHT_PX / 2 + 0.5)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

/** One control's airfield labels. */
export class AirfieldMarkers {
  private _visible = false
  private readonly _dotLayerId: string
  private readonly _labelLayerId: string
  private readonly _pointerLayerIds: string[]
  private _hoveredSite: number | null = null
  private _pinnedSite: number | null = null

  private _aircraftUnder(point: maplibregl.PointLike): boolean {
    if (!this._map.getLayer('adsb-hit')) return false
    return this._map.queryRenderedFeatures(point, { layers: ['adsb-hit'] }).length > 0
  }

  /** Open the labels of the hovered and pinned sites, and only those. */
  private _applyLabelFilter(): void {
    if (this._map.getLayer(this._labelLayerId)) {
      this._map.setFilter(this._labelLayerId, this._labelFilter())
    }
  }

  private _labelFilter(): maplibregl.FilterSpecification {
    const openSites = [this._hoveredSite, this._pinnedSite].filter((site) => site !== null)
    return ['in', ['get', 'siteIndex'], ['literal', openSites]]
  }

  private readonly _onClick = (event: SiteEvent): void => {
    // An aircraft over the label takes the click.
    if (this._aircraftUnder(event.point)) return
    const siteIndex = event.features?.[0]?.properties.siteIndex as number | undefined
    if (siteIndex === undefined) return
    this._pinnedSite = siteIndex
    this._applyLabelFilter()
    this._sites[siteIndex]?.onClick()
  }
  private readonly _onMapClick = (event: maplibregl.MapMouseEvent): void => {
    if (this._pinnedSite === null) return
    const onSite = this._map.queryRenderedFeatures(event.point, {
      layers: this._pointerLayerIds,
    })
    if (onSite.length > 0) return
    this._pinnedSite = null
    this._applyLabelFilter()
  }
  private readonly _onPointerMove = (event: SiteEvent): void => {
    // An open label covers any dot beneath it, so the top feature is the one to follow.
    const siteIndex = this._aircraftUnder(event.point)
      ? null
      : ((event.features?.[0]?.properties.siteIndex as number | undefined) ?? null)
    this._map.getCanvas().style.cursor = siteIndex === null ? '' : 'pointer'
    if (siteIndex === this._hoveredSite) return
    this._hoveredSite = siteIndex
    this._applyLabelFilter()
  }
  private readonly _onPointerLeave = (): void => {
    this._map.getCanvas().style.cursor = ''
    this._hoveredSite = null
    this._applyLabelFilter()
  }

  constructor(
    private readonly _map: maplibregl.Map,
    private readonly _sites: readonly AirfieldSite[],
    private readonly _kind: AirfieldKind,
  ) {
    this._dotLayerId = AIRFIELD_LAYER_IDS[_kind]
    this._labelLayerId = AIRFIELD_OPEN_LABEL_LAYER_IDS[_kind]
    this._pointerLayerIds = [this._dotLayerId, this._labelLayerId]
  }

  /**
   * Add the images, source and layers. Safe to repeat: a style reload drops them
   * all. Waits for the label fonts, because a canvas won't load them itself.
   */
  async attach(): Promise<void> {
    await Promise.all([document.fonts.load(NAME_FONT), document.fonts.load(CODE_FONT)])
    if (this._map.getLayer(this._dotLayerId)) return
    const palette = isBrightBasemap() ? 'light' : 'dark'
    const features = this._sites.map((site, siteIndex) => {
      // Named for the palette: a theme change must not reuse the other map's fill.
      const imageId = `${this._labelLayerId}:${palette}:${siteIndex}`
      const image = renderLabel(site, this._kind, AIRFIELD_LABEL_FILLS[palette])
      if (image && !this._map.hasImage(imageId)) {
        this._map.addImage(imageId, image, { pixelRatio: PIXEL_RATIO })
      }
      return {
        type: 'Feature' as const,
        properties: { imageId, siteIndex },
        geometry: { type: 'Point' as const, coordinates: site.coordinates },
      }
    })
    this._map.addSource(this._dotLayerId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    })
    // Below the aircraft when they are already on the map; `AdsbLiveControl`
    // keeps it there when they arrive afterwards.
    const belowAircraft = this._map.getLayer('adsb-trail-line') ? 'adsb-trail-line' : undefined
    const visibility = this._visible ? 'visible' : 'none'
    this._map.addLayer(
      {
        id: this._dotLayerId,
        type: 'circle',
        source: this._dotLayerId,
        layout: { visibility },
        paint: {
          'circle-radius': DOT_RADIUS_PX,
          'circle-color': KIND_COLOURS[this._kind].accent,
          'circle-stroke-width': DOT_POINTER_RING_PX,
          'circle-stroke-color': 'rgba(0, 0, 0, 0)',
        },
      },
      belowAircraft,
    )
    this._map.addLayer(
      {
        id: this._labelLayerId,
        type: 'symbol',
        source: this._dotLayerId,
        filter: this._labelFilter(),
        layout: {
          'icon-image': ['get', 'imageId'],
          'icon-anchor': 'left',
          // Pulled back half the dot's well, so the label's dot sits on the site.
          'icon-offset': [-LABEL_HEIGHT_PX / 2, 0],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          visibility,
        },
      },
      belowAircraft,
    )
    this._map.off('click', this._pointerLayerIds, this._onClick)
    this._map.on('click', this._pointerLayerIds, this._onClick)
    this._map.off('click', this._onMapClick)
    this._map.on('click', this._onMapClick)
    this._map.off('mousemove', this._pointerLayerIds, this._onPointerMove)
    this._map.on('mousemove', this._pointerLayerIds, this._onPointerMove)
    this._map.off('mouseleave', this._pointerLayerIds, this._onPointerLeave)
    this._map.on('mouseleave', this._pointerLayerIds, this._onPointerLeave)
  }

  /** Show or hide the dots, and any open labels with them. */
  setVisible(visible: boolean): void {
    this._visible = visible
    for (const layerId of this._pointerLayerIds) {
      if (this._map.getLayer(layerId)) {
        this._map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      }
    }
  }
}
