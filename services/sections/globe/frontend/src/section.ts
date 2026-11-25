import { getActivePinia } from 'pinia'
import { registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { registerGlobeSettings } from './settings'

/**
 * Registers the GLOBE section with the shell (route + nav entry).
 *
 * The section's `./register` entry: the shell calls it once at boot, statically
 * in dev and tests and through Module Federation in the built app. It is off
 * until Settings › App Settings › 3D Globe sets `globe.enabled` (the shell's
 * `getEnabledSectionIds`), so the nav hides it and `/globe/` redirects.
 *
 * The view is a lazy route: the globe's code (and later its renderer and map
 * data) downloads on the first visit, never at boot.
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'globe')

  // Its on/off switch, in Settings › App Settings.
  registerGlobeSettings()

  registerSection({
    id: 'globe',
    label: 'GLOBE',
    navOrder: 60,
    enabledByDefault: false,
    route: { path: '/globe/', component: () => import('./GlobeView.vue') },
  })
}
