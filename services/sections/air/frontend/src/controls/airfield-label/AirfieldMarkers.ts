/**
 * Airport and military base labels, drawn as a map layer beneath the aircraft.
 *
 * Flat labels at aircraft tag size, in a darker shade of the map's own sea so they
 * sit into the map: a dot on the site, blue for civil and green for military,
 * then the name. Each is rendered to a map image rather than built as an HTML
 * marker, because HTML markers always sit above the map canvas and so above every
 * aircraft.
 */
import type * as maplibregl from 'maplibre-gl'
import { isBrightBasemap } from '@sentinel/map-kit/utils/mapTheme'

/** Whose airfield it is, which sets its colours. */
export type AirfieldKind = 'civil' | 'military'

/** One airfield on the map. */
export interface AirfieldSite {
  name: string
  coordinates: [number, number]
  onClick: () => void
}

/** The layer each kind draws, for `AdsbLiveControl` to keep beneath the aircraft. */
export const AIRFIELD_LAYER_IDS: Readonly<Record<AirfieldKind, string>> = {
  civil: 'airfield-labels-civil',
  military: 'airfield-labels-military',
}

/** The dot's colour per kind. */
const DOT_COLOURS: Readonly<Record<AirfieldKind, string>> = {
  civil: '#00aaff',
  military: '#c8ff00',
}

/**
 * Label fill per basemap: the sea's hue, darkened. The dark map's water is
 * `#38435C`, about `#242C3C` once dimmed; the light map's is `#AAD3DF`. Both stay
 * dark enough for white text and the coloured dots.
 */
export const AIRFIELD_LABEL_FILLS = { dark: '#1a2130', light: '#274f60' } as const

const FONT_FAMILY = "'Barlow Condensed', 'Barlow', sans-serif"
const NAME_FONT = `400 14px ${FONT_FAMILY}`

/** Label height, and the width of the square well the dot sits in, in CSS pixels. */
const LABEL_HEIGHT_PX = 26
const DOT_RADIUS_PX = 3.5

const NAME_PADDING_PX = 10
const NAME_LETTER_SPACING = '1.68px'

/** Drawn at this multiple of CSS pixels, so labels stay sharp on high-density screens. */
const PIXEL_RATIO = 2

/** Render one site's label: dot, then name. */
function renderLabel(site: AirfieldSite, kind: AirfieldKind, fill: string): ImageData | null {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return null
  const name = site.name.toUpperCase()

  // The drawn ink, not the advance width: letter spacing trails the last glyph
  // and glyphs carry side bearings, either of which would make the padding on
  // the two sides differ.
  context.font = NAME_FONT
  context.letterSpacing = NAME_LETTER_SPACING
  const metrics = context.measureText(name)
  const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
  const width = LABEL_HEIGHT_PX + inkWidth + NAME_PADDING_PX

  // Resizing a canvas resets its context, so sizing comes after measuring.
  canvas.width = Math.ceil(width * PIXEL_RATIO)
  canvas.height = LABEL_HEIGHT_PX * PIXEL_RATIO
  context.scale(PIXEL_RATIO, PIXEL_RATIO)
  context.textBaseline = 'middle'

  context.fillStyle = fill
  context.fillRect(0, 0, width, LABEL_HEIGHT_PX)
  context.fillStyle = DOT_COLOURS[kind]
  context.beginPath()
  context.arc(LABEL_HEIGHT_PX / 2, LABEL_HEIGHT_PX / 2, DOT_RADIUS_PX, 0, 2 * Math.PI)
  context.fill()

  context.fillStyle = '#ffffff'
  context.font = NAME_FONT
  context.letterSpacing = NAME_LETTER_SPACING
  const nameLeft = LABEL_HEIGHT_PX + metrics.actualBoundingBoxLeft
  context.fillText(name, nameLeft, LABEL_HEIGHT_PX / 2 + 0.5)
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
    await document.fonts.load(NAME_FONT)
    if (this._map.getLayer(this._layerId)) return
    const palette = isBrightBasemap() ? 'light' : 'dark'
    const features = this._sites.map((site, siteIndex) => {
      // Named for the palette: a theme change must not reuse the other map's fill.
      const imageId = `${this._layerId}:${palette}:${siteIndex}`
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
