/**
 * Label pills for live objects, in the flat maps' label style (black pill,
 * uppercase condensed name, coloured badge), as HTML over the canvas.
 *
 * The marks themselves are GPU points (`objectLayer.ts`); a pill sits beside
 * its mark. Pills are kept for a few objects only, as the site globe does:
 * the selected and hovered ones and any emergency always, then a capped set
 * per kind nearest the middle of the view. A pill that would overlap one
 * already placed (or a reserved box) is left out: zoom in and more appear.
 * Labels already showing keep priority over new ones, so turning the globe
 * doesn't make them swap and blink.
 */
import type { Vector3 } from 'three'
import type { ScreenBox } from './countryLabels'
import type { GlobeObject, GlobeObjectKind } from './globeObject'
import type { GlobeProjector } from './globeProjector'

/** The most pills per kind, besides the always-labelled ones (the site globe's caps). */
const LABEL_CAPS: Readonly<Record<GlobeObjectKind, number>> = { air: 40, sea: 16, aprs: 30 }

/** Gap between a mark's centre and its pill, in CSS pixels. */
const MARK_CLEARANCE_PX = 10
/** Pill height in CSS pixels (matches the CSS). */
const PILL_HEIGHT_PX = 22
/** Space kept between neighbouring pills. */
const PILL_MARGIN_PX = 3
/** Pills this close to the globe's outline are left out (they'd hang off the disc). */
const MIN_INSIDE_HORIZON = 0.08
/** How often the labelled set is chosen again; between times shown pills just move. */
const RESELECT_INTERVAL_MS = 150

/** An object that may be labelled, with its scene position. */
export interface LabelCandidate {
  object: GlobeObject
  position: Vector3
}

interface Pill {
  element: HTMLDivElement
  /** Measured width; 0 until first shown. */
  width: number
  /** The label text it was built for, so a change rebuilds it. */
  builtFor: string
  /** Placed to the left of its mark (no room on the right). */
  leftSide: boolean
}

function overlaps(box: ScreenBox, others: readonly ScreenBox[]): boolean {
  return others.some(
    (other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1],
  )
}

function labelSignature(object: GlobeObject): string {
  const { name, badge, badgeColours } = object.label
  return `${name}|${badge ?? ''}|${badgeColours.background}|${badgeColours.text}`
}

/** Fills a pill element: the name, then the badge when there is one. */
function buildPill(element: HTMLDivElement, object: GlobeObject): void {
  element.replaceChildren()
  const name = document.createElement('span')
  name.className = 'globe-pill-name'
  name.textContent = object.label.name
  element.appendChild(name)
  if (object.label.badge) {
    const badge = document.createElement('span')
    badge.className = 'globe-pill-badge'
    badge.textContent = object.label.badge
    badge.style.background = object.label.badgeColours.background
    badge.style.color = object.label.badgeColours.text
    element.appendChild(badge)
  }
}

/** The object label pills, drawn into the overlay laid over the canvas. */
export class ObjectLabelLayer {
  private readonly pills = new Map<string, Pill>()
  /** Keys labelled at the last selection, in placement order. */
  private shown: string[] = []
  private lastSelectionMs = -Infinity

  constructor(private readonly container: HTMLElement) {}

  /** Forces the labelled set to be chosen again on the next frame (objects or selection changed). */
  invalidate(): void {
    this.lastSelectionMs = -Infinity
  }

  /** Removes the pills of objects that are no longer in the feed. */
  prune(liveKeys: ReadonlySet<string>): void {
    for (const [key, pill] of this.pills) {
      if (liveKeys.has(key)) continue
      pill.element.remove()
      this.pills.delete(key)
    }
    this.shown = this.shown.filter((key) => liveKeys.has(key))
  }

  private pillFor(object: GlobeObject): Pill {
    let pill = this.pills.get(object.key)
    if (!pill) {
      const element = document.createElement('div')
      element.className = 'globe-pill globe-overlay--hidden'
      this.container.appendChild(element)
      pill = { element, width: 0, builtFor: '', leftSide: false }
      this.pills.set(object.key, pill)
    }
    const signature = labelSignature(object)
    if (pill.builtFor !== signature) {
      buildPill(pill.element, object)
      pill.builtFor = signature
      pill.width = 0
    }
    return pill
  }

