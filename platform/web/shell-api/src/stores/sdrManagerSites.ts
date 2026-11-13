import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getCapability } from '@sentinel/shell-api/shell/capabilities'
import type { RadioSite } from '@sentinel/shell-api/shell/radioSitesCapability'
import type { RadioSummary } from '@sentinel/shell-api/shell/radioCapability'

/**
 * How often the site list is refreshed while a map is open, in ms.
 *
 * Slow on purpose: an SDR host is a fixed installation, so this poll is watching
 * for hosts being added, removed or going off the air, not for movement. The
 * backend serves the list from its poller cache, so a tick costs no round trip
 * to any Pi.
 */
const SDR_MANAGER_SITE_POLL_INTERVAL_MS = 15_000

/**
 * The SDR hosts that report where they are — the cross-cutting state behind
 * the SDR Manager markers on every domain map (`SdrManagerSitesControl`).
 *
 * A store rather than per-map component state because all four domain maps plot
 * the same fleet: an operator switching from AIR to LAND should find the sites
 * already there, not wait out another fetch. Polling is ref-counted so the last
 * map to unmount stops it.
 */
export const useSdrManagerSitesStore = defineStore('sdrManagerSites', () => {
  /** Every enabled SDR host with a known position, newest snapshot wins. */
  const sites = ref<RadioSite[]>([])
  /**
   * Radios added by IP and port that were given a position, as `kind: 'radio'`
   * sites. Kept apart from `sites` (the SDR hosts), which range rings and
   * overhead alerts key by host id; the map draws both.
   */
  const radioSites = ref<RadioSite[]>([])
  /**
   * True once a list has been fetched successfully at least once.
   *
   * An empty `sites` means two different things — "no host reports a position"
   * and "we have not asked yet" — and a consumer that pins itself to one site
   * (the range-ring origin) has to tell them apart: only the first is grounds
   * for concluding the site is gone.
   */
  const loaded = ref(false)

  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollers = 0

  /** Refresh both lists: the SDR hosts and the placed radios. */
  async function fetchSites(): Promise<void> {
    await Promise.all([fetchHostSites(), fetchRadioSites()])
  }

  /** Refresh the host list from the radio platform's `radioSites` capability.
   *  Silent on transient/offline failures — the last-known list simply
   *  persists, which is the truthful thing to draw. With no radio platform
   *  registered there are no sites, and the list never counts as loaded. */
  async function fetchHostSites(): Promise<void> {
    const hostSites = getCapability('radioSites')
    if (!hostSites) return
    try {
      sites.value = await hostSites.listSites()
      loaded.value = true
    } catch {
      /* offline / transient — keep the current list */
    }
  }

  /** Refresh the placed radios from the SDR section's `radio` capability; silent
   *  on failure like the hosts, and none without an SDR section. */
  async function fetchRadioSites(): Promise<void> {
    const radio = getCapability('radio')
    if (!radio) return
    try {
      radioSites.value = (await radio.listRadios()).flatMap(placedRadioSite)
    } catch {
      /* offline / transient — keep the current list */
    }
  }

  /** Begin polling the site list (ref-counted). The first caller fetches
   *  immediately and starts the interval; later callers just join it. */
  function startPolling(): void {
    pollers += 1
    if (pollTimer !== null) return
    void fetchSites()
    pollTimer = setInterval(() => void fetchSites(), SDR_MANAGER_SITE_POLL_INTERVAL_MS)
  }

  /** Stop polling when the last consumer leaves (ref-counted). */
  function stopPolling(): void {
    pollers = Math.max(0, pollers - 1)
    if (pollers > 0 || pollTimer === null) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  return { sites, radioSites, loaded, fetchSites, startPolling, stopPolling }
})

/**
 * A radio as a map site, or none: only an enabled radio added by IP and port
 * with a position is one. A radio mirroring an SDR host's dongle is shown by
 * its host's site instead.
 */
function placedRadioSite(radio: RadioSummary): RadioSite[] {
  if (!radio.enabled || radio.sdrManagerHostId != null) return []
  if (radio.latitude == null || radio.longitude == null) return []
  return [
    {
      kind: 'radio',
      id: radio.id,
      name: radio.name || null,
      address: radio.host ?? '',
      port: radio.port ?? 0,
      reachable: radio.available,
      latitude: radio.latitude,
      longitude: radio.longitude,
      updated_at: null,
    },
  ]
}
