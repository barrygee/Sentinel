import type { AppModeInfo } from '@sentinel/shell-api/types/appMode'
import SdrManagerOnlyShell from '@/shell/SdrManagerOnlyShell.vue'
import { createSdrManagerOnlyRouter } from '@/router/sdrManagerOnlyRouter'
import type { ModeBoot } from './modeBoot'

/** Boots SDR Manager-only mode: Settings › SDR Manager and nothing else (ADR 0007). */
export function sdrManagerOnlyBoot(mode: AppModeInfo): ModeBoot {
  return {
    rootComponent: SdrManagerOnlyShell,
    createRouter: () => createSdrManagerOnlyRouter(mode.landingPath),
    // No sections, so no section engines.
    startEngines: async () => {},
  }
}
