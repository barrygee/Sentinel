import { defineComponent, h } from 'vue'
import { getRegisteredSections, registerSection } from '@sentinel/shell-api/shell/sectionRegistry'
import type { ShellContext } from '@sentinel/shell-api/shell/shellContext'
import SectionUnavailable from './SectionUnavailable.vue'

/** A section module's `./register` entry: its default export registers it with the shell. */
export interface SectionRegisterModule {
  default: (shell: ShellContext) => void
}

/** One section the deployment includes, and how to fetch its `./register` entry. */
export interface SectionSource {
  /** e.g. `air` — also its route (`/air/`) and settings namespace. */
  id: string
  load: () => Promise<SectionRegisterModule>
}

/**
 * Loads every section and registers them with the shell, in the order given.
 *
 * The modules are fetched in parallel, but `register()` is called in list
 * order, so the registries (settings sections, notification targets, footer
 * items…) always fill in the same order however the network answers.
 *
 * A section that cannot be loaded, or whose `register()` throws, does not take
 * the app down: the shell registers a stand-in in its place, so its nav entry
 * still shows and its route explains the section is unavailable (plan §3.5).
 * That includes a remote that is not on the host's Pinia: its `register()`
 * refuses to run (`assertHostPinia`).
 *
 * @param shell handed to every `register()`.
 * @returns the ids of the sections that are unavailable.
 */
export async function loadSections(
  sources: SectionSource[],
  shell: ShellContext,
): Promise<string[]> {
  const loaded = await Promise.allSettled(sources.map((source) => source.load()))
  const unavailable: string[] = []
  loaded.forEach((result, index) => {
    const source = sources[index]!
    try {
      if (result.status === 'rejected') throw result.reason
      result.value.default(shell)
    } catch (error) {
      console.error(`[sentinel] section "${source.id}" is unavailable:`, error)
      unavailable.push(source.id)
      // A register() that threw part-way may already have registered the
      // section itself; it then keeps whatever it managed rather than a stand-in.
      if (!getRegisteredSections().some((section) => section.id === source.id)) {
        registerUnavailableSection(source.id, (index + 1) * 10)
      }
    }
  })
  return unavailable
}

/**
 * The shell's stand-in for a section that failed to load: same id, route and
 * nav slot (sections register at navOrder 10, 20, …), a view saying it is
 * unavailable, and off unless the stored settings switch it on.
 */
function registerUnavailableSection(sectionId: string, navOrder: number): void {
  const label = sectionId.toUpperCase()
  registerSection({
    id: sectionId,
    label,
    navOrder,
    enabledByDefault: false,
    unavailable: true,
    route: {
      path: `/${sectionId}/`,
      component: defineComponent({
        name: 'SectionUnavailableRoute',
        setup: () => () => h(SectionUnavailable, { label }),
      }),
    },
  })
}
