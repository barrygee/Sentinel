/**
 * The Natural Earth coastlines and borders the globe paints its map from.
 *
 * The data is the sentinel-site globe's `vec.json`, split in two so the first
 * paint only waits for the small file:
 *   - `naturalEarthGlobal.json` — 50 m land and borders for the whole world;
 *   - `naturalEarthEurope.json` — 10 m detail for Europe, fetched only when the
 *     sharp in-view patch first frames Europe.
 *
 * Each file is `{land, bor, scale}`: base64 Int16Arrays of rings. A ring starts
 * with a two-value header `count = (a[i] << 15) | a[i+1]` and then `count`
 * delta-encoded lon/lat pairs (divide by `scale` for degrees). In `land`, a
 * zero header ends a polygon (its rings fill together, even-odd); `bor` rings
 * are open lines. Natural Earth is public domain.
 *
 * The files are bundled assets (Vite `?url`), so they are served with the
 * section's remote and work off grid.
 */
import naturalEarthEuropeUrl from './data/naturalEarthEurope.json?url'
import naturalEarthGlobalUrl from './data/naturalEarthGlobal.json?url'

/** One decoded ring: flat `[lon, lat, lon, lat, …]` in degrees. */
export type Ring = Float32Array

/** A list of rings plus their bounding box `[west, south, east, north]`. */
export interface RingGroup {
  rings: Ring[]
  bounds: [number, number, number, number]
}

/** A decoded set: land polygons and border lines. */
export interface NaturalEarthSet {
  land: RingGroup[]
  borders: RingGroup[]
}

interface EncodedSet {
  land: string
  bor: string
  scale: number
}

function isEncodedSet(value: unknown): value is EncodedSet {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.land === 'string' &&
    typeof candidate.bor === 'string' &&
    typeof candidate.scale === 'number'
  )
}

function base64ToInt16(encoded: string): Int16Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new Int16Array(bytes.buffer)
}

function ringBounds(rings: Ring[]): [number, number, number, number] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 2) {
      west = Math.min(west, ring[index]!)
      east = Math.max(east, ring[index]!)
      south = Math.min(south, ring[index + 1]!)
      north = Math.max(north, ring[index + 1]!)
    }
  }
  return [west, south, east, north]
}

/**
 * Decodes one packed ring list.
 *
 * @param asPolygons true for `land` (zero headers group rings into polygons),
 *   false for `bor` (every ring stands alone).
 */
function decodeRings(packed: Int16Array, scale: number, asPolygons: boolean): RingGroup[] {
  const groups: Ring[][] = []
  let currentPolygon: Ring[] = []
  let cursor = 0
  while (cursor < packed.length) {
    const pointCount = (packed[cursor]! << 15) | packed[cursor + 1]!
    cursor += 2
    if (pointCount === 0) {
      if (asPolygons) {
        groups.push(currentPolygon)
        currentPolygon = []
      }
      continue
    }
    const ring = new Float32Array(pointCount * 2)
    let lon = 0
    let lat = 0
    for (let point = 0; point < pointCount; point++) {
      lon += packed[cursor++]!
      lat += packed[cursor++]!
      ring[point * 2] = lon / scale
      ring[point * 2 + 1] = lat / scale
    }
    if (asPolygons) currentPolygon.push(ring)
    else groups.push([ring])
  }
  return groups.map((rings) => ({ rings, bounds: ringBounds(rings) }))
}

/** Decodes a set from its JSON form; throws on a malformed file. */
export function decodeNaturalEarthSet(json: unknown): NaturalEarthSet {
  if (!isEncodedSet(json)) throw new Error('Natural Earth data is not in the expected format')
  return {
    land: decodeRings(base64ToInt16(json.land), json.scale, true),
    borders: decodeRings(base64ToInt16(json.bor), json.scale, false),
  }
}

async function fetchSet(url: string): Promise<NaturalEarthSet> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Natural Earth data failed to load (${response.status})`)
  return decodeNaturalEarthSet(await response.json())
}

// One download per page load, shared by every globe instance (a remount after
// navigating away and back reuses the decoded rings).
let globalSetPromise: Promise<NaturalEarthSet> | null = null
let europeSetPromise: Promise<NaturalEarthSet> | null = null

/** The 50 m world set. A failed load is forgotten so the next mount retries. */
export function loadGlobalSet(): Promise<NaturalEarthSet> {
  globalSetPromise ??= fetchSet(naturalEarthGlobalUrl).catch((error: unknown) => {
    globalSetPromise = null
    throw error
  })
  return globalSetPromise
}

/** The 10 m Europe set. A failed load is forgotten so the next use retries. */
export function loadEuropeSet(): Promise<NaturalEarthSet> {
  europeSetPromise ??= fetchSet(naturalEarthEuropeUrl).catch((error: unknown) => {
    europeSetPromise = null
    throw error
  })
  return europeSetPromise
}

/**
 * Adds one land ring to the current canvas path in an equirectangular frame.
 *
 * A ring that crosses the date line is unwrapped so it doesn't fill a band
 * right round the map; one that circles a pole is closed through that pole.
 * It is drawn three times (shifted by 0 and ±360°) so the parts past ±180
 * land on the canvas too.
 *
 * @param projectX longitude in degrees → canvas x.
 * @param projectY latitude in degrees → canvas y.
 */
export function addRingToPath(
  context: CanvasRenderingContext2D,
  ring: Ring,
  projectX: (lon: number) => number,
  projectY: (lat: number) => number,
): void {
  const unwrapped: number[] = [ring[0]!, ring[1]!]
  let offset = 0
  for (let index = 2; index < ring.length; index += 2) {
    let lon = ring[index]! + offset
    const step = lon - unwrapped[unwrapped.length - 2]!
    if (step > 180) {
      offset -= 360
      lon -= 360
    } else if (step < -180) {
      offset += 360
      lon += 360
    }
    unwrapped.push(lon, ring[index + 1]!)
  }
  const span = unwrapped[unwrapped.length - 2]! - unwrapped[0]!
  if (Math.abs(span) > 300) {
    const pole = unwrapped[unwrapped.length - 1]! < 0 ? -90 : 90
    unwrapped.push(unwrapped[unwrapped.length - 2]!, pole, unwrapped[0]!, pole)
  }
  let minLon = Infinity
  let maxLon = -Infinity
  for (let index = 0; index < unwrapped.length; index += 2) {
    minLon = Math.min(minLon, unwrapped[index]!)
    maxLon = Math.max(maxLon, unwrapped[index]!)
  }
  for (const shift of [0, 360, -360]) {
    if (maxLon + shift < -180 || minLon + shift > 180) continue
    context.moveTo(projectX(unwrapped[0]! + shift), projectY(unwrapped[1]!))
    for (let index = 2; index < unwrapped.length; index += 2) {
      context.lineTo(projectX(unwrapped[index]! + shift), projectY(unwrapped[index + 1]!))
    }
    context.closePath()
  }
}

/** Strokes one open border line (no unwrapping: borders don't cross ±180). */
export function strokeLine(
  context: CanvasRenderingContext2D,
  ring: Ring,
  projectX: (lon: number) => number,
  projectY: (lat: number) => number,
): void {
  context.beginPath()
  context.moveTo(projectX(ring[0]!), projectY(ring[1]!))
  for (let index = 2; index < ring.length; index += 2) {
    context.lineTo(projectX(ring[index]!), projectY(ring[index + 1]!))
  }
  context.stroke()
}
