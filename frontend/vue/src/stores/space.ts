import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePersistedObject, usePersistedRef, usePersistedStringSet } from './_persist'

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

  // ── Per-section UI state, persisted so the Space section resumes exactly as
  // left after navigating away (and across a full refresh). These live on the
  // store — a singleton created once for the app's lifetime — rather than in the
  // teleported SpaceFilter/SpacePasses components, whose mount timing is fragile:
  // holding the state here makes restore independent of when those panes remount.
  const sideMenuExpanded   = usePersistedRef<boolean>('sentinel_space_sideMenuExpanded', false)

  // SEARCH pane (SpaceFilter)
  const searchQuery        = usePersistedRef<string>('sentinel_space_filterQuery', '')
  const searchExpandedNorad= usePersistedRef<string>('sentinel_space_filterExpandedNorad', '')
  const searchCollapsedCats= usePersistedStringSet('sentinel_space_filterCollapsedCats')

  // PASSES pane (SpacePasses)
  const passesMinEl        = usePersistedRef<number>('sentinel_space_passesMinEl', 35)
  const passesHours        = usePersistedRef<number>('sentinel_space_passesHours', 24)
  const passesFiltersOpen  = usePersistedRef<boolean>('sentinel_space_passesFiltersExpanded', false)
  const passesExpandedKey  = usePersistedRef<string>('sentinel_space_passesExpandedKey', '')
  const passesActiveFilters= usePersistedStringSet('sentinel_space_passesActiveFilters')

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

  return {
    overlayStates, filterQuery, filterOpen, mapCenter, mapZoom,
    setOverlay, setFilter, toggleFilter, saveMapState,
    sideMenuExpanded,
    searchQuery, searchExpandedNorad, searchCollapsedCats,
    passesMinEl, passesHours, passesFiltersOpen, passesExpandedKey, passesActiveFilters,
  }
})
