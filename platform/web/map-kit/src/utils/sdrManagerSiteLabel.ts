import type { RadioSite } from '@sentinel/shell-api/shell/radioSitesCapability'
import { useAppStore } from '@sentinel/shell-api/stores/app'

/**
 * What to call an SDR host site: this Sentinel's own SDR Manager as this
 * machine (`<name> (This machine)`, from the app store), any other site by its
 * name if it has one, otherwise where it answers. A host is registered by
 * address and named later, so the address is the only label some sites ever have.
 *
 * Lives here rather than beside the map markers because the range-ring origin
 * picker names the same sites in a plain Vue panel, and must not pull a
 * MapLibre control (and with it maplibre-gl) in to do it.
 *
 * Read inside a computed or watcher, the local site's label follows the
 * machine name as it is applied.
 */
export function siteLabel(site: RadioSite): string {
  // The store is only asked for this machine's own site, the one that needs it.
  if (site.is_local) return useAppStore().thisMachineLabel
  return site.name?.trim() || `${site.address}:${site.port}`
}
