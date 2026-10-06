/**
 * The single place that imports every section's registration module.
 *
 * Each import below runs its section's `registerSection(...)` call as a
 * side effect (see e.g. `components/sea/section.ts`). This file is the one
 * the router and `main.ts` import to populate the registry before it's read
 * — and the one file P4 (Module Federation) replaces with a runtime loader
 * that fetches each remote's `./register` entry instead of statically
 * importing it. Every other shell module only ever reads from
 * `shell/sectionRegistry.ts`, so that swap is the only file federation needs
 * to touch.
 */
import '@sentinel/section-air/section'
import '@sentinel/section-space/section'
import '@sentinel/section-sea/section'
import '@sentinel/section-land/section'
import '@sentinel/section-sdr/section'
