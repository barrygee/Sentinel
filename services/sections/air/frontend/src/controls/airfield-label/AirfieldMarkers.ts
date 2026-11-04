/**
 * Airport and military base labels, drawn as a map layer beneath the aircraft.
 *
 * They follow the design of the Land map's repeaters and the aircraft tag: a dot
 * on the site, the ICAO code in a block coloured blue for civil and green for
 * military, then the name. Rounded corners, a charcoal fill and a thin coloured
 * outline set them apart from an aircraft's square black tag at the same size.
 * Each is rendered to a map image rather than built as an HTML marker, because
 * HTML markers always sit above the map canvas and so above every aircraft.
 */
import type * as maplibregl from 'maplibre-gl'

/** Whose airfield it is, which sets its colours. */
export type AirfieldKind = 'civil' | 'military'

/** One airfield on the map. */
export interface AirfieldSite {
  name: string
  /** ICAO code; a site without one shows its name alone. */
  code?: string
  coordinates: [number, number]
  onClick: () => void
}

/** The layer each kind draws, for `AdsbLiveControl` to keep beneath the aircraft. */
export const AIRFIELD_LAYER_IDS: Readonly<Record<AirfieldKind, string>> = {
  civil: 'airfield-labels-civil',
  military: 'airfield-labels-military',
}

/** The dot and code text, and the code block's fill, per kind. */
const KIND_COLOURS: Readonly<Record<AirfieldKind, { accent: string; block: string }>> = {
  civil: { accent: '#00aaff', block: '#002244' },
  military: { accent: '#c8ff00', block: '#4d6600' },
}

const FONT_FAMILY = "'Barlow Condensed', 'Barlow', sans-serif"
const NAME_FONT = `400 14px ${FONT_FAMILY}`
const CODE_FONT = `700 12px ${FONT_FAMILY}`

/** Label height, and the width of the square well the dot sits in, in CSS pixels. */
const LABEL_HEIGHT_PX = 26
const DOT_RADIUS_PX = 3.5

const NAME_PADDING_PX = 10
const CODE_PADDING_PX = 7
const NAME_LETTER_SPACING = '1.68px'
const CODE_LETTER_SPACING = '0.6px'

/** Corner radius and fill: what sets a place apart from an aircraft's square black tag. */
const CORNER_RADIUS_PX = 6
const LABEL_FILL = '#1a1e26'

/** Drawn at this multiple of CSS pixels, so labels stay sharp on high-density screens. */
const PIXEL_RATIO = 2

/** Render one site's label: dot, then code, then name. */
function renderLabel(site: AirfieldSite, kind: AirfieldKind): ImageData | null {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null
  const { accent, block } = KIND_COLOURS[kind]
  const name = site.name.toUpperCase()

  // The drawn ink, not the advance width: letter spacing trails the last glyph
  // and glyphs carry side bearings, either of which would make the padding on
  // the two sides differ.
  const measure = (text: string, font: string, letterSpacing: string) => {
    context.font = font
    context.letterSpacing = letterSpacing
    const metrics = context.measureText(text)
    return {
      inkLeft: metrics.actualBoundingBoxLeft,
      inkWidth: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    }
  }
  const codeInk = site.code ? measure(site.code, CODE_FONT, CODE_LETTER_SPACING) : null
  const nameInk = measure(name, NAME_FONT, NAME_LETTER_SPACING)
  const codeWidth = codeInk ? codeInk.inkWidth + 2 * CODE_PADDING_PX : 0
  const nameWidth = nameInk.inkWidth + 2 * NAME_PADDING_PX
  const width = LABEL_HEIGHT_PX + codeWidth + nameWidth

  // Resizing a canvas resets its context, so sizing comes after measuring.
  canvas.width = Math.ceil(width * PIXEL_RATIO)
  canvas.height = LABEL_HEIGHT_PX * PIXEL_RATIO
  context.scale(PIXEL_RATIO, PIXEL_RATIO)
  context.textBaseline = 'middle'

  // Inset half the outline's width, so the outline stays inside the image.
  const outline = (): void => {
    context.beginPath()
    context.roundRect(0.5, 0.5, width - 1, LABEL_HEIGHT_PX - 1, CORNER_RADIUS_PX)
  }
  context.save()
  outline()
  context.clip()
  context.fillStyle = LABEL_FILL
  context.fillRect(0, 0, width, LABEL_HEIGHT_PX)
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
    const codeLeft = LABEL_HEIGHT_PX + CODE_PADDING_PX + codeInk.inkLeft
    context.fillText(site.code, codeLeft, LABEL_HEIGHT_PX / 2 + 0.5)
  }

  context.fillStyle = '#ffffff'
  context.font = NAME_FONT
  context.letterSpacing = NAME_LETTER_SPACING
  const nameLeft = LABEL_HEIGHT_PX + codeWidth + NAME_PADDING_PX + nameInk.inkLeft
  context.fillText(name, nameLeft, LABEL_HEIGHT_PX / 2 + 0.5)
  context.restore()

  context.strokeStyle = accent
  context.lineWidth = 1
  outline()
  context.stroke()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

