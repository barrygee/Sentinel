/**
 * Turns silhouettes into MapLibre map images, on demand.
 *
 * Each image is named for exactly what it draws — shape, colour and whether it
 * is the selected aircraft, e.g. `aircraft-silhouette:type:A321:military` or
 * `aircraft-silhouette:type:A321:civil:selected` — so the map can ask for one by name
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
import {
  ALTITUDE_BAND_MAX,
  altitudeBand,
  altitudeBandColour,
} from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'

/** The three states an aircraft is coloured by, everywhere in the Air section. */
export type AircraftStateKey = 'civil' | 'military' | 'emergency'

/** A silhouette's colour: a state, or an altitude band (see `altitudeColour.ts`). */
export type SilhouetteColourKey = AircraftStateKey | `alt${number}`

/** Colour per state for arrow mode, whose arrows, trails and labels all share these. */
export const ARROW_COLOURS: Readonly<Record<AircraftStateKey, string>> = {
  civil: '#00aaff',
  military: '#c8ff00',
  emergency: '#ff2222',
}

/**
 * Body colour per state on the dark map. Civil is the fallback for an aircraft
 * with no altitude to colour it by, or on the ground, so it stays neutral.
 */
export const SILHOUETTE_COLOURS: Readonly<Record<AircraftStateKey, string>> = {
  ...ARROW_COLOURS,
  civil: '#8f949a',
}

/**
 * Which basemap a silhouette is drawn for. The dark map's bright fills wash
 * out against the light map's cream land, so the light map gets deeper ones.
 */
export type SilhouettePalette = 'dark' | 'light'

/**
 * Body colours per palette. The light map's civil grey is dark enough to read
 * on cream land. Military keeps the app's lime on both maps; on the light one
 * its black detail line is what holds the shape against the land.
 */
export const SILHOUETTE_PALETTES: Readonly<
  Record<SilhouettePalette, Readonly<Record<AircraftStateKey, string>>>
> = {
  dark: SILHOUETTE_COLOURS,
  light: {
    civil: '#4b5057',
    military: SILHOUETTE_COLOURS.military,
    emergency: '#c40000',
  },
}

/**
 * Body colour of the selected civil aircraft per palette: the strongest colour
 * the map can take. Military and emergency aircraft keep their state colour
 * when selected, because that colour is what they are there to show.
 */
export const SILHOUETTE_SELECTED_CIVIL_COLOURS: Readonly<Record<SilhouettePalette, string>> = {
  dark: '#ffffff',
  light: '#0e1013',
}

/**
 * The faint line tracing each part of an aircraft (wings, tail, engines) per
 * palette: soft on the dark map's bright bodies, stronger on the light map's.
 */
export const SILHOUETTE_DETAIL_COLOURS: Readonly<Record<SilhouettePalette, string>> = {
  dark: 'rgba(0, 0, 0, 0.45)',
  light: 'rgba(0, 0, 0, 0.7)',
}

/** Width of that line, in CSS pixels. */
export const SILHOUETTE_DETAIL_WIDTH_PX = 0.5

/** Margin kept around the body inside its image, in CSS pixels. */
export const SILHOUETTE_OUTLINE_WIDTH_PX = 1

/**
 * How far the body is thickened past its outline, in CSS pixels. Enough for
 * thin parts (wing tips, tailplanes) to read at icon size; much more closes
 * the gaps between parts and the aircraft turns into a blob.
 */
export const SILHOUETTE_BODY_SPREAD_PX = 0.4

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

/**
 * Name of the map image for one shape in one colour. A feature carries this
 * name; the map layer appends the palette for the basemap on screen (see
 * {@link silhouetteImageIdForPalette}), so a palette change needs no new data.
 */
export function silhouetteImageId(shapeKey: string, colourKey: SilhouetteColourKey): string {
  return `${SILHOUETTE_IMAGE_PREFIX}${shapeKey}:${colourKey}`
}

/** Segment the map layer adds to the selected aircraft's image name. */
export const SILHOUETTE_SELECTED_SUFFIX = ':selected'

/** A feature's image name with the palette suffix the map layer adds to it. */
export function silhouetteImageIdForPalette(imageId: string, palette: SilhouettePalette): string {
  return `${imageId}:${palette}`
}

/** The colour key for a civil aircraft at this altitude. */
export function altitudeColourKey(altitudeFeet: number): SilhouetteColourKey {
  return `alt${altitudeBand(altitudeFeet)}`
}

/** The band number in an altitude colour key, or `null` for any other key. */
function bandOfColourKey(colourKey: string): number | null {
  const match = /^alt(\d+)$/.exec(colourKey)
  if (!match) return null
  const band = Number(match[1])
  return band <= ALTITUDE_BAND_MAX ? band : null
}

/** Whether `value` is a colour key. */
function isColourKey(value: string): value is SilhouetteColourKey {
  return (
    value === 'civil' ||
    value === 'military' ||
    value === 'emergency' ||
    bandOfColourKey(value) !== null
  )
}

