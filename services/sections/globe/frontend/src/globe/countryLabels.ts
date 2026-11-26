/**
 * Country names on the globe, set the way the app's dark basemap sets them:
 * HTML labels over the canvas, shown only on the near side, only for big
 * countries until the camera comes in close, and never overlapping each other
 * (or the boxes the caller reserves, such as the home marker).
 */
import type { Vector3 } from 'three'
import countryLabelsUrl from './data/countryLabels.json?url'
import { latLonToVector } from './geo'
import type { GlobeProjector } from './globeProjector'

/** A screen box `[left, top, right, bottom]` in canvas CSS pixels. */
export type ScreenBox = [number, number, number, number]

interface CountryLabel {
  element: HTMLDivElement
  position: Vector3
  /** Country area in the data's units: big ones show at every zoom. */
  area: number
  width: number
}

/** Countries at least this big are labelled at any zoom; smaller ones only up close. */
const ALWAYS_SHOWN_AREA = 25
/**
 * Labels this close to the globe's outline (see `GlobeProjector.insideHorizon`)
 * are hidden: centred text there spills off the disc into space.
 */
const MIN_INSIDE_HORIZON = 0.2
/** Camera distance inside which every country is labelled. */
const ALL_LABELS_DISTANCE = 260

function overlaps(box: ScreenBox, others: ScreenBox[]): boolean {
  return others.some(
    (other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1],
  )
}

/** `[name, lat, lon, area]` rows, ignoring anything malformed. */
function parseRows(json: unknown): Array<[string, number, number, number]> {
  if (!Array.isArray(json)) return []
  return json.filter(
    (row): row is [string, number, number, number] =>
      Array.isArray(row) &&
      typeof row[0] === 'string' &&
      typeof row[1] === 'number' &&
      typeof row[2] === 'number' &&
      typeof row[3] === 'number',
  )
}

/** The country name labels, drawn into a container laid over the canvas. */
export class CountryLabelLayer {
  private labels: CountryLabel[] = []
  private disposed = false

  constructor(private readonly container: HTMLElement) {}

  /** Fetches the label list and creates the elements. A failed fetch just leaves the globe unlabelled. */
  async load(): Promise<void> {
    try {
      const response = await fetch(countryLabelsUrl)
      if (!response.ok || this.disposed) return
      const rows = parseRows(await response.json())
      if (this.disposed) return
      this.labels = rows.map(([name, lat, lon, area]) => {
        const element = document.createElement('div')
        element.className = 'globe-country-label globe-overlay--hidden'
        element.textContent = name
        this.container.appendChild(element)
        return { element, position: latLonToVector(lat, lon, 0.02), area, width: 0 }
      })
    } catch {
      // Labels are decoration; the globe works without them.
    }
  }

  /**
   * Places the labels for this frame.
   *
   * @param reserved boxes no label may cover; each placed label is added to it.
   */
  update(projector: GlobeProjector, viewDistance: number, reserved: ScreenBox[]): void {
    const showSmall = viewDistance < ALL_LABELS_DISTANCE
    for (const label of this.labels) {
      const { element } = label
      if (
        !(label.area > ALWAYS_SHOWN_AREA || showSmall) ||
        projector.insideHorizon(label.position) < MIN_INSIDE_HORIZON
      ) {
        element.classList.add('globe-overlay--hidden')
        continue
      }
      const point = projector.toScreen(label.position)
      if (point.depth > 1) {
        element.classList.add('globe-overlay--hidden')
        continue
      }
      // Measured once, the first time it shows (hidden labels have no width).
      if (!label.width) {
        element.classList.remove('globe-overlay--hidden')
        label.width = element.offsetWidth || 60
      }
      const box: ScreenBox = [
        point.x - label.width / 2,
        point.y - 8,
        point.x + label.width / 2,
        point.y + 8,
      ]
      const onScreen =
        box[0] >= 0 && box[2] <= projector.width && box[1] >= 0 && box[3] <= projector.height
      const fits = onScreen && !overlaps(box, reserved)
      element.classList.toggle('globe-overlay--hidden', !fits)
      if (!fits) continue
      reserved.push(box)
      element.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`
    }
  }

  /** Removes the label elements. */
  dispose(): void {
    this.disposed = true
    for (const label of this.labels) label.element.remove()
    this.labels = []
  }
}
