import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import {
  isSettingsRoute,
  settingsReturn,
  settingsPath,
  settingsSectionOf,
} from '@/router/settingsRoute'

/**
 * Keeps the Settings panel and its URL in step, both ways.
 *
 * The settings store stays the panel's source of truth, so every existing way
 * of opening it (footer button, menu, "OPEN SETTINGS" on a notice, a Sentry
 * marker's MORE) works as before and now also moves the URL:
 * - URL → panel: a `/settings/<section>` URL opens the panel on that section;
 *   leaving it (Back, a link) closes the panel.
 * - panel → URL: opening the panel pushes `/settings/<section>` (leaving the
 *   section, as a section link does), switching section replaces it, and
 *   closing returns to the section it came from — by going back when it was
 *   opened from it, so Back and close agree.
 *
 * Call once, from App.
 */
export function useSettingsRouteSync(): void {
  const route = useRoute()
  const router = useRouter()
  const store = useSettingsStore()

  watch(
    () => [isSettingsRoute(route), settingsSectionOf(route)] as const,
    ([onSettings, section]) => {
      if (onSettings) {
        if (!store.open || store.activeSection !== section) store.openPanel(section)
      } else if (store.open) {
        store.closePanel()
      }
    },
    { immediate: true },
  )

  watch(
    () => [store.open, store.activeSection] as const,
    ([open, section]) => {
      const onSettings = isSettingsRoute(route)
      if (open) {
        // The panel names its section once it has resolved which one opens.
        if (!section) return
        const target = settingsPath(section)
        if (route.path === target) return
        void (onSettings ? router.replace(target) : router.push(target))
      } else if (onSettings) {
        const returnPath = settingsReturn.path ?? '/'
        if ((window.history.state as { back?: unknown } | null)?.back === returnPath) router.back()
        else void router.replace(returnPath)
      }
    },
  )
}
