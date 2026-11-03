/**
 * Turns silhouettes into MapLibre map images, on demand.
 *
 * Each image is named for exactly what it draws — shape and colour, e.g.
 * `aircraft-silhouette:type:A321:military` — so the map can ask for one by name
 * from a feature property, and a `styleimagemissing` handler can rebuild any
 * name it is handed. Only the shapes and colours actually on screen are ever
 * rasterised; a style reload simply asks for them again.
 *
 * Images are drawn in colour rather than as one SDF image tinted per aircraft:
 * MapLibre cannot mix SDF and plain icons in one symbol layer, and the ADS-B
 * layer still draws Sentinel's existing ground-vehicle and tower sprites.
 */
import {
  AIRCRAFT_FAMILIES,
  AIRCRAFT_FAMILY_IDS,
  type AircraftFamilyId,
} from '@sentinel/map-kit/aircraft-silhouettes/aircraftFamilies'
import {
  buildAircraftSilhouette,
  silhouetteImageSidePx,
  type AircraftSilhouette,
} from '@sentinel/map-kit/aircraft-silhouettes/aircraftSilhouette'
import { AIRCRAFT_TYPE_DIMENSIONS } from '@sentinel/map-kit/aircraft-silhouettes/aircraftTypeDimensions'

/** The three states an aircraft is coloured by, everywhere in the Air section. */
export type SilhouetteColourKey = 'civil' | 'military' | 'emergency'

/** Body colour per state — the same values the arrows, trails and labels use. */
export const SILHOUETTE_COLOURS: Readonly<Record<SilhouetteColourKey, string>> = {
  civil: '#00aaff',
  military: '#c8ff00',
  emergency: '#ff2222',
}

/** Outline colour: black keeps a silhouette readable over imagery and terrain. */
const OUTLINE_COLOUR = '#000000'

/** Outline thickness around the body, in CSS pixels. */
export const SILHOUETTE_OUTLINE_WIDTH_PX = 1

/** Image size, in CSS pixels, given to a shape key that names no known drawing. */
export const SILHOUETTE_FALLBACK_ICON_PX = 32

/**
 * Map zoom past which silhouettes are drawn {@link SILHOUETTE_ZOOMED_IN_SCALE}
 * times larger, as ADS-B Exchange does. Its switch is at zoom 8.5 on
 * OpenLayers' 256px tile grid, which is 7.5 on MapLibre's 512px grid.
 */
export const SILHOUETTE_ZOOMED_IN_THRESHOLD = 7.5

/** Icon scale once zoomed in past {@link SILHOUETTE_ZOOMED_IN_THRESHOLD}. */
export const SILHOUETTE_ZOOMED_IN_SCALE = 1.18

/** Prefix every silhouette image name carries, so a handler can recognise its own. */
export const SILHOUETTE_IMAGE_PREFIX = 'aircraft-silhouette:'

/** Name of the map image for one shape in one colour. */
export function silhouetteImageId(shapeKey: string, colourKey: SilhouetteColourKey): string {
  return `${SILHOUETTE_IMAGE_PREFIX}${shapeKey}:${colourKey}`
}

/** Whether `value` is one of the three colour keys. */
function isColourKey(value: string): value is SilhouetteColourKey {
  return value === 'civil' || value === 'military' || value === 'emergency'
}

/**
 * Split an image name back into its shape and colour.
 *
 * @returns `null` for a name that is not a well-formed silhouette image name.
 */
export function parseSilhouetteImageId(
  imageId: string,
): { shapeKey: string; colourKey: SilhouetteColourKey } | null {
  if (!imageId.startsWith(SILHOUETTE_IMAGE_PREFIX)) return null
  const remainder = imageId.slice(SILHOUETTE_IMAGE_PREFIX.length)
  const colourSeparator = remainder.lastIndexOf(':')
  if (colourSeparator <= 0) return null
  const colourKey = remainder.slice(colourSeparator + 1)
  if (!isColourKey(colourKey)) return null
  return { shapeKey: remainder.slice(0, colourSeparator), colourKey }
}

/** What one shape key draws: its outline and whether it turns with the track. */
interface ShapeDrawing {
  silhouette: AircraftSilhouette
  rotatesWithTrack: boolean
}

/** Built drawings by shape key; generation is cheap but runs per aircraft per poll otherwise. */
const drawingCache = new Map<string, ShapeDrawing | null>()

/** Whether `value` names a family. */
function isFamilyId(value: string): value is AircraftFamilyId {
  return (AIRCRAFT_FAMILY_IDS as readonly string[]).includes(value)
}

