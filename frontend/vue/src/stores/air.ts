import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface OverlayStates {
  adsb: boolean
  adsbLabels: boolean
  airports: boolean
  militaryBases: boolean
  roads: boolean
  names: boolean
  rangeRings: boolean
  aara: boolean
  awacs: boolean
}

const LS_KEY = 'overlayStates'

const DEFAULTS: OverlayStates = {
  adsb: true,
  adsbLabels: false,
  airports: true,
  militaryBases: true,
  roads: false,
  names: false,
  rangeRings: false,
  aara: true,
  awacs: true,
}

export const useAirStore = defineStore('air', () => {
  const overlayStates = ref<OverlayStates>(_loadOverlayStates())
  const filterQuery = ref('')
  const filterOpen = ref(false)
  const mapCenter = ref<[number, number] | null>(null)
  const mapZoom = ref<number | null>(null)
  const pitch = ref(0)

  function setOverlay(key: keyof OverlayStates, visible: boolean) {
    overlayStates.value[key] = visible
    _persist()
  }

  function setFilter(query: string) {
    filterQuery.value = query
  }

  function toggleFilter() {
    filterOpen.value = !filterOpen.value
  }

  function saveMapState(center: [number, number], zoom: number, currentPitch: number) {
    mapCenter.value = center
    mapZoom.value = zoom
    pitch.value = currentPitch
  }

  function _persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(overlayStates.value)) } catch {}
  }

  return { overlayStates, filterQuery, filterOpen, mapCenter, mapZoom, pitch, setOverlay, setFilter, toggleFilter, saveMapState }
})

function _loadOverlayStates(): OverlayStates {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}
