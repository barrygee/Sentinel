<template>
  <!-- Opaque WebGL canvas — named region + the BboxFields text equivalent
       satisfy WCAG 1.1.1/4.1.2, same reasoning as SentrySiteMap. -->
  <div
    ref="containerRef"
    class="offline-area-map"
    role="region"
    aria-label="Map for choosing an offline download area. Draw or resize the area here, or enter its North, South, East and West bounds in the fields below."
  ></div>
</template>

<script setup lang="ts">
/**
 * `OfflineAreaMap` — the small MapLibre instance Settings › Offline Maps
 * draws an area on. Deliberately NOT `MapLibreMap.vue` (the domain-map
 * component, which owns `window.map`) — like `SentrySiteMap.vue`, this is a
 * second, independent map instance living entirely inside the settings panel.
 *
 * Shows the same basemap as the domain maps: the online build while there is
 * internet, the offline one (downloaded areas + bundled tiles) when there
 * isn't, so the preview still shows a map with no connection. Scroll-wheel zoom is off (as in
 * `SentrySiteMap`) so the map doesn't swallow the settings panel's own
 * scroll; zoom is available via the +/- control, double-click, pinch and the
 * keyboard.
 *
 * Renders three overlays, all rebuilt on `style.load` (a theme swap replaces
 * the whole style, per the PR #363/#364 lesson) with theme-aware ink from
 * `overlayAccentColor()`/`isBrightBasemap()`:
 * - the in-progress/committed selection, dashed (`line-dasharray`);
 * - a round handle on each of its corners, dragged to resize it
 *   (`RectangleResizeHandler`);
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
import { basemapStyleUrl, ignoreOfflineTileErrors, setMapStyle } from '@/utils/mapStyle'
import { overlayAccentColor, isBrightBasemap } from '@/utils/mapTheme'
import { useAppStore } from '@/stores/app'
import { useThemeStore } from '@/stores/theme'
import { RectangleDrawHandler, type LngLatBounds } from './rectangleDrawHandler'
import { RectangleResizeHandler } from './rectangleResizeHandler'

/** The whole world, as far north and south as Web Mercator reaches. */
const WORLD_BOUNDS: [number, number, number, number] = [-180, -85, 180, 85]
/** Breathing room kept around a selected area when the map frames it. */
const SELECTION_PADDING_PX = 32

const SELECTION_SOURCE = 'offline-area-selection'
const SELECTION_LAYER = 'offline-area-selection-line'
const CORNERS_SOURCE = 'offline-area-corners'
const CORNERS_LAYER = 'offline-area-corner-handles'
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
const appStore = useAppStore()
const styleUrl = () => basemapStyleUrl(appStore.isOnline, themeStore.mapTheme)

const containerRef = ref<HTMLElement | null>(null)
let map: MapLibreGlMap | null = null
let drawHandler: RectangleDrawHandler | null = null
let resizeHandler: RectangleResizeHandler | null = null
let previewFrame: number | null = null
/**
 * True until the user pans or zooms. The list of downloaded areas arrives a
 * moment after the map loads, so the opening view is re-framed when it does,
 * but never once the user has moved the map themselves.
 */
let openingViewPending = true

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

/** The four corners as points, drawn as the grab handles for resizing. */
function boundsToCornerPoints(bounds: LngLatBounds): GeoJSON.Feature[] {
  const corners: [number, number][] = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south],
  ]
  return corners.map((coordinates) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates },
  }))
}

