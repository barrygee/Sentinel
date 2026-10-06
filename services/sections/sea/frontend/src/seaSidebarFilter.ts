import { useSeaStore } from './stores/sea'
import { SEA_FILTER_CATEGORIES, type SeaFilterCategory } from './utils/aisShipType'
import type {
  SidebarFilterSubTab,
  SidebarFilterSubTabs,
} from '@sentinel/shell-api/shell/sidebarRegistry'
import SeaFilterSubTabIcon from './SeaFilterSubTabIcon.vue'

/** Sea's FILTER rail sub-tabs: one per vessel family (F2 — moved out of MapSidebar). */
const SEA_FILTER_SUBTABS: SidebarFilterSubTab[] = SEA_FILTER_CATEGORIES.map((category) => ({
  id: category,
  label: category === 'all' ? 'ALL VESSELS' : category.toUpperCase(),
}))

export const seaSidebarFilter: SidebarFilterSubTabs = {
  tabs: () => SEA_FILTER_SUBTABS,
  isActive: (id) => useSeaStore().seaFilterCategory === id,
  select: (id) => useSeaStore().setSeaFilterCategory(id as SeaFilterCategory),
  icon: SeaFilterSubTabIcon,
}