  /**
   * Places the pills for this frame.
   *
   * @param candidates every object of the visible layers.
   * @param reserved boxes no pill may cover; each placed pill is added to it.
   */
  update(
    projector: GlobeProjector,
    candidates: readonly LabelCandidate[],
    selectedKey: string | null,
    hoveredKey: string | null,
    reserved: ScreenBox[],
    nowMs: number,
  ): void {
    const reselect = nowMs - this.lastSelectionMs >= RESELECT_INTERVAL_MS
    const byKey = new Map(candidates.map((candidate) => [candidate.object.key, candidate]))
    const order = reselect
      ? this.chooseOrder(projector, candidates, selectedKey, hoveredKey)
      : this.shown.flatMap((key) => {
          const candidate = byKey.get(key)
          return candidate ? [candidate] : []
        })
    if (reselect) this.lastSelectionMs = nowMs

    const placed: string[] = []
    for (const candidate of order) {
      const always = candidate.object.key === selectedKey || candidate.object.key === hoveredKey
      if (this.place(projector, candidate, reserved, always, selectedKey)) {
        placed.push(candidate.object.key)
      }
    }
    const placedSet = new Set(placed)
    for (const [key, pill] of this.pills) {
      if (!placedSet.has(key)) pill.element.classList.add('globe-overlay--hidden')
    }
    this.shown = placed
  }

  /** The candidates worth a pill, most important first, within the per-kind caps. */
  private chooseOrder(
    projector: GlobeProjector,
    candidates: readonly LabelCandidate[],
    selectedKey: string | null,
    hoveredKey: string | null,
  ): LabelCandidate[] {
    const wasShown = new Set(this.shown)
    const centreX = projector.width / 2
    const centreY = projector.height / 2
    const ranked: Array<{ candidate: LabelCandidate; rank: number; distance: number }> = []
    for (const candidate of candidates) {
      const { key, urgent } = candidate.object
      const special = key === selectedKey || key === hoveredKey
      if (!special && projector.insideHorizon(candidate.position) < MIN_INSIDE_HORIZON) continue
      const point = projector.toScreen(candidate.position)
      if (point.depth > 1) continue
      if (
        !special &&
        (point.x < 0 || point.x > projector.width || point.y < 0 || point.y > projector.height)
      )
        continue
      const rank =
        key === selectedKey ? 0 : key === hoveredKey ? 1 : urgent ? 2 : wasShown.has(key) ? 3 : 4
      ranked.push({ candidate, rank, distance: Math.hypot(point.x - centreX, point.y - centreY) })
    }
    ranked.sort((first, second) => first.rank - second.rank || first.distance - second.distance)
    const counts: Record<GlobeObjectKind, number> = { air: 0, sea: 0, aprs: 0 }
    return ranked
      .filter(({ candidate, rank }) => {
        if (rank <= 2) return true
        const kind = candidate.object.kind
        counts[kind] += 1
        return counts[kind] <= LABEL_CAPS[kind]
      })
      .map(({ candidate }) => candidate)
  }

  /** Places one pill beside its mark (right, else left); returns false when it had no room. */
  private place(
    projector: GlobeProjector,
    candidate: LabelCandidate,
    reserved: ScreenBox[],
    always: boolean,
    selectedKey: string | null,
  ): boolean {
    if (!projector.isFacing(candidate.position)) return false
    const point = projector.toScreen(candidate.position)
    if (point.depth > 1) return false
    const pill = this.pillFor(candidate.object)
    if (!pill.width) {
      pill.element.classList.remove('globe-overlay--hidden')
      pill.width = pill.element.offsetWidth || 80
    }
    const top = point.y - PILL_HEIGHT_PX / 2
    const bottom = point.y + PILL_HEIGHT_PX / 2
    const rightBox: ScreenBox = [
      point.x + MARK_CLEARANCE_PX,
      top,
      point.x + MARK_CLEARANCE_PX + pill.width,
      bottom,
    ]
    const leftBox: ScreenBox = [
      point.x - MARK_CLEARANCE_PX - pill.width,
      top,
      point.x - MARK_CLEARANCE_PX,
      bottom,
    ]
    const fits = (box: ScreenBox): boolean => {
      const padded: ScreenBox = [
        box[0] - PILL_MARGIN_PX,
        box[1] - PILL_MARGIN_PX,
        box[2] + PILL_MARGIN_PX,
        box[3] + PILL_MARGIN_PX,
      ]
      const onScreen =
        box[0] >= 0 && box[2] <= projector.width && box[1] >= 0 && box[3] <= projector.height
      return onScreen && !overlaps(padded, reserved)
    }
    // Keep the side it was on while that still fits, so pills don't hop about.
    const preferred = pill.leftSide ? [leftBox, rightBox] : [rightBox, leftBox]
    let box = preferred.find(fits)
    if (!box) {
      if (!always) return false
      box = preferred[0]!
    }
    pill.leftSide = box === leftBox
    reserved.push(box)
    const { element } = pill
    element.classList.remove('globe-overlay--hidden')
    element.classList.toggle('globe-pill--selected', candidate.object.key === selectedKey)
    element.classList.toggle(
      'globe-pill--dimmed',
      selectedKey !== null && candidate.object.key !== selectedKey,
    )
    element.style.transform = `translate(${box[0]}px, ${top}px)`
    return true
  }

  /** Removes every pill. */
  dispose(): void {
    for (const pill of this.pills.values()) pill.element.remove()
    this.pills.clear()
    this.shown = []
  }
}
