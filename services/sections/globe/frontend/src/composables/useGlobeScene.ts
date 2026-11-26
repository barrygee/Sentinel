import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type { LatLon } from '../globe/geo'
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
}

/**
 * Runs the 3D globe on a canvas for the lifetime of the calling component:
 * builds it on mount, sizes it with its element, pauses it while the tab is
 * hidden, moves the home view with `home`, and frees everything (WebGL context
 * included) on unmount.
 *
 * @param canvas the canvas to draw on.
 * @param overlay an element laid over the canvas, for the HTML labels.
 * @param home the operator's location (null while unknown).
 */
export function useGlobeScene(
  canvas: Ref<HTMLCanvasElement | null>,
  overlay: Ref<HTMLElement | null>,
  home: Ref<LatLon | null>,
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
    })
    if (!created) {
      status.value = 'unavailable'
      return
    }
    scene.value = created
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

  watch(home, (location) => scene.value?.setHome(location))

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
  }
}
