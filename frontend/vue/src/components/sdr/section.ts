import { registerSection } from '@/shell/sectionRegistry'
import SdrView from './SdrView.vue'
import SdrTabPanel from './SdrTabPanel.vue'

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
  route: { path: '/sdr/', component: SdrView },
  persistentRadioPane: SdrTabPanel,
})