/** The body colour for an image: the selected civil colour, its band's, or its state's. */
function bodyColourFor(
  colourKey: SilhouetteColourKey,
  selected: boolean,
  palette: SilhouettePalette,
): string {
  const band = bandOfColourKey(colourKey)
  if (selected && (band !== null || colourKey === 'civil')) {
    return SILHOUETTE_SELECTED_CIVIL_COLOURS[palette]
  }
  if (band !== null) return altitudeBandColour(band, palette)
  return SILHOUETTE_PALETTES[palette][colourKey as AircraftStateKey]
}

/** Whether `value` names a palette. */
function isPalette(value: string): value is SilhouettePalette {
  return value === 'dark' || value === 'light'
}

/**
 * Split an image name back into its shape, colour, selection and palette. A
 * name with no palette suffix is the dark map's.
 *
 * @returns `null` for a name that is not a well-formed silhouette image name.
 */
export function parseSilhouetteImageId(imageId: string): {
  shapeKey: string
  colourKey: SilhouetteColourKey
  selected: boolean
  palette: SilhouettePalette
} | null {
  if (!imageId.startsWith(SILHOUETTE_IMAGE_PREFIX)) return null
  let remainder = imageId.slice(SILHOUETTE_IMAGE_PREFIX.length)
  let palette: SilhouettePalette = 'dark'
  const paletteSeparator = remainder.lastIndexOf(':')
  const lastSegment = remainder.slice(paletteSeparator + 1)
  if (paletteSeparator > 0 && isPalette(lastSegment)) {
    palette = lastSegment
    remainder = remainder.slice(0, paletteSeparator)
  }
  const selected = remainder.endsWith(SILHOUETTE_SELECTED_SUFFIX)
  if (selected) remainder = remainder.slice(0, -SILHOUETTE_SELECTED_SUFFIX.length)
  const colourSeparator = remainder.lastIndexOf(':')
  if (colourSeparator <= 0) return null
  const colourKey = remainder.slice(colourSeparator + 1)
  if (!isColourKey(colourKey)) return null
  return { shapeKey: remainder.slice(0, colourSeparator), colourKey, selected, palette }
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

/** Outline points in metres, by shape key; parsing runs per label per poll otherwise. */
const outlinePointsCache = new Map<string, ReadonlyArray<readonly [number, number]>>()

/** Every point on a shape's outline, read from its path data. */
function outlinePoints(
  shapeKey: string,
  pathData: string,
): ReadonlyArray<readonly [number, number]> {
  const cached = outlinePointsCache.get(shapeKey)
  if (cached) return cached
  const numbers = (pathData.match(/-?\d+(?:\.\d+)?/g) as string[]).map(Number)
  const points: Array<readonly [number, number]> = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!])
  }
  outlinePointsCache.set(shapeKey, points)
  return points
}

/**
 * How far an aircraft's drawn shape reaches left or right of its position at a
 * given track, in CSS pixels before zoom scaling. Its icon image is a circle big
 * enough for any heading, so measuring from that leaves a gap that changes as
 * the aircraft turns.
 *
 * @returns The reach, or 0 for an unknown key.
 */
export function silhouetteSideReachPx(
  shapeKey: string,
  trackDeg: number,
  side: 'left' | 'right',
): number {
  const drawing = drawingFor(shapeKey)
  if (!drawing) return 0
  const trackRad = (trackDeg * Math.PI) / 180
  const direction = side === 'right' ? 1 : -1
  let reachMetres = 0
  for (const [x, y] of outlinePoints(shapeKey, drawing.silhouette.pathData)) {
    const screenX = x * Math.cos(trackRad) - y * Math.sin(trackRad)
    reachMetres = Math.max(reachMetres, screenX * direction)
  }
  const bodyPx = silhouetteIconSizePx(shapeKey) - 2 * SILHOUETTE_OUTLINE_WIDTH_PX
  return (
    (reachMetres * bodyPx) / (2 * drawing.silhouette.boundingRadius) + SILHOUETTE_BODY_SPREAD_PX
  )
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
 * ratio, so it stays sharp on high-density screens. The body is filled and
 * stroked in one colour, which gives it its weight; a faint line then traces
 * every part, which is what shows the engines and wings within it.
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
  const bodyColour = bodyColourFor(parsed.colourKey, parsed.selected, parsed.palette)
  context.lineWidth = (2 * SILHOUETTE_BODY_SPREAD_PX * pixelRatio) / metresToDevicePx
  context.fillStyle = bodyColour
  context.strokeStyle = bodyColour
  context.fill(outline)
  context.stroke(outline)
  context.lineWidth = (SILHOUETTE_DETAIL_WIDTH_PX * pixelRatio) / metresToDevicePx
  context.strokeStyle = SILHOUETTE_DETAIL_COLOURS[parsed.palette]
  context.stroke(outline)

  return context.getImageData(0, 0, canvasSide, canvasSide)
}
