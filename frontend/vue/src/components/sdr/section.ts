import { provideCapability } from '@/shell/capabilities'
import { registerFooterItem } from '@/shell/footerRegistry'
import { registerSection } from '@/shell/sectionRegistry'
import { createSdrRadioCapability } from './radioCapability'
import { createSdrRadioSitesCapability } from './radioSitesCapability'
import SdrFooterIndicator from './SdrFooterIndicator.vue'
import SdrView from './SdrView.vue'
import SdrTabPanel from './SdrTabPanel.vue'
// Registers this section's Settings nav entry and items (F3).
import './settings'

/**
 * Registers the SDR section with the shell (route + nav entry), plus the
 * persistent radio pane mounted in `MapSidebar`'s `#radio` slot.
 *
 * SDR is the only section that registers a `persistentRadioPane`: the engine
 * (AudioContext, worklet, IQ/decode sockets — `useSdrAudio.ts`/`useSdrDecode.ts`)
 * holds module-level singletons that must survive navigation to every other
 * section, which is why the pane is mounted once by `App.vue` rather than
 * per-route (docs/plans/section-containers.md §1.4, §3.5). In-monolith
 * stand-in for the future `sdr` remote's eager `./engine` + lazy `./view`
 * exports.
 */
registerSection({
  id: 'sdr',
  label: 'SDR',
  navOrder: 50,
  enabledByDefault: true,
  route: { path: '/sdr/', component: SdrView },
  persistentRadioPane: SdrTabPanel,
})

// The `radio` capability other sections tune and file frequencies through
// (F6) — provided here, at registration, so it exists before the app mounts.
provideCapability('radio', createSdrRadioCapability())
// The Sentry fleet (site positions, published devices) for core's map
// markers and Air's ADS-B receiver picker.
provideCapability('radioSites', createSdrRadioSitesCapability())

// The footer's tuned-frequency readout, shown on every page.
registerFooterItem({ id: 'sdr-frequency', order: 10, component: SdrFooterIndicator })
