import { registerSection } from '@/shell/sectionRegistry'
import SeaView from './SeaView.vue'
// Registers this section's Settings nav entry and items (F3).
import './settings'

/**
 * Registers the SEA section with the shell (route + nav entry).
 *
 * In-monolith stand-in for the `register(shell)` entry a future `sea`
 * Module Federation remote will export (docs/plans/section-containers.md §3.6).
 */
registerSection({
  id: 'sea',
  label: 'SEA',
  navOrder: 30,
  route: { path: '/sea/', component: SeaView },
})
