import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { SIDEBAR_PANE_IDS, type SidebarPaneId } from '@/constants/sidebarPanes'

/**
 * Tracks whether a `MapSidebar` pane's DOM node exists yet, so a domain view
 * can gate its `<Teleport>` on it (`v-if="ready"`) rather than risk activating
 * against a null target.
 *
 * MapSidebar is a sibling of `<RouterView>` in `App.vue` and mounts in the
 * same pass, so in practice the pane already exists by the time a view reads
 * this. It's polled with `requestAnimationFrame` regardless, as a defensive
 * fallback against any future mount-order change (route-level code
 * splitting, a reordered `App.vue`, etc.) — native `<Teleport defer>` was
 * evaluated for this and rejected: when its target is genuinely absent at
 * the deferred flush, it gives up permanently (no retry) and Vue's own
 * `unmount()`/`setRef()` throws on a later unmount of a `ref`-bound
 * teleported child whose target never resolved. Polling degrades safely
 * instead — it simply keeps trying, and the `ready` guard keeps the
 * `<Teleport>` (and its child) from ever mounting until the target exists.
 *
 * @param paneId - The sidebar pane to wait for (see {@link SIDEBAR_PANE_IDS}).
 * @returns `ready` — a ref that flips to `true` once the pane's element
 *   exists in the DOM, and back to `false` on unmount.
 */
export function useSidebarPaneTarget(paneId: SidebarPaneId): { ready: Ref<boolean> } {
  const elementId = SIDEBAR_PANE_IDS[paneId]
  const ready = ref(!!document.getElementById(elementId))
  let unmounted = false

  if (!ready.value) {
    onMounted(() => {
      function poll(): void {
        if (unmounted) return
        if (document.getElementById(elementId)) {
          ready.value = true
        } else {
          requestAnimationFrame(poll)
        }
      }
      requestAnimationFrame(poll)
    })
  }

  onBeforeUnmount(() => {
    unmounted = true
    ready.value = false
  })

  return { ready }
}
