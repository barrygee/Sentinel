import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type { Bbox } from '../feeds/globeFeedTypes'
import type { LatLon } from '../globe/geo'
import type { GlobeObject, GlobeObjectKind } from '../globe/globeObject'
import { GlobeScene } from '../globe/globeScene'

/** Where the globe is in its start-up: drawing its map, showing, or impossible here (no WebGL). */
export type GlobeStatus = 'loading' | 'ready' | 'unavailable'

/** What a component gets back from {@link useGlobeScene}. */
export interface GlobeSceneHandle {
  status: Ref<GlobeStatus>
  zoomIn: () => void
  zoomOut: () => void
  /** Keyboard control; returns true when the key was used (prevent its default). */
  handleKey: (key: string) => boolean
  /** Glides the camera over an object; false when it isn't on the globe. */
  flyToObject: (key: string) => boolean
}

/** The live objects to draw, and what the globe tells its host. */
export interface GlobeSceneContent {
  /** Every kind's objects. */
  objects: Ref<Record<GlobeObjectKind, GlobeObject[]>>
  /** Which kinds are shown. */
  visibleKinds: Ref<Record<GlobeObjectKind, boolean>>
  /** The selected object's key (null = none). */
  selectedKey: Ref<string | null>
  /** The viewer clicked an object (its key) or empty space (null). */
  onSelect: (key: string | null) => void
  /** The view settled on a new area. */
  onViewBoundsChange: (bounds: Bbox) => void
}

const KINDS: readonly GlobeObjectKind[] = ['air', 'sea', 'aprs']

/**
 * Runs the 3D globe on a canvas for the lifetime of the calling component:
 * builds it on mount, sizes it with its element, pauses it while the tab is
 * hidden, moves the home view with `home`, and frees everything (WebGL context
 * included) on unmount.
 *
 * @param canvas the canvas to draw on.
 * @param overlay an element laid over the canvas, for the HTML labels.
 * @param home the operator's location (null while unknown).
 * @param content the live objects and the selection, kept in step with the globe.
 */
export function useGlobeScene(
  canvas: Ref<HTMLCanvasElement | null>,
  overlay: Ref<HTMLElement | null>,
  home: Ref<LatLon | null>,
  content: GlobeSceneContent,
): GlobeSceneHandle {
  const status = ref<GlobeStatus>('loading')
  const scene = shallowRef<GlobeScene | null>(null)
  let resizeObserver: ResizeObserver | null = null

  const onVisibilityChange = (): void => {
    if (document.hidden) scene.value?.pause()
    else scene.value?.start()
  }

  onMounted(() => {
    if (!canvas.value || !overlay.value) return
    const created = GlobeScene.create({
      canvas: canvas.value,
      overlay: overlay.value,
      home: home.value,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onSelect: content.onSelect,
      onViewBoundsChange: content.onViewBoundsChange,
    })
    if (!created) {
      status.value = 'unavailable'
      return
    }
    scene.value = created
    applyObjects(created)
    applyVisibility(created)
    created.select(content.selectedKey.value)
    const element = canvas.value
    created.resize(element.clientWidth, element.clientHeight)
    resizeObserver = new ResizeObserver(() =>
      created.resize(element.clientWidth, element.clientHeight),
    )
    resizeObserver.observe(element)
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!document.hidden) created.start()
    created.ready.then(
      () => {
        if (scene.value === created) status.value = 'ready'
      },
      () => {
        // The map data failed to load: show the globe anyway (stars, atmosphere,
        // labels) rather than an endless loading state.
        if (scene.value === created) status.value = 'ready'
      },
    )
  })

  function applyObjects(target: GlobeScene): void {
    for (const kind of KINDS) target.setObjects(kind, content.objects.value[kind])
  }

  function applyVisibility(target: GlobeScene): void {
    for (const kind of KINDS) target.setLayerVisible(kind, content.visibleKinds.value[kind])
  }

  watch(home, (location) => scene.value?.setHome(location))
  watch(content.objects, () => scene.value && applyObjects(scene.value))
  watch(content.visibleKinds, () => scene.value && applyVisibility(scene.value))
  watch(content.selectedKey, (key) => scene.value?.select(key))

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    scene.value?.dispose()
    scene.value = null
  })

  return {
    status,
    zoomIn: () => scene.value?.zoomIn(),
    zoomOut: () => scene.value?.zoomOut(),
    handleKey: (key) => scene.value?.handleKey(key) ?? false,
    flyToObject: (key) => scene.value?.flyToObject(key) ?? false,
  }
}
