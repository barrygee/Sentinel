import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePersistedObject } from './_persist'

const LS_OVERLAYS = 'sentinel_space_overlayStates'

try { localStorage.removeItem('sentinel_space_globeProjection') } catch {}

export interface SpaceOverlayStates {
  iss: boolean
  groundTrack: boolean
  footprint: boolean
  daynight: boolean
  names: boolean
}

const DEFAULTS: SpaceOverlayStates = {
  iss: true,
  groundTrack: true,
  footprint: true,
  daynight: true,
  names: true,
}

export const useSpaceStore = defineStore('space', () => {
  const overlayStates = usePersistedObject<SpaceOverlayStates>(LS_OVERLAYS, DEFAULTS)
  const filterQuery = ref('')
  const filterOpen = ref(false)
  const mapCenter = ref<[number, number] | null>(null)
  const mapZoom = ref<number | null>(null)

  function setOverlay(key: keyof SpaceOverlayStates, visible: boolean) {
    overlayStates.value[key] = visible
  }

  function setFilter(query: string) {
    filterQuery.value = query
  }

  function toggleFilter() {
    filterOpen.value = !filterOpen.value
  }

  function saveMapState(center: [number, number], zoom: number) {
    mapCenter.value = center
    mapZoom.value = zoom
  }

  return { overlayStates, filterQuery, filterOpen, mapCenter, mapZoom, setOverlay, setFilter, toggleFilter, saveMapState }
})
