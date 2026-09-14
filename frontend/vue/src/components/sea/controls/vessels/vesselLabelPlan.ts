import { COUNT_MARKER_SIZE_PX } from '@/components/shared/map-cluster/mapCluster'
import { isLeftFacing, MAP_LABEL_SIZE_PX } from '@/components/shared/map-label/mapLabelParts'
import type { SeaLabelFieldMap, SeaVessel } from '@/stores/sea'

/**
 * Decides which vessels on screen get a label pill and which collapse into a
 * count, the way the Land map does for APRS stations.
 *
 * Every vessel in view is accounted for: its pill is placed if it fits without
 * covering another, otherwise it joins the count for its patch of screen. A
 * lone leftover — one whose pill collides but that has no neighbour to be
 * counted with — is labelled anyway and allowed to overlap, since a count of
 * one says less than the label it would replace.
 *
 * Pure and screen-space: the control projects each vessel and passes the
 * pixel positions in, so the planner never touches the map.
 */

/** Where a vessel landed on screen, in pixels. */
export interface ScreenPoint {
  x: number
  y: number
}

/** A huddle of vessels drawn as one numbered marker. */
export interface VesselCount {
  /** Identity of the group — its screen cell — stable while the view is. */
  key: string
  members: SeaVessel[]
  /** Where the count sits: the mean of its members' positions. */
  position: ScreenPoint
  /** Mean geographic position, for placing the marker on the map. */
  lngLat: [number, number]
}

export interface VesselLabelPlan {
  labelled: SeaVessel[]
  counts: VesselCount[]
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Measured from rendered pills: the glyph well plus padding, then condensed
 *  14px type at roughly 7.5px a character. */
const LABEL_FIXED_PX = 41.5
const LABEL_CHAR_PX = 7.5
/** Extra width per enabled data segment (a dim badge with its label). */
const BADGE_FIXED_PX = 30
/** Half the pill's glyph well — how far the pill is pulled back over the point. */
const LABEL_PULLBACK_PX = 13

/** Estimated on-screen width of a vessel's pill under the current fields. */
export function estimateLabelWidth(vessel: SeaVessel, fields: SeaLabelFieldMap): number {
  let width = LABEL_FIXED_PX
  if (fields.name) width += vessel.name.length * LABEL_CHAR_PX
  if (fields.type && vessel.typeLabel) width += vessel.typeLabel.length * LABEL_CHAR_PX + 14
  if (fields.mmsi) width += BADGE_FIXED_PX + 9 * LABEL_CHAR_PX
  if (fields.destination && vessel.destination) {
    width += BADGE_FIXED_PX + vessel.destination.length * LABEL_CHAR_PX
  }
  if (fields.speed && vessel.sog !== null) width += BADGE_FIXED_PX + 5 * LABEL_CHAR_PX
  if (fields.course && vessel.cog !== null) width += BADGE_FIXED_PX + 4 * LABEL_CHAR_PX
  return width
}

/** Whether a vessel's pill extends to the left of its position. */
export function vesselFacesLeft(vessel: SeaVessel): boolean {
  const bearing = vessel.heading ?? vessel.cog
  return typeof bearing === 'number' && isLeftFacing(bearing)
}

function labelRect(vessel: SeaVessel, at: ScreenPoint, fields: SeaLabelFieldMap): Rect {
  const width = estimateLabelWidth(vessel, fields)
  const half = MAP_LABEL_SIZE_PX / 2
  if (vesselFacesLeft(vessel)) {
    const right = at.x + LABEL_PULLBACK_PX
    return { left: right - width, top: at.y - half, right, bottom: at.y + half }
  }
  const left = at.x - LABEL_PULLBACK_PX
  return { left, top: at.y - half, right: left + width, bottom: at.y + half }
}

function overlaps(left: Rect, right: Rect): boolean {
  return (
    left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top
  )
}

/**
 * Spatial hash of placed pills so each new pill is checked only against its
 * neighbours — a busy coast can hold thousands of vessels in view, and an
 * all-pairs check would stall the map on every pan.
 */
class PlacedRects {
  private readonly _cells = new Map<string, Rect[]>()
  private readonly _cellPx = MAP_LABEL_SIZE_PX * 2

