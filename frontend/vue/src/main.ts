import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as maplibregl from 'maplibre-gl'
// MapLibre 6 runs tile parsing in a separate worker module that it expects to
// find beside its own bundle (`./maplibre-gl-worker.mjs`). Vite folds the
// library into the app chunk and emits no such file, so tiles never load and
// every basemap stays blank. `?worker&url` has Vite build the worker (with its
// shared-chunk import resolved) as its own asset and hand back the served URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import * as pmtiles from 'pmtiles'

import 'maplibre-gl/dist/maplibre-gl.css'
import './assets/fonts.css'
import './assets/styles.css'
// Global a11y baseline (focus-visible, reduced motion, skip-link/sr-only
// utilities) — imported last so its focus ring overrides component resets.
import './assets/a11y.css'

import App from './App.vue'
import router from './router'
import { useAppStore } from './stores/app'
import { APP_MODE_STORAGE_KEY, asSourceMode } from './utils/sourceMode'
import { useBasemapStore } from './stores/basemap'
import { useThemeStore } from './stores/theme'
import { useSettingsStore } from './stores/settings'
import { clearRemovedStorageKeys } from './utils/removedStorageKeys'
// Registers every section (routes, nav, capabilities, settings hydrators…)
// before anything below reads the registries.
import './shell/sections'
import { runSettingsHydrators } from './shell/settingsHydration'
import { getEnabledSectionIds } from './shell/sectionRegistry'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

// Register PMTiles protocol once at app startup — never inside a component.
const protocol = new pmtiles.Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)
app.use(router)

// Drop cached keys belonging to removed features before any store reads
// storage (see utils/removedStorageKeys.ts).
clearRemovedStorageKeys()

// Hydrate app store from localStorage before first render.
const appStore = useAppStore()
try {
  // Set before any component mounts so the maps pick the right basemap first time.
  const savedMode = asSourceMode(localStorage.getItem(APP_MODE_STORAGE_KEY))
  if (savedMode) appStore.setConnectivityMode(savedMode)
} catch {}

const basemapStore = useBasemapStore()
const settingsStore = useSettingsStore()
const themeStore = useThemeStore()

;(async () => {
  try {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const data = (await res.json()) as Record<string, Record<string, unknown>>
      // Seed the settings store from this same payload so reads like
      // sdr.bandPlan (waterfall band strip)
      // resolve to the persisted values instead of their fallbacks. Nothing
      // else calls loadAll(), so without this the store stays empty.
      settingsStore.allSettings = data
      // Per-section enabled state: a stored `<id>.enabled` wins, else each
      // registered section's own default (Air/Space/SDR on, Sea/Land off).
      const enabled = getEnabledSectionIds(data)
      if (enabled.length > 0) appStore.setEnabledDomains(enabled)

      // Sync connectivity mode from backend — backend is authoritative so a mode
      // set from another session doesn't get overridden by a stale localStorage value.
      const backendMode = asSourceMode(data.app?.connectivityMode)
      if (backendMode) {
        try {
          localStorage.setItem(APP_MODE_STORAGE_KEY, backendMode)
        } catch {}
        appStore.setConnectivityMode(backendMode)
      }

      // Theme — the backend is authoritative, so a choice made on another
      // device wins over this browser's localStorage. Absent means dark.
      // No defaulting here: a config written before the map got its own
      // control has neither key, and falling back would drag the basemap away
      // from the palette the operator is looking at. An absent value leaves
      // the seeded one alone; the boolean is the pre-COLOUR form.
      themeStore.hydrateMapTheme(data.app?.mapTheme, data.app?.lightMapTheme)

      // Notification blip sound — default OFF when absent from the DB.
      const soundOn = data.app?.notificationSound
      appStore.setNotificationSound(typeof soundOn === 'boolean' ? soundOn : false)

      // The shared base-map layers — adopt the config so a choice made in the
      // app-config JSON or on another device is what the maps draw from the
      // first frame.
      basemapStore.hydrateLayers(data.app?.mapLayers)

      // Each section's own stored settings (Air's map layers and label fields,
      // Land's APRS label fields…) — registered by the section (F1).
      runSettingsHydrators(data)
    }
  } catch {}
  app.mount('#app')
})()
