import { watch } from 'vue'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import { useLandStore } from '../stores/land'
import { useRepeatersStore } from '../stores/repeaters'
import { repeaterCallsignFromSearchKey } from '../constants/repeaters'

/**
 * Keeps the FILTER pane's one expanded row in step with the map: a station
 * clicked on the map opens here, and a row whose station ages out or whose
 * repeater the filters (or the layer switch) remove closes, so the pane never
 * holds an expanded row for something no longer on the map.
 *
 * APRS stations and repeaters share the store's one expanded-key slot
 * (repeater keys are `repeaterSearchKey`s), so each watcher only ever closes
 * its own kind of row.
 */
export function useLandExpandedRow(): void {
  const landStore = useLandStore()
  const repeatersStore = useRepeatersStore()

  // A station clicked on the map expands here. The sidebar tab switch is App.vue's
  // job (it owns the sidebar); this side only has to open the right row. (The
  // repeater control sets the row on the store itself before firing its open
  // event.)
  useDocumentEvent('aprs-station-selected', (event: Event) => {
    const { callsign } = (event as CustomEvent<{ callsign: string }>).detail
    landStore.setSearchExpandedCallsign(callsign)
  })

  watch(
    () => landStore.aprsStations,
    (stations) => {
      const expanded = landStore.searchExpandedCallsign
      // An APRS poll must not shut a repeater row.
      if (
        expanded &&
        repeaterCallsignFromSearchKey(expanded) === null &&
        !stations.some((station) => station.callsign === expanded)
      ) {
        landStore.setSearchExpandedCallsign('')
      }
    },
    { deep: true },
  )

  watch(
    () => [repeatersStore.filteredStations, landStore.repeatersLayerVisible] as const,
    ([filtered, layerOn]) => {
      const callsign = repeaterCallsignFromSearchKey(landStore.searchExpandedCallsign)
      if (callsign === null) return
      if (!layerOn || !filtered.some((station) => station.callsign === callsign)) {
        landStore.setSearchExpandedCallsign('')
      }
    },
  )
}
