import { computed, watch, type ComputedRef, type Ref } from 'vue'
import type { FilterPanelItem } from '@sentinel/ui/base/BaseFilterPanel.vue'
import {
  categoriesPresent,
  filterSatellites,
  groupByCategory,
  satOptionLabel,
  satSecondary,
} from './satelliteSearch'
import type { SatEntry } from './spaceFilterTypes'

/** What `useSatelliteFilterResults` needs from the pane. */
export interface SatelliteFilterResultsOptions {
  /** Every loaded satellite. */
  satellites: Ref<SatEntry[]>
  /** The search text. */
  query: Ref<string>
  /** The selected rail sub-tab's category. */
  filterCategory: Ref<string>
  /** The expanded satellite's NORAD id ('' when none is). */
  expandedNoradId: Ref<string>
  /** Publishes the categories that have satellites, for the rail sub-tabs. */
  setAvailableCategories: (categories: string[]) => void
  /** Selects a category. */
  setFilterCategory: (category: string) => void
}

/** What `useSatelliteFilterResults` returns. */
export interface SatelliteFilterResults {
  /** The rows of the selected category, in display order. */
  items: ComputedRef<FilterPanelItem[]>
  /** The expanded satellite's record. */
  expandedSat: ComputedRef<SatEntry | undefined>
}

/**
 * The Space FILTER pane's rows: the satellites matching the search, in the
 * selected category only. Also keeps the rail's category sub-tabs in step with
 * the loaded set, and repairs the selection when its category is empty or gone.
 */
export function useSatelliteFilterResults(
  options: SatelliteFilterResultsOptions,
): SatelliteFilterResults {
  const { satellites, query, filterCategory, expandedNoradId } = options

  const groupedResults = computed(() =>
    groupByCategory(filterSatellites(satellites.value, query.value)),
  )

  // From the FULL loaded set (not the text-filtered results) so the rail
  // sub-tab set stays stable as you type. Defaulting/repairing the selection
  // here means the panel always shows a valid category (empty on first load,
  // or one that vanished).
  const availableCategories = computed<string[]>(() => categoriesPresent(satellites.value))
  watch(
    availableCategories,
    (categories) => {
      options.setAvailableCategories(categories)
      if (!categories.includes(filterCategory.value)) {
        options.setFilterCategory(categories[0] ?? '')
      }
    },
    { immediate: true },
  )

  // The single category group shown in the panel (the selected sub-tab). Null
  // when the selected category has no matching satellites (e.g. the text filter
  // excludes them all), which the panel surfaces as a no-results message.
  const activeGroup = computed(
    () => groupedResults.value.find((group) => group.cat === filterCategory.value) ?? null,
  )

  // NORAD ids are digits, so they serve as the panel's element-id tokens unchanged.
  const items = computed<FilterPanelItem[]>(() =>
    (activeGroup.value?.sats ?? []).map((sat) => ({
      key: sat.norad_id,
      primary: sat.name || sat.norad_id,
      secondary: satSecondary(sat),
      optionLabel: satOptionLabel(sat, expandedNoradId.value === sat.norad_id),
    })),
  )

  // Read only from inside the accordion, which the panel renders only for the
  // expanded row, so this always resolves — taken from the full loaded set
  // rather than the filtered group so it holds however the list is narrowed.
  const expandedSat = computed<SatEntry | undefined>(() =>
    satellites.value.find((sat) => sat.norad_id === expandedNoradId.value),
  )

  return { items, expandedSat }
}
