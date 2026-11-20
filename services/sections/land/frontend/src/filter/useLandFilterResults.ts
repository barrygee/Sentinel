import { computed, type ComputedRef } from 'vue'
import type { FilterPanelItem } from '@sentinel/ui/base/BaseFilterPanel.vue'
import { useLandStore, type AprsStation } from '../stores/land'
import { useRepeatersStore } from '../stores/repeaters'
import { repeaterCallsignFromSearchKey } from '../constants/repeaters'
import type { RepeaterStation } from '../types/repeaters'
import {
  joinSets,
  repeaterMatches,
  repeaterRow,
  stationMatches,
  stationRow,
} from './landFilterSearch'

/** What `useLandFilterResults` hands the FILTER pane. */
export interface LandFilterResults {
  /** Whether repeaters take part in this pane (layer on + directory loaded). */
  repeatersOn: ComputedRef<boolean>
  /** Every row the list shows: APRS stations first, then in-view repeaters. */
  items: ComputedRef<FilterPanelItem[]>
  /** The search box's accessible name, naming whichever sets are listed. */
  inputLabel: ComputedRef<string>
  /** The search box's placeholder: the fields the listed sets can be searched by. */
  placeholder: ComputedRef<string>
  /** The listbox's accessible name. */
  listboxLabel: ComputedRef<string>
  /** What the list says when it has no rows, and why. */
  emptyMessage: ComputedRef<string>
  /** The repeater a row key names, or undefined for a station row. */
  repeaterFor: (key: string) => RepeaterStation | undefined
  /** The heard APRS station with this callsign, if it is still heard. */
  stationFor: (callsign: string) => AprsStation | undefined
}

/**
 * The Land FILTER pane's rows and wording, read from the same snapshot the map
 * plots: hiding a layer empties its list, and a station that ages out or a
 * repeater filtered away leaves the list and the map at the same moment.
 */
export function useLandFilterResults(): LandFilterResults {
  const landStore = useLandStore()
  const repeatersStore = useRepeatersStore()

  const repeatersOn = computed(
    () => landStore.repeatersLayerVisible && repeatersStore.stations.length > 0,
  )

  /** The search box describes whichever sets are currently listed. */
  const listedSets = computed<string[]>(() => {
    const sets: string[] = []
    if (landStore.aprsLayerVisible) sets.push('APRS stations')
    if (repeatersOn.value) sets.push('repeaters')
    return sets
  })
  const listboxLabel = computed(() => joinSets(listedSets.value) || 'Land map items')
  const inputLabel = computed(() => {
    if (listedSets.value.length === 0) return 'Filter Land map items by name or callsign'
    if (listedSets.value.length === 1 && landStore.aprsLayerVisible) {
      return 'Filter APRS stations by callsign, symbol, path or comment'
    }
    return `Filter ${joinSets(listedSets.value)} by name or callsign`
  })
  const placeholder = computed(() => {
    const parts = ['CALLSIGN']
    if (repeatersOn.value) parts.push('TOWN', 'BAND', 'MODE')
    if (!repeatersOn.value) parts.push('SYMBOL', 'PATH', 'COMMENT')
    return parts.join(' · ')
  })

  const needle = computed(() => landStore.searchQuery.trim().toLowerCase())

  const matchingStations = computed<AprsStation[]>(() => {
    // The list shows exactly what the map plots: hiding the APRS layer empties
    // both, rather than leaving the panel listing stations that aren't there.
    if (!landStore.aprsLayerVisible) return []
    if (!needle.value) return landStore.aprsStations
    return landStore.aprsStations.filter((station) => stationMatches(station, needle.value))
  })

  /** One row per in-view repeater — a flat list, since the map draws one layer at a time. */
  const repeaterItems = computed<FilterPanelItem[]>(() => {
    if (!repeatersOn.value) return []
    const visible = repeatersStore.visibleStations
    const matching = needle.value
      ? visible.filter((station) => repeaterMatches(station, needle.value))
      : visible
    return matching.map(repeaterRow)
  })

  const items = computed<FilterPanelItem[]>(() => [
    ...matchingStations.value.map((station) => stationRow(station, repeatersOn.value)),
    ...repeaterItems.value,
  ])

  const emptyMessage = computed(() => {
    if (listedSets.value.length === 0) return 'No layers on — use the tabs to add one'
    if (repeatersOn.value) {
      const anyRepeaterVisible = repeatersStore.visibleStations.length > 0
      if (!landStore.aprsLayerVisible && !anyRepeaterVisible) {
        return `Nothing in view — ${joinSets(listedSets.value)}`
      }
      return 'Nothing matches'
    }
    return landStore.aprsStations.length === 0 ? 'No APRS stations heard' : 'No stations match'
  })

  function repeaterFor(key: string): RepeaterStation | undefined {
    const callsign = repeaterCallsignFromSearchKey(key)
    return callsign === null ? undefined : repeatersStore.stationByCallsign(callsign)
  }

  function stationFor(callsign: string): AprsStation | undefined {
    return landStore.aprsStations.find((station) => station.callsign === callsign)
  }

  return {
    repeatersOn,
    items,
    inputLabel,
    placeholder,
    listboxLabel,
    emptyMessage,
    repeaterFor,
    stationFor,
  }
}
