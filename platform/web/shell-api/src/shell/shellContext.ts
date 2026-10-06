import type { Pinia } from 'pinia'

/**
 * What the shell hands every section's `register()` (docs/plans/section-containers.md §3.6).
 *
 * Today it carries only the host's Pinia; the registries are still reached by
 * importing their `@sentinel/shell-api/shell/*` modules, which the host shares
 * with every remote as singletons.
 */
export interface ShellContext {
  /** The Pinia instance the shell installed on the app. */
  pinia: Pinia
}

/**
 * Throws unless a section is running on the host's Pinia.
 *
 * `sectionPinia` must be the section's own `getActivePinia()` — imported in the
 * section's code, so it resolves `pinia` the way the section's stores do. A
 * remote built with its own copy of `pinia` (a federation `shared` slip) sees
 * no active Pinia, or a different one, and its stores would then hold state
 * the shell and the other sections never see. Failing in `register()` turns
 * that silent split into the shell's "section unavailable" page.
 */
export function assertHostPinia(
  shell: ShellContext,
  sectionPinia: Pinia | undefined,
  sectionId: string,
): void {
  if (sectionPinia !== shell.pinia) {
    throw new Error(
      `Section "${sectionId}" is not using the shell's Pinia — its remote must share pinia with the host`,
    )
  }
}
