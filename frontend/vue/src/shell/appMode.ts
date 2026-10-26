import { APP_MODES, type AppMode, type AppModeInfo } from '@sentinel/shell-api/types/appMode'
import type { SettingItem } from '@sentinel/shell-api/types/settings'

/**
 * The deployment's app mode, read once at boot from core's `GET /api/app/mode`
 * (main.ts) and fixed for the life of the page: it is set by the compose file
 * the stack was started with, so it never changes under a running app.
 */

/** What the shell assumes when core can't say: the full app, as before app modes. */
export const FULL_APP_MODE: AppModeInfo = { mode: 'full', landingPath: '/' }

let currentAppMode: AppModeInfo = FULL_APP_MODE

function isAppModeInfo(body: unknown): body is AppModeInfo {
  if (typeof body !== 'object' || body === null) return false
  const { mode, landingPath } = body as Record<string, unknown>
  return (
    APP_MODES.includes(mode as AppMode) &&
    typeof landingPath === 'string' &&
    landingPath.startsWith('/')
  )
}

/**
 * Asks core which mode it runs in. Never throws: an unreachable core or an
 * unexpected reply is the full app, so a core that predates app modes (or a
 * blip at boot) still gets the map rather than a blank page.
 */
export async function fetchAppMode(): Promise<AppModeInfo> {
  try {
    const response = await fetch('/api/app/mode')
    if (!response.ok) return FULL_APP_MODE
    const body: unknown = await response.json()
    return isAppModeInfo(body) ? body : FULL_APP_MODE
  } catch {
    return FULL_APP_MODE
  }
}

/** Records the mode boot resolved, for everything that reads it after. */
export function setAppMode(mode: AppModeInfo): void {
  currentAppMode = mode
}

/** The mode this page booted in. */
export function getAppMode(): AppModeInfo {
  return currentAppMode
}

/** Whether a setting is offered in the mode this page booted in (no `modes` = every mode). */
export function isOfferedInAppMode(setting: Pick<SettingItem, 'modes'>): boolean {
  return !setting.modes || setting.modes.includes(currentAppMode.mode)
}
