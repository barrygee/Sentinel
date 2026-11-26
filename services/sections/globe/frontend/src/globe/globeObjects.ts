/**
 * The globe's live objects: one GPU point layer per kind, their label pills,
 * and which object is selected or under the pointer.
 */
import { Group, type Scene, type Texture } from 'three'
import type { ScreenBox } from './countryLabels'
import type { GlobeObject, GlobeObjectKind } from './globeObject'
import type { GlobeProjector } from './globeProjector'
import { ObjectLabelLayer, type LabelCandidate } from './labelLayer'
import { ObjectPointLayer } from './objectLayer'
import { createSpriteAtlas } from './objectSprites'

/** How close (CSS pixels) a click or hover must come to a mark to reach it. */
export const PICK_RADIUS_PX = 12

/** Kinds in drawing order: vessels and stations under aircraft. */
const KINDS: readonly GlobeObjectKind[] = ['sea', 'aprs', 'air']

/** The live objects on one globe. */
export class GlobeObjects {
  private readonly group = new Group()
  private readonly atlas: Texture | null = createSpriteAtlas()
  private readonly layers: Record<GlobeObjectKind, ObjectPointLayer>
  private readonly labels: ObjectLabelLayer
  private selectedKey: string | null = null
  private hoveredKey: string | null = null

  constructor(scene: Scene, overlay: HTMLElement, pixelRatio: number) {
    this.layers = {
      sea: new ObjectPointLayer(this.atlas, pixelRatio),
      aprs: new ObjectPointLayer(this.atlas, pixelRatio),
      air: new ObjectPointLayer(this.atlas, pixelRatio),
    }
    KINDS.forEach((kind, order) => {
      // Later kinds draw on top where marks overlap.
      this.layers[kind].points.renderOrder = 10 + order
      this.group.add(this.layers[kind].points)
    })
    scene.add(this.group)
    this.labels = new ObjectLabelLayer(overlay)
  }

  /** Replaces one kind's objects. */
  setObjects(kind: GlobeObjectKind, objects: GlobeObject[]): void {
    this.layers[kind].setObjects(objects, this.selectedKey)
    this.labels.prune(
      new Set(KINDS.flatMap((each) => this.layers[each].objects.map((object) => object.key))),
    )
    this.labels.invalidate()
  }

  /** Shows or hides one kind. */
  setVisible(kind: GlobeObjectKind, visible: boolean): void {
    this.layers[kind].visible = visible
    this.labels.invalidate()
  }

  /** Marks one object as selected (null = none). */
  select(key: string | null): void {
    this.selectedKey = key
    for (const kind of KINDS) this.layers[kind].setSelected(key)
    this.labels.invalidate()
  }

  /** The object with `key`, if it is in a layer (shown or not). */
  find(key: string): GlobeObject | null {
    for (const kind of KINDS) {
      const found = this.layers[kind].objects.find((object) => object.key === key)
      if (found) return found
    }
    return null
  }

  /**
   * The nearest visible object's key within {@link PICK_RADIUS_PX} of canvas
   * point (x, y), or null.
   */
  pick(projector: GlobeProjector, x: number, y: number, radiusPx = PICK_RADIUS_PX): string | null {
    let bestKey: string | null = null
    let bestDistanceSq = radiusPx * radiusPx
    for (const kind of KINDS) {
      const layer = this.layers[kind]
      if (!layer.visible) continue
      layer.positions.forEach((position, index) => {
        const point = projector.toScreen(position)
        const distanceSq = (point.x - x) ** 2 + (point.y - y) ** 2
        if (distanceSq >= bestDistanceSq || point.depth > 1 || !projector.isFacing(position)) return
        bestDistanceSq = distanceSq
        bestKey = layer.objects[index]!.key
      })
    }
    return bestKey
  }

  /** Sets the object under the pointer (null = none); returns true when it changed. */
  hover(key: string | null): boolean {
    if (key === this.hoveredKey) return false
    this.hoveredKey = key
    this.labels.invalidate()
    return true
  }

  /** Places the pills for this frame and keeps the heading maths in step with the canvas. */
  update(projector: GlobeProjector, reserved: ScreenBox[], nowMs: number): void {
    const candidates: LabelCandidate[] = []
    for (const kind of KINDS) {
      const layer = this.layers[kind]
      layer.setAspect(projector.width / projector.height)
      if (!layer.visible) continue
      layer.objects.forEach((object, index) =>
        candidates.push({ object, position: layer.positions[index]! }),
      )
    }
    this.labels.update(projector, candidates, this.selectedKey, this.hoveredKey, reserved, nowMs)
  }

  /** Frees the layers, the atlas and the pills. */
  dispose(): void {
    for (const kind of KINDS) this.layers[kind].dispose()
    this.group.removeFromParent()
    this.atlas?.dispose()
    this.labels.dispose()
  }
}