/** One control's airfield labels. */
export class AirfieldMarkers {
  private _visible = false
  private readonly _layerId: string
  private readonly _sourceId: string

  private readonly _onClick = (
    event: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
  ): void => {
    // An aircraft over the label takes the click.
    if (this._map.getLayer('adsb-hit')) {
      const aircraft = this._map.queryRenderedFeatures(event.point, { layers: ['adsb-hit'] })
      if (aircraft.length > 0) return
    }
    const siteIndex = event.features?.[0]?.properties.siteIndex as number | undefined
    if (siteIndex !== undefined) this._sites[siteIndex]?.onClick()
  }
  private readonly _onEnter = (): void => {
    this._map.getCanvas().style.cursor = 'pointer'
  }
  private readonly _onLeave = (): void => {
    this._map.getCanvas().style.cursor = ''
  }

  constructor(
    private readonly _map: maplibregl.Map,
    private readonly _sites: readonly AirfieldSite[],
    private readonly _kind: AirfieldKind,
  ) {
    this._layerId = AIRFIELD_LAYER_IDS[_kind]
    this._sourceId = this._layerId
  }

  /**
   * Add the images, source and layer. Safe to repeat: a style reload drops all
   * three. Waits for the label font, because a canvas won't load it itself.
   */
  async attach(): Promise<void> {
    await Promise.all([document.fonts.load(NAME_FONT), document.fonts.load(CODE_FONT)])
    if (this._map.getLayer(this._layerId)) return
    const features = this._sites.map((site, siteIndex) => {
      const imageId = `${this._layerId}:${siteIndex}`
      const image = renderLabel(site, this._kind)
      if (image && !this._map.hasImage(imageId)) {
        this._map.addImage(imageId, image, { pixelRatio: PIXEL_RATIO })
      }
      return {
        type: 'Feature' as const,
        properties: { imageId, siteIndex },
        geometry: { type: 'Point' as const, coordinates: site.coordinates },
      }
    })
    this._map.addSource(this._sourceId, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    })
    // Below the aircraft when they are already on the map; `AdsbLiveControl`
    // keeps it there when they arrive afterwards.
    const belowAircraft = this._map.getLayer('adsb-trail-line') ? 'adsb-trail-line' : undefined
    this._map.addLayer(
      {
        id: this._layerId,
        type: 'symbol',
        source: this._sourceId,
        layout: {
          'icon-image': ['get', 'imageId'],
          'icon-anchor': 'left',
          // Pulled back half the dot's well, so the dot sits on the site.
          'icon-offset': [-LABEL_HEIGHT_PX / 2, 0],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          visibility: this._visible ? 'visible' : 'none',
        },
      },
      belowAircraft,
    )
    this._map.off('click', this._layerId, this._onClick)
    this._map.on('click', this._layerId, this._onClick)
    this._map.off('mouseenter', this._layerId, this._onEnter)
    this._map.on('mouseenter', this._layerId, this._onEnter)
    this._map.off('mouseleave', this._layerId, this._onLeave)
    this._map.on('mouseleave', this._layerId, this._onLeave)
  }

  /** Show or hide the labels. */
  setVisible(visible: boolean): void {
    this._visible = visible
    if (this._map.getLayer(this._layerId)) {
      this._map.setLayoutProperty(this._layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
}
