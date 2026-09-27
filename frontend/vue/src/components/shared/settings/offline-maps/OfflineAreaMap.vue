<template>
  <!-- Opaque WebGL canvas — named region + the BboxFields text equivalent
       satisfy WCAG 1.1.1/4.1.2, same reasoning as SentrySiteMap. -->
  <div
    ref="containerRef"
    class="offline-area-map"
    role="region"
    aria-label="Map for choosing an offline download area. Use Draw Area or Use Current View, or enter the North/South/East/West bounds directly below."
  ></div>
</template>

<script setup lang="ts">
/**
 * `OfflineAreaMap` — the small MapLibre instance Settings › Offline Maps
 * draws an area on. Deliberately NOT `MapLibreMap.vue` (the domain-map
 * component, which owns `window.map`) — like `SentrySiteMap.vue`, this is a
 * second, independent map instance living entirely inside the settings panel.
 *
 * Always the ONLINE basemap for the current theme: choosing a download area
 * needs a connection anyway, and it lets an operator frame territory outside
 * anything already downloaded. Scroll-wheel zoom is off (as in
 * `SentrySiteMap`) so the map doesn't swallow the settings panel's own
 * scroll; zoom is available via the +/- control, double-click, pinch and the
 * keyboard.
 *
 * Renders two overlays, both rebuilt on `style.load` (a theme swap replaces
 * the whole style, per the PR #363/#364 lesson) with theme-aware ink from
 * `overlayAccentColor()`/`isBrightBasemap()`:
 * - the in-progress/committed selection, dashed (`line-dasharray`);
 * - every downloaded region, as a solid muted outline.
 *
 * The draw interaction itself is `RectangleDrawHandler`; this component owns
 * the map it operates on and exposes a small imperative surface
 * (`armDraw`/`cancelDraw`/`currentViewBounds`/`flyToBounds`) for
 * `OfflineMapsSettings` to drive from `AreaSelector`/`RegionList`.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreGlMap, GeoJSONSource } from 'maplibre-gl'
import { basemapStyleUrl, setMapStyle } from '@/utils/mapStyle'
import { overlayAccentColor, isBrightBasemap } from '@/utils/mapTheme'
import { useThemeStore } from '@/stores/theme'
import { RectangleDrawHandler, type LngLatBounds } from './rectangleDrawHandler'

const SETTINGS_MAP_ZOOM = 5
const SETTINGS_MAP_CENTER: [number, number] = [-2, 54]

const SELECTION_SOURCE = 'offline-area-selection'
const SELECTION_LAYER = 'offline-area-selection-line'
const REGIONS_SOURCE = 'offline-area-regions'
const REGIONS_LAYER = 'offline-area-regions-line'

const props = defineProps<{
  /** The committed/draft selection to draw dashed, or `null` for none. */
  selection: LngLatBounds | null
  /** Completed regions to outline solid on the map. */
  regions: LngLatBounds[]
}>()

const emit = defineEmits<{
  /** A rectangle was finished, by drag or tap-tap. */
  'draw-complete': [bounds: LngLatBounds]
  /** Whether the draw handler is currently armed (for the DRAW AREA button's pressed state). */
  'armed-change': [armed: boolean]
}>()

const themeStore = useThemeStore()
const styleUrl = () => basemapStyleUrl(true, themeStore.mapTheme)

const containerRef = ref<HTMLElement | null>(null)
let map: MapLibreGlMap | null = null
let drawHandler: RectangleDrawHandler | null = null
let previewFrame: number | null = null

function boundsToPolygon(bounds: LngLatBounds): GeoJSON.Feature {
  const { west, south, east, north } = bounds
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  }
}

function setSelectionPreview(bounds: LngLatBounds | null): void {
  if (previewFrame !== null) cancelAnimationFrame(previewFrame)
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null
    const source = map?.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: bounds ? [boundsToPolygon(bounds)] : [],
    })
  })
}

function renderRegionsOutline(): void {
  const source = map?.getSource(REGIONS_SOURCE) as GeoJSONSource | undefined
  source?.setData({
    type: 'FeatureCollection',
    features: props.regions.map(boundsToPolygon),
  })
}

