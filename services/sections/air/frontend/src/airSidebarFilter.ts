import { useAirStore, type AdsbTypeFilter, type AirFilterCategory } from './stores/air'
import type {
  SidebarFilterSubTab,
  SidebarFilterSubTabs,
} from '@sentinel/shell-api/shell/sidebarRegistry'
import AirFilterSubTabIcon from './AirFilterSubTabIcon.vue'

/**
 * Air's FILTER rail sub-tabs (F2 — moved out of MapSidebar). The three aircraft
 * tabs share the aircraft list and set the ADS-B type filter (all / civil /
 * military) on the map as well; airports and military bases are their own
 * categories.
 */
const AIRCRAFT_SUBTAB_TYPE_FILTERS: Record<string, AdsbTypeFilter> = {
  aircraft: 'all',
  civil: 'civil',
  milAircraft: 'mil',
}

const AIR_FILTER_SUBTABS: SidebarFilterSubTab[] = [
  { id: 'aircraft', label: 'ALL AIRCRAFT' },
  { id: 'civil', label: 'CIVIL AIRCRAFT' },
  { id: 'milAircraft', label: 'MILITARY AIRCRAFT' },
  { id: 'airports', label: 'AIRPORTS' },
  { id: 'mil', label: 'MILITARY BASES' },
]

export const airSidebarFilter: SidebarFilterSubTabs = {
  tabs: () => AIR_FILTER_SUBTABS,
  isActive(id) {
    const airStore = useAirStore()
    const typeFilter = AIRCRAFT_SUBTAB_TYPE_FILTERS[id]
    if (typeFilter) {
      return airStore.airFilterCategory === 'aircraft' && airStore.adsbTypeFilter === typeFilter
    }
    return airStore.airFilterCategory === id
  },
  select(id) {
    const airStore = useAirStore()
    const typeFilter = AIRCRAFT_SUBTAB_TYPE_FILTERS[id]
    if (typeFilter) {
      airStore.setAirFilterCategory('aircraft')
      airStore.setAdsbTypeFilter(typeFilter)
    } else {
      airStore.setAirFilterCategory(id as AirFilterCategory)
    }
  },
  icon: AirFilterSubTabIcon,
}
