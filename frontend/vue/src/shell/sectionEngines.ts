import { shallowRef, type Component, type ShallowRef } from 'vue'
import { getPersistentRadioPaneLoader } from '@sentinel/shell-api/shell/sectionRegistry'

/**
 * How long boot waits for a section engine before mounting without it.
 *
 * Long enough that a healthy deployment (remotes on the same host or LAN)
 * always mounts with the SDR pane already in place, so nothing pops in; short
 * enough that a slow or hung sdr remote cannot hold every other section's
 * first paint hostage (docs/plans/section-containers.md §3.5).
 */
export const ENGINE_BOOT_TIMEOUT_MS = 3000

/** How engine loading stood when boot stopped waiting for it. */
export type EngineBootOutcome = 'none' | 'ready' | 'failed' | 'late'

// Module-level so App.vue reads the same ref however often it remounts; set
// once, when the engine arrives, and never cleared — a loaded remote is never
// unloaded in the session (§3.5).
const persistentRadioPane = shallowRef<Component>()

/** The persistent radio pane, once its engine has loaded. App.vue renders it when set. */
export function usePersistentRadioPane(): Readonly<ShallowRef<Component | undefined>> {
  return persistentRadioPane
}

/**
 * Starts loading the registered section engine (today: the sdr radio pane)
 * and resolves when boot may mount the app — as soon as the engine is in, or
 * after `timeoutMs` if it is not.
 *
 * Loading carries on past the timeout: when the engine arrives later, the pane
 * ref is set and App.vue mounts it then (the late-mount path). Until it
 * mounts, the `radio` capability queues the tunes and restores other sections
 * send it, and delivers them in order when the pane attaches the engine
 * (`attachRadioEngine` in the sdr section). An engine that fails to load is
 * logged; the app runs on without the pane, as it does with no sdr section.
 *
 * Call after `loadSections`, so the sections have registered their engines.
 */
export async function startSectionEngines(
  timeoutMs: number = ENGINE_BOOT_TIMEOUT_MS,
): Promise<EngineBootOutcome> {
  const loadPane = getPersistentRadioPaneLoader()
  if (!loadPane) return 'none'

  const engineLoad: Promise<EngineBootOutcome> = loadPane().then(
    (paneModule) => {
      persistentRadioPane.value = paneModule.default
      return 'ready'
    },
    (error: unknown) => {
      console.error('[sentinel] the SDR engine could not be loaded:', error)
      return 'failed'
    },
  )

  let bootTimer: ReturnType<typeof setTimeout> | undefined
  const bootDeadline = new Promise<EngineBootOutcome>((resolve) => {
    bootTimer = setTimeout(() => {
      console.warn(
        `[sentinel] the SDR engine is still loading after ${timeoutMs} ms — mounting without it`,
      )
      resolve('late')
    }, timeoutMs)
  })
  try {
    return await Promise.race([engineLoad, bootDeadline])
  } finally {
    clearTimeout(bootTimer)
  }
}

/** Test seam: forget the loaded pane. */
export function resetSectionEnginesForTests(): void {
  persistentRadioPane.value = undefined
}