/** Build the drawing for a shape key (`type:<designator>` or `family:<id>`). */
function buildDrawing(shapeKey: string): ShapeDrawing | null {
  if (shapeKey.startsWith('type:')) {
    const typeEntry = AIRCRAFT_TYPE_DIMENSIONS[shapeKey.slice('type:'.length)]
    if (!typeEntry) return null
    return {
      silhouette: buildAircraftSilhouette(typeEntry.familyId, typeEntry),
      rotatesWithTrack: !AIRCRAFT_FAMILIES[typeEntry.familyId].fixedOrientation,
    }
  }
  if (shapeKey.startsWith('family:')) {
    const familyId = shapeKey.slice('family:'.length)
    if (!isFamilyId(familyId)) return null
    return {
      silhouette: buildAircraftSilhouette(familyId),
      rotatesWithTrack: !AIRCRAFT_FAMILIES[familyId].fixedOrientation,
    }
  }
  return null
}

/** The drawing for a shape key, built once and cached. */
function drawingFor(shapeKey: string): ShapeDrawing | null {
  if (!drawingCache.has(shapeKey)) drawingCache.set(shapeKey, buildDrawing(shapeKey))
  return drawingCache.get(shapeKey) ?? null
}

/**
 * On-screen size of a shape's (square) icon image, in CSS pixels, before any
 * zoom scaling: room for the aircraft, sized as ADS-B Exchange sizes it, to
 * turn to any heading, plus its outline. Returns
 * {@link SILHOUETTE_FALLBACK_ICON_PX} for an unknown key.
 */
export function silhouetteIconSizePx(shapeKey: string): number {
  const drawing = drawingFor(shapeKey)
  if (!drawing) return SILHOUETTE_FALLBACK_ICON_PX
  return silhouetteImageSidePx(drawing.silhouette, SILHOUETTE_OUTLINE_WIDTH_PX)
}

/**
 * The outline drawing for a shape key, as the map draws it — for showing a
 * silhouette outside the map (a settings example).
 *
 * @returns `null` for a key that names no known drawing.
 */
export function silhouetteForShape(shapeKey: string): AircraftSilhouette | null {
  return drawingFor(shapeKey)?.silhouette ?? null
}

/**
 * Whether a shape's icon turns to the aircraft's track. False for shapes drawn
 * in side view (a balloon), and for an unknown key.
 */
export function silhouetteRotatesWithTrack(shapeKey: string): boolean {
  return drawingFor(shapeKey)?.rotatesWithTrack ?? false
}

/**
 * Rasterise one silhouette image for `map.addImage`.
 *
 * Drawn at `pixelRatio` × the icon size and registered with the same pixel
 * ratio, so it stays sharp on high-density screens. The outline is the shape
 * filled and stroked in black first, then filled in colour on top, so parts
 * that overlap (wing over fuselage) never show a seam.
 *
 * @param imageId - A name from {@link silhouetteImageId}.
 * @param pixelRatio - Device pixels per CSS pixel to draw at.
 * @returns The image, or `null` for a name that does not describe a known shape.
 */
export function createSilhouetteImageData(imageId: string, pixelRatio = 2): ImageData | null {
  const parsed = parseSilhouetteImageId(imageId)
  if (!parsed) return null
  const drawing = drawingFor(parsed.shapeKey)
  if (!drawing) return null

  const canvasSide = Math.max(1, Math.round(silhouetteIconSizePx(parsed.shapeKey) * pixelRatio))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = canvasSide
  const context = canvas.getContext('2d')
  if (!context) return null

  const outlineDevicePx = SILHOUETTE_OUTLINE_WIDTH_PX * pixelRatio
  const metresToDevicePx =
    (canvasSide - 2 * outlineDevicePx) / (2 * drawing.silhouette.boundingRadius)
  const outline = new Path2D(drawing.silhouette.pathData)

  context.translate(canvasSide / 2, canvasSide / 2)
  context.scale(metresToDevicePx, metresToDevicePx)
  context.lineJoin = 'round'
  context.lineWidth = (2 * outlineDevicePx) / metresToDevicePx
  context.fillStyle = OUTLINE_COLOUR
  context.strokeStyle = OUTLINE_COLOUR
  context.fill(outline)
  context.stroke(outline)
  context.fillStyle = SILHOUETTE_COLOURS[parsed.colourKey]
  context.fill(outline)

  return context.getImageData(0, 0, canvasSide, canvasSide)
}
