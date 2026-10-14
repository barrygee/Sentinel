import { computed, ref, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'

/**
 * The view route: the page on screen, which is not always the URL's route.
 *
 * Settings has its own URLs (`/settings/<section>`) so a link can open a
 * settings page directly, but it is still a panel over the page you were on:
 * that page stays mounted underneath, its map and the SDR audio undisturbed.
 * While a settings URL is active the shell renders the page underneath and
 * records its path here, so anything that lays itself out by route (the SDR
 * panel's full-page vs. tab mode) keeps following the page, not the panel.
 *
 * The shell writes it (`setViewRoutePath`); sections read it
 * (`useViewRoutePath`). Unset — before the shell has routed, and in tests —
 * the view route is simply the current route.
 */
const viewRoutePath = ref<string | null>(null)

/** Records the path of the page on screen. Called by the shell on every navigation. */
export function setViewRoutePath(path: string | null): void {
  viewRoutePath.value = path
}

/**
 * The path of the page on screen: the page under the Settings panel while a
 * settings URL is active, otherwise the current route's path. Call from setup.
 */
export function useViewRoutePath(): ComputedRef<string> {
  const route = useRoute()
  return computed(() => viewRoutePath.value ?? route.path)
}