function setSelectionPreview(bounds: LngLatBounds | null): void {
  if (previewFrame !== null) cancelAnimationFrame(previewFrame)
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null
    const outlineSource = map?.getSource(SELECTION_SOURCE) as GeoJSONSource | undefined
    outlineSource?.setData({
      type: 'FeatureCollection',
      features: bounds ? [boundsToPolygon(bounds)] : [],
    })
    const cornersSource = map?.getSource(CORNERS_SOURCE) as GeoJSONSource | undefined
    cornersSource?.setData({
      type: 'FeatureCollection',
      features: bounds ? boundsToCornerPoints(bounds) : [],
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

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The smallest box holding the selected area and every downloaded area, or
 * null when there is neither. Downloaded areas never cross the antimeridian
 * (the backend refuses them), so a plain min/max is enough.
 */
function areasOfInterest(): LngLatBounds | null {
  const areas = props.selection ? [props.selection, ...props.regions] : props.regions
  const [first, ...rest] = areas
  if (!first) return null
  return rest.reduce<LngLatBounds>(
    (combined, area) => ({
      west: Math.min(combined.west, area.west),
      south: Math.min(combined.south, area.south),
      east: Math.max(combined.east, area.east),
      north: Math.max(combined.north, area.north),
    }),
    { ...first },
  )
}

/**
 * Open on what matters: the selected and downloaded areas, zoomed in as far
 * as possible with all of them fully visible, or the whole world when there
 * are none.
 */
function frameAreasOrWorld(): void {
  if (!map) return
  const areas = areasOfInterest()
  if (areas) {
    map.fitBounds([areas.west, areas.south, areas.east, areas.north], {
      padding: SELECTION_PADDING_PX,
      duration: 0,
    })
  } else {
    map.fitBounds(WORLD_BOUNDS, { padding: 0, duration: 0 })
  }
}

/** True when the whole of `bounds` is inside the map's current view. */
function isFullyInView(visibleMap: MapLibreGlMap, bounds: LngLatBounds): boolean {
  const view = visibleMap.getBounds()
  return (
    bounds.west >= view.getWest() &&
    bounds.east <= view.getEast() &&
    bounds.south >= view.getSouth() &&
    bounds.north <= view.getNorth()
  )
}

/**
 * An area typed into the fields can land off-screen, so bring all of it into
 * view. Drawn or resized areas are already on screen and stay put.
 */
function frameIfOffScreen(bounds: LngLatBounds): void {
  /* v8 ignore start -- called from the selection watcher, which Vue stops before
     onUnmounted tears the map down, so the map always exists here */
  if (!map) return
  /* v8 ignore stop */
  if (isFullyInView(map, bounds)) return
  map.fitBounds([bounds.west, bounds.south, bounds.east, bounds.north], {
    padding: SELECTION_PADDING_PX,
    duration: prefersReducedMotion() ? 0 : 600,
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

  if (!map.getSource(CORNERS_SOURCE)) {
    map.addSource(CORNERS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(CORNERS_LAYER)) {
    map.addLayer({
      id: CORNERS_LAYER,
      type: 'circle',
      source: CORNERS_SOURCE,
      paint: {
        'circle-radius': 5,
        'circle-color': bright ? '#ffffff' : '#1a1f2b',
        'circle-stroke-color': accent,
        'circle-stroke-width': 2,
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
    // A rough first frame; the real framing happens once the map has its size.
    bounds: WORLD_BOUNDS,
    // One copy of the world, so the whole world shows once and drawn
    // coordinates stay within -180..180.
    renderWorldCopies: false,
    attributionControl: false,
    fadeDuration: 0,
  })
  setMapStyle(map, styleUrl())
  ignoreOfflineTileErrors(map)
  map.scrollZoom.disable()
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.on('style.load', initLayers)
  // Frame the areas (or the world) once the map knows its real size: a fit made
  // earlier works from a zero-size container and lands on the wrong zoom.
  map.on('load', () => {
    map?.resize()
    frameAreasOrWorld()
  })
  // The settings panel animates open, so the map can grow after it loads; a fit
  // made mid-animation leaves the areas smaller than they should be. Re-frame
  // on each resize until the user takes over.
  map.on('resize', () => {
    if (openingViewPending) frameAreasOrWorld()
  })
  // Only user gestures carry an originalEvent; fitBounds and flyTo don't.
  map.on('movestart', (event: { originalEvent?: Event }) => {
    if (event.originalEvent) openingViewPending = false
  })

  const rectangleDraw = new RectangleDrawHandler(map, {
    onComplete: (bounds) => emit('draw-complete', bounds),
    onPreview: setSelectionPreview,
    onArmedChange: (armed) => emit('armed-change', armed),
  })
  drawHandler = rectangleDraw
  resizeHandler = new RectangleResizeHandler(map, {
    getBounds: () => props.selection,
    // Drawing a new rectangle and resizing the current one are never both live.
    isBlocked: () => rectangleDraw.isArmed,
    onPreview: setSelectionPreview,
    onComplete: (bounds) => emit('draw-complete', bounds),
  })
  resizeHandler.enable()
})

// A theme change, or losing/regaining the internet, swaps the style (the
// overlays are rebuilt on style.load).
watch(styleUrl, () => {
  /* v8 ignore start -- guarded the same way SentrySiteMap's theme watcher is */
  if (map) setMapStyle(map, styleUrl())
  /* v8 ignore stop */
})

watch(
  () => props.selection,
  (bounds) => {
    setSelectionPreview(bounds)
    if (bounds) frameIfOffScreen(bounds)
  },
)

watch(
  () => props.regions,
  () => {
    renderRegionsOutline()
    if (openingViewPending) frameAreasOrWorld()
  },
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
 * The map's current visible bounds, for "USE CURRENT VIEW", clamped to the
 * one copy of the world the map shows: -180..180 longitude and the Web
 * Mercator latitude limit. Zoomed out to the whole world the view is wider
 * than the world itself, and unclamped it would read as an area crossing the
 * antimeridian.
 */
function currentViewBounds(): LngLatBounds | null {
  if (!map) return null
  const bounds = map.getBounds()
  return {
    west: Math.max(-180, bounds.getWest()),
    south: Math.max(-85.05112877980659, bounds.getSouth()),
    east: Math.min(180, bounds.getEast()),
    north: Math.min(85.05112877980659, bounds.getNorth()),
  }
}

/** Fly the settings map to frame the given bounds (a region-list row was clicked).
 *  Honours `prefers-reduced-motion` (WCAG 2.3.3) — an instant jump instead of the pan/zoom. */
function flyToBounds(bounds: LngLatBounds): void {
  map?.fitBounds([bounds.west, bounds.south, bounds.east, bounds.north], {
    padding: SELECTION_PADDING_PX,
    duration: prefersReducedMotion() ? 0 : 600,
  })
}

defineExpose({ armDraw, cancelDraw, currentViewBounds, flyToBounds })

onUnmounted(() => {
  if (previewFrame !== null) cancelAnimationFrame(previewFrame)
  drawHandler?.disarm()
  resizeHandler?.disable()
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
  /* Landscape: the whole map card width, 16:9, capped so it never fills a
     laptop screen on a wide window. */
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 480px;
  background-color: #2d3548;
}
</style>
