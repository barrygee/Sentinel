import { getActivePinia } from 'pinia'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import { registerFooterItem } from '@sentinel/shell-api/shell/footerRegistry'
import { registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { createSdrRadioCapability } from './radioCapability'
import { createSdrRadioSitesCapability } from './radioSitesCapability'
import SdrFooterIndicator from './SdrFooterIndicator.vue'
import { registerSdrSettings } from './settings'

/**
 * Registers the SDR section with the shell (route + nav entry), plus the
 * persistent radio pane mounted in `MapSidebar`'s `#radio` slot.
 *
 * SDR is the only section that registers a persistent radio pane: the engine
 * (AudioContext, worklet, IQ/decode sockets — `useSdrAudio.ts`/`useSdrDecode.ts`)
 * holds module-level singletons that must survive navigation to every other
 * section, which is why the pane is mounted once by `App.vue` rather than
 * per-route (docs/plans/section-containers.md §1.4, §3.5).
 *
 * The section's `./register` entry: the shell calls it once at boot, statically
 * in dev and tests and through Module Federation in the built app. The view
 * and the engine are handed over as loaders, so this entry stays small and
 * the shell can mount before the engine has arrived.
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'sdr')

  // Its Settings nav entry and items (F3).
  registerSdrSettings()

  registerSection({
    id: 'sdr',
    label: 'SDR',
    navOrder: 50,
    enabledByDefault: true,
    route: { path: '/sdr/', component: () => import('./SdrView.vue') },
    loadPersistentRadioPane: () => import('./engine'),
  })

  // The `radio` capability other sections tune and file frequencies through
  // (F6) — provided here, at registration, so it exists before the app mounts.
  provideCapability('radio', createSdrRadioCapability())
  // The Sentry fleet (site positions, published devices) for core's map
  // markers and Air's ADS-B receiver picker.
  provideCapability('radioSites', createSdrRadioSitesCapability())

  // The footer's tuned-frequency readout, shown on every page.
  registerFooterItem({ id: 'sdr-frequency', order: 10, component: SdrFooterIndicator })
}
