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
import { createAppRouter } from './router'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { APP_MODE_STORAGE_KEY, asSourceMode } from '@sentinel/shell-api/utils/sourceMode'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { clearRemovedStorageKeys } from './utils/removedStorageKeys'
// The sections this build includes: imported in dev/tests, Module Federation
// remotes in the built app (vite.config.ts swaps the module).
import { sectionSources } from './shell/sections'
import { loadSections } from './shell/sectionLoader'
import { startSectionEngines } from './shell/sectionEngines'
// Built app only: every @sentinel/ui, shell-api and map-kit module, so this
// container can provide each one a section remote uses (sections never carry
// their own copies — @sentinel/web-config/federation). Empty in dev and tests.
import 'virtual:sentinel-shared-package-modules'
import type { AllSettings } from '@sentinel/shell-api/shell/settingsHydration'
import { applySettingsPayload } from './shell/applySettings'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

// Register PMTiles protocol once at app startup — never inside a component.
const protocol = new pmtiles.Protocol()
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))

const pinia = createPinia()
const app = createApp(App)
app.use(pinia)

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

// Created before anything mounts (the theme store publishes the map palette
// as it is created), whether or not the settings below can be read.
useBasemapStore()
useSettingsStore()
useThemeStore()
;(async () => {
  // Fetch the settings and load the sections at the same time. Sections must
  // have registered before the settings are applied (their enabled defaults and
  // settings hydrators are part of what they register) and before the router
  // and App read the registries.
  const settingsResponse = fetch('/api/settings').catch(() => null)
  try {
    await loadSections(await sectionSources(), { pinia })
  } catch (error) {
    console.error('[sentinel] loading sections failed:', error)
  }
  // The SDR engine (its persistent radio pane) loads alongside the settings;
  // boot waits for it only up to a timeout, then mounts and late-mounts it.
  const enginesReady = startSectionEngines()
  try {
    const res = await settingsResponse
    if (res?.ok) {
      // The same routine a settings refresh uses (APPLY CHANGES, a config-file
      // edit), so a refresh leaves the app as this boot does.
      applySettingsPayload((await res.json()) as AllSettings)
    }
  } catch {}
  await enginesReady
  const router = createAppRouter()
  app.use(router)
  // Mount only once the initial navigation has resolved, so App.vue's route
  // watchers start on the real route: seeing the start location ('/') change
  // to it would count as a navigation — focus jumps to <main> (skipping the
  // skip link) and the SDR radio pane toggles as if the operator had arrived.
  await router.isReady()
  app.mount('#app')
})()