  private _keys(rect: Rect): string[] {
    const keys: string[] = []
    for (
      let x = Math.floor(rect.left / this._cellPx);
      x <= Math.floor(rect.right / this._cellPx);
      x++
    ) {
      for (
        let y = Math.floor(rect.top / this._cellPx);
        y <= Math.floor(rect.bottom / this._cellPx);
        y++
      ) {
        keys.push(`${x}:${y}`)
      }
    }
    return keys
  }

  collides(rect: Rect): boolean {
    for (const key of this._keys(rect)) {
      const placed = this._cells.get(key)
      if (placed && placed.some((other) => overlaps(other, rect))) return true
    }
    return false
  }

  add(rect: Rect): void {
    for (const key of this._keys(rect)) {
      const placed = this._cells.get(key)
      if (placed) placed.push(rect)
      else this._cells.set(key, [rect])
    }
  }
}

/**
 * Plan the pills and counts for the vessels on screen.
 *
 * Pills are placed in name order rather than arrival order, so which vessels
 * are labelled does not reshuffle on every poll. Leftovers are gathered by the
 * screen cell they fall in, each cell one count-marker wide, so a count never
 * stands for vessels it could not honestly cover.
 */
export function planVesselLabels(
  vessels: SeaVessel[],
  positions: Map<string, ScreenPoint>,
  fields: SeaLabelFieldMap,
  alwaysLabel: string = '',
  options: { groupAll?: boolean; cellPx?: number } = {},
): VesselLabelPlan {
  const ordered = [...vessels].sort((left, right) => left.name.localeCompare(right.name))
  const placed = new PlacedRects()
  const labelled: SeaVessel[] = []
  const leftOver: SeaVessel[] = []
  const cellPx = options.cellPx ?? COUNT_MARKER_SIZE_PX

  // The selected vessel is placed first so it always keeps its pill.
  const selected = ordered.find((vessel) => vessel.mmsi === alwaysLabel)
  if (selected) {
    placed.add(labelRect(selected, positions.get(selected.mmsi)!, fields))
    labelled.push(selected)
  }
  for (const vessel of ordered) {
    if (vessel === selected) continue
    // A wide view groups everything it can: pills go only to vessels with no
    // neighbour to be counted with (decided with the leftovers below).
    if (options.groupAll) {
      leftOver.push(vessel)
      continue
    }
    const rect = labelRect(vessel, positions.get(vessel.mmsi)!, fields)
    if (placed.collides(rect)) {
      leftOver.push(vessel)
      continue
    }
    placed.add(rect)
    labelled.push(vessel)
  }

  const cells = new Map<string, SeaVessel[]>()
  for (const vessel of leftOver) {
    const at = positions.get(vessel.mmsi)!
    const key = `${Math.floor(at.x / cellPx)}:${Math.floor(at.y / cellPx)}`
    const members = cells.get(key)
    if (members) members.push(vessel)
    else cells.set(key, [vessel])
  }
  const counts: VesselCount[] = []
  for (const [key, members] of cells) {
    if (members.length === 1) {
      // A count of one says less than a pill, so a lone leftover keeps its
      // pill (and is allowed to overlap) whatever the view width: the details
      // the operator switched on are shown by default, never on hover alone.
      labelled.push(members[0]!)
      continue
    }
    let sumX = 0
    let sumY = 0
    let sumLon = 0
    let sumLat = 0
    for (const member of members) {
      const at = positions.get(member.mmsi)!
      sumX += at.x
      sumY += at.y
      sumLon += member.lon
      sumLat += member.lat
    }
    counts.push({
      key,
      members,
      position: { x: sumX / members.length, y: sumY / members.length },
      lngLat: [sumLon / members.length, sumLat / members.length],
    })
  }
  return { labelled, counts }
}
