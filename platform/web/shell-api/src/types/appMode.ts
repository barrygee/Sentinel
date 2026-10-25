/**
 * The deployment mode core reports (`GET /api/app/mode`, backend/core/app_mode.py):
 * - `full` — the map app with every section;
 * - `sdr-manager-local-only` — only this machine's SDRs, shared with other
 *   Sentinels: the shell shows Settings › SDR Manager and nothing else (ADR 0007).
 */
export type AppMode = 'full' | 'sdr-manager-local-only'

/** Every mode, in the order core documents them. */
export const APP_MODES: readonly AppMode[] = ['full', 'sdr-manager-local-only']

/** Body of `GET /api/app/mode`. */
export interface AppModeInfo {
  mode: AppMode
  /** Where `/` lands in this mode, e.g. `/settings/sdr-manager`. */
  landingPath: string
}
