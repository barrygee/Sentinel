import { useSpaceStore } from '@/stores/space'
import { SATELLITE_CATEGORY_SECTION_LABELS } from '@/utils/satelliteUtils'
import type { SidebarFilterSubTabs } from '@/shell/sidebarRegistry'
import SpaceFilterSubTabIcon from './SpaceFilterSubTabIcon.vue'

/**
 * Space's FILTER rail sub-tabs (F2 — moved out of MapSidebar): data-driven,
 * one per satellite category that currently has satellites (published by
 * SpaceFilter into the store).
 */
export const spaceSidebarFilter: SidebarFilterSubTabs = {
  tabs: () =>
    useSpaceStore().spaceAvailableCategories.map((category) => ({
      id: category,
      label:
        SATELLITE_CATEGORY_SECTION_LABELS[category] || category.replace(/_/g, ' ').toUpperCase(),
    })),
  isActive: (id) => useSpaceStore().spaceFilterCategory === id,
  select: (id) => useSpaceStore().setSpaceFilterCategory(id),
  icon: SpaceFilterSubTabIcon,
}
