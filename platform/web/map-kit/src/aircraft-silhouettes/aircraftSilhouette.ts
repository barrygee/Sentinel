/**
 * Builds a drawable silhouette for an aircraft family, optionally stretched to
 * a specific type's length and span, and renders it as SVG.
 *
 * Silhouettes point nose-up and are centred on their bounding box, so rotating
 * the icon by the aircraft's track turns it about its middle — the same point
 * the map pins to the aircraft's reported position.
 */
import {
  AIRCRAFT_FAMILIES,
  type AircraftFamilyId,
} from '@sentinel/map-kit/aircraft-silhouettes/aircraftFamilies'
import type { PlanformPolygon } from '@sentinel/map-kit/aircraft-silhouettes/aircraftPlanform'
import { planformPolygons } from '@sentinel/map-kit/aircraft-silhouettes/planformGeometry'

/** A type's real size, used to stretch its family's reference drawing. */
export interface AircraftDimensions {
  /** Overall length in metres. */
  length: number
  /** Overall span in metres. */
  span: number
}

/** A ready-to-draw silhouette, in metres, centred on (0, 0). */
export interface AircraftSilhouette {
  familyId: AircraftFamilyId
  /** SVG path data: one closed subpath per part, all wound the same way. */
  pathData: string
  /**
   * Distance from the centre to the farthest point of the outline, in metres.
   * Sizing the drawing by this keeps it inside its square at any rotation.
   */
  boundingRadius: number
  /** The larger of the silhouette's length and span, in metres. */
  extentMetres: number
}

/** Decimal places kept in path data — centimetres, far below a pixel at icon size. */
const PATH_PRECISION = 2

/**
 * Format one coordinate for path data, without trailing zeros. A value that
 * rounds to `-0` prints as `0`, since `String(-0)` is `'0'`.
 */
function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(PATH_PRECISION)))
}

/** Convert polygons to SVG path data, one `M … Z` subpath each. */
function polygonsToPathData(polygons: readonly PlanformPolygon[]): string {
  return polygons
    .map((polygon) => {
      const [firstPoint, ...remainingPoints] = polygon
      /* v8 ignore start -- planformPolygons never yields an empty polygon (every
         part has at least four corners); the guard satisfies
         noUncheckedIndexedAccess, which types the first point as optional. */
      if (!firstPoint) return ''
      /* v8 ignore stop */
      const lineTo = remainingPoints
        .map((point) => `${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`)
        .join(' ')
      return `M${formatCoordinate(firstPoint.x)} ${formatCoordinate(firstPoint.y)}L${lineTo}Z`
    })
    .join('')
}

/**
 * Build a family's silhouette, stretched to `dimensions` when given.
 *
 * Stretching is independent per axis: length scales everything fore-and-aft,
 * span everything side to side. That is what turns one A320 drawing into a
 * credible A318 or A321 — they share a wing and differ in fuselage length.
 *
 * @param familyId - Which family's reference drawing to use.
 * @param dimensions - The specific type's real size; omit to draw the reference aircraft.
 */
export function buildAircraftSilhouette(
  familyId: AircraftFamilyId,
  dimensions?: AircraftDimensions,
): AircraftSilhouette {
  const family = AIRCRAFT_FAMILIES[familyId]
  const lengthScale = dimensions ? dimensions.length / family.referenceLength : 1
  const spanScale = dimensions ? dimensions.span / family.referenceSpan : 1

  const scaledPolygons = planformPolygons(family.planform).map((polygon) =>
    polygon.map((point) => ({ x: point.x * spanScale, y: point.y * lengthScale })),
  )

  const allPoints = scaledPolygons.flat()
  const minX = Math.min(...allPoints.map((point) => point.x))
  const maxX = Math.max(...allPoints.map((point) => point.x))
  const minY = Math.min(...allPoints.map((point) => point.y))
  const maxY = Math.max(...allPoints.map((point) => point.y))
  const centreX = (minX + maxX) / 2
  const centreY = (minY + maxY) / 2

  const centredPolygons = scaledPolygons.map((polygon) =>
    polygon.map((point) => ({ x: point.x - centreX, y: point.y - centreY })),
  )
  const width = maxX - minX
  const height = maxY - minY

  return {
    familyId,
    pathData: polygonsToPathData(centredPolygons),
    boundingRadius: Math.max(
      ...centredPolygons.flat().map((point) => Math.hypot(point.x, point.y)),
    ),
    extentMetres: Math.max(width, height),
  }
}

/**
 * On-screen length of an aircraft's largest dimension at the two ends of the
 * size range, matched to what ADS-B Exchange and Flightradar24 draw: a Cessna
 * about 21px, an A320 or 737 about 28px, the largest wide-bodies about 32px.
 * Measured from ADS-B Exchange's live map (median icon 25px zoomed out, 28px
 * zoomed in, against Sentinel's 36px at the first attempt); no artwork or code
 * was taken from it.
 */
const SMALL_AIRCRAFT_PX = 21
const LARGE_AIRCRAFT_PX = 32
/** The aircraft sizes (largest dimension, metres) that map to the two ends of the range. */
const SMALL_AIRCRAFT_METRES = 11
const LARGE_AIRCRAFT_METRES = 80

