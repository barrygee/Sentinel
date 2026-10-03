import { registerSection } from '@/shell/sectionRegistry'
import SpaceView from './SpaceView.vue'
// Registers this section's Settings nav entry and items (F3).
import './settings'

/**
 * Registers the SPACE section with the shell (route + nav entry).
 *
 * In-monolith stand-in for the `register(shell)` entry a future `space`
 * Module Federation remote will export (docs/plans/section-containers.md §3.6).
 */
registerSection({
  id: 'space',
  label: 'SPACE',
  navOrder: 20,
  route: { path: '/space/', component: SpaceView },
})