/** (Re)build both overlays. Called on load and again after every style swap. */
function initLayers(): void {
  if (!map) return
  const accent = overlayAccentColor()
  const bright = isBrightBasemap()

  if (!map.getSource(SELECTION_SOURCE)) {
    map.addSource(SELECTION_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(SELECTION_LAYER)) {
    map.addLayer({
      id: SELECTION_LAYER,
      type: 'line',
      source: SELECTION_SOURCE,
      paint: {
        'line-color': accent,
        'line-width': 2,
        'line-dasharray': [2, 1.5],
      },
    })
  }

  if (!map.getSource(REGIONS_SOURCE)) {
    map.addSource(REGIONS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(REGIONS_LAYER)) {
    map.addLayer({
      id: REGIONS_LAYER,
      type: 'line',
      source: REGIONS_SOURCE,
      paint: {
        'line-color': accent,
        'line-width': 1.5,
        'line-opacity': bright ? 0.35 : 0.45,
      },
    })
  }

  setSelectionPreview(props.selection)
  renderRegionsOutline()
}

onMounted(() => {
  /* v8 ignore start -- containerRef is always bound by the time onMounted runs */
  if (!containerRef.value) return
  /* v8 ignore stop */
  map = new maplibregl.Map({
    container: containerRef.value,
    center: SETTINGS_MAP_CENTER,
    zoom: SETTINGS_MAP_ZOOM,
    attributionControl: false,
    fadeDuration: 0,
  })
  setMapStyle(map, styleUrl())
  map.scrollZoom.disable()
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.on('style.load', initLayers)
  map.on('load', () => map?.resize())

  drawHandler = new RectangleDrawHandler(map, {
    onComplete: (bounds) => emit('draw-complete', bounds),
    onPreview: setSelectionPreview,
    onArmedChange: (armed) => emit('armed-change', armed),
  })
})

watch(
  () => themeStore.mapTheme,
  () => {
    /* v8 ignore start -- guarded the same way SentrySiteMap's theme watcher is */
    if (map) setMapStyle(map, styleUrl())
    /* v8 ignore stop */
  },
)

watch(
  () => props.selection,
  (bounds) => setSelectionPreview(bounds),
)

watch(
  () => props.regions,
  () => renderRegionsOutline(),
  { deep: true },
)

/** Arm the rectangle-draw interaction — the DRAW AREA button's handler. */
function armDraw(): void {
  drawHandler?.arm()
}

/** Cancel an in-progress draw (also called on Escape from outside the map, e.g. a
 *  DRAW AREA button toggled back off). */
function cancelDraw(): void {
  drawHandler?.cancel()
}

/**
 * The map's current visible bounds, for "USE CURRENT VIEW". Latitude is
 * clamped to the Web Mercator limit; longitude is left unwrapped so the
 * caller can detect (and reject) an antimeridian-crossing view.
 *
 * This map is always flat Mercator (never globe), so — unlike the domain
 * maps — there is no "meaningless below z3" globe case to guard against here.
 */
function currentViewBounds(): LngLatBounds | null {
  if (!map) return null
  const bounds = map.getBounds()
  return {
    west: bounds.getWest(),
    south: Math.max(-85.05112877980659, bounds.getSouth()),
    east: bounds.getEast(),
    north: Math.min(85.05112877980659, bounds.getNorth()),
  }
}

/** Fly the settings map to frame the given bounds (a region-list row was clicked).
 *  Honours `prefers-reduced-motion` (WCAG 2.3.3) — an instant jump instead of the pan/zoom. */
function flyToBounds(bounds: LngLatBounds): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  map?.fitBounds([bounds.west, bounds.south, bounds.east, bounds.north], {
    padding: 32,
    duration: reduceMotion ? 0 : 600,
  })
}

defineExpose({ armDraw, cancelDraw, currentViewBounds, flyToBounds })

onUnmounted(() => {
  if (previewFrame !== null) cancelAnimationFrame(previewFrame)
  drawHandler?.disarm()
  /* v8 ignore start -- map is always set after a successful mount */
  if (map) {
    map.remove()
    map = null
  }
  /* v8 ignore stop */
})
</script>

<style scoped>
.offline-area-map {
  width: 100%;
  height: 60vh;
  max-height: 480px;
  min-height: 260px;
  background-color: #2d3548;
}
</style>