/**
 * How long to draw an aircraft's largest dimension on screen, in CSS pixels.
 *
 * Logarithmic, not proportional: a 747 is seven times a Cessna's length, and an
 * icon seven times larger would bury everything near it. Like ADS-B Exchange,
 * the size order still reads at a glance while the range stays within about
 * 1.5:1. Sizes outside the range are clamped to its ends.
 *
 * @param extentMetres - The aircraft's largest dimension; a non-positive or
 *   non-numeric value gets the small end.
 * @returns A length between 21 and 32 pixels.
 */
export function silhouetteLengthPx(extentMetres: number): number {
  if (!(extentMetres > 0)) return SMALL_AIRCRAFT_PX
  const position =
    Math.log(extentMetres / SMALL_AIRCRAFT_METRES) /
    Math.log(LARGE_AIRCRAFT_METRES / SMALL_AIRCRAFT_METRES)
  const clamped = Math.min(1, Math.max(0, position))
  return SMALL_AIRCRAFT_PX + clamped * (LARGE_AIRCRAFT_PX - SMALL_AIRCRAFT_PX)
}

/**
 * Side of the square image a silhouette is drawn in, in CSS pixels: big enough
 * for the aircraft at {@link silhouetteLengthPx} to turn to any heading without
 * clipping, plus its outline.
 *
 * @param silhouette - Output of {@link buildAircraftSilhouette}.
 * @param outlineWidthPx - Outline thickness outside the body.
 */
export function silhouetteImageSidePx(
  silhouette: AircraftSilhouette,
  outlineWidthPx: number,
): number {
  const lengthPx = silhouetteLengthPx(silhouette.extentMetres)
  // A drawing with no extent has nothing to scale; give it the plain length.
  const bodySidePx =
    silhouette.extentMetres > 0
      ? (2 * silhouette.boundingRadius * lengthPx) / silhouette.extentMetres
      : lengthPx
  return Math.round(bodySidePx + 2 * outlineWidthPx)
}

/** How to paint a silhouette as SVG. */
export interface SilhouetteSvgOptions {
  /** Body colour — Sentinel's civil, military or emergency colour. */
  fillColour: string
  /** Outline colour; black keeps the shape readable over imagery and terrain. */
  outlineColour: string
  /** Outline thickness outside the body, in pixels. */
  outlineWidthPx: number
  /** Rendered width and height of the (square) SVG, in pixels. */
  sizePx: number
  /** Clockwise rotation in degrees (the aircraft's track). */
  rotationDeg?: number
}

/**
 * Render a silhouette as a standalone SVG string.
 *
 * The outline is the same path drawn first with a fat stroke, then the body
 * filled on top. Drawing it that way (rather than stroking the filled shape)
 * means internal edges — a wing root crossing the fuselage, an engine over a
 * wing — are covered by the fill and never show as lines.
 *
 * @param silhouette - Output of {@link buildAircraftSilhouette}.
 * @param options - Colours, outline and size.
 */
export function renderSilhouetteSvg(
  silhouette: AircraftSilhouette,
  options: SilhouetteSvgOptions,
): string {
  const { fillColour, outlineColour, outlineWidthPx, sizePx, rotationDeg = 0 } = options
  const { viewBox, outlineStrokeWidth } = silhouetteSvgFrame(silhouette, outlineWidthPx, sizePx)
  const rotation = rotationDeg ? ` transform="rotate(${formatCoordinate(rotationDeg)})"` : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="${viewBox}">` +
    `<g${rotation}>` +
    `<path d="${silhouette.pathData}" fill="${outlineColour}" stroke="${outlineColour}" ` +
    `stroke-width="${outlineStrokeWidth}" stroke-linejoin="round"/>` +
    `<path d="${silhouette.pathData}" fill="${fillColour}"/>` +
    `</g></svg>`
  )
}

/** Where a silhouette sits in a square SVG: see {@link silhouetteSvgFrame}. */
export interface SilhouetteSvgFrame {
  /** `viewBox` value, centred on the aircraft, in metres. */
  viewBox: string
  /** Stroke width of the outline path, in view-box units (formatted). */
  outlineStrokeWidth: string
}

/**
 * The view box and outline stroke for drawing a silhouette in a square SVG of
 * `sizePx`, so callers that build the SVG themselves (a Vue template) draw it
 * exactly as {@link renderSilhouetteSvg} does.
 *
 * Leaves room for the outline around the body: the body spans
 * (sizePx - 2 × outline) pixels, so the view box grows to keep it inside, and
 * it is sized by the bounding radius so any rotation fits.
 */
export function silhouetteSvgFrame(
  silhouette: AircraftSilhouette,
  outlineWidthPx: number,
  sizePx: number,
): SilhouetteSvgFrame {
  const bodyPx = Math.max(1, sizePx - 2 * outlineWidthPx)
  const viewSide = (2 * silhouette.boundingRadius * sizePx) / bodyPx
  const metresPerPx = viewSide / sizePx
  const viewOrigin = -viewSide / 2
  return {
    viewBox: [viewOrigin, viewOrigin, viewSide, viewSide].map(formatCoordinate).join(' '),
    outlineStrokeWidth: formatCoordinate(2 * outlineWidthPx * metresPerPx),
  }
}
