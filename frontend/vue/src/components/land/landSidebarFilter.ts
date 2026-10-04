import { useLandStore, type LandLayer } from '@/stores/land'
import { useSdrStore } from '@/stores/sdr'
import type { SidebarFilterSubTabs } from '@/shell/sidebarRegistry'
import LandFilterSubTabIcon from './LandFilterSubTabIcon.vue'

/**
 * Land's FILTER rail sub-tabs are layer toggles (F2 — moved out of
 * MapSidebar): the chosen tab is the one layer the map draws (each is hundreds
 * of markers, so they are never stacked), saved as `land.defaultLayers` at
 * once.
 *
 * APRS has a receiver only once an SDR has been named as the APRS radio in
 * Settings → LAND; without one nothing is decoding, so its tab is disabled
 * rather than offering a layer that could only be empty. (Reading the APRS
 * radio from the SDR store is the F10 coupling the plan moves to Land's own
 * decode client later.)
 */
export const landSidebarFilter: SidebarFilterSubTabs = {
  tabs() {
    const aprsSourceConfigured = useSdrStore().aprsRadioId !== null
    return [
      {
        id: 'aprs',
        label: aprsSourceConfigured ? 'APRS STATIONS' : 'APRS STATIONS — NO SDR SET',
        disabled: !aprsSourceConfigured,
      },
      { id: 'repeaters', label: 'REPEATERS' },
    ]
  },
  isActive: (id) => useLandStore().activeLayer === id,
  select(id) {
    const landStore = useLandStore()
    landStore.selectLayer(id as LandLayer)
    void landStore.persistDefaultLayers()
  },
  icon: LandFilterSubTabIcon,
}
