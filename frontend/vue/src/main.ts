import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Ahead of the app's stylesheets, so the app's overrides of MapLibre's
// controls win. CSS only: the library loads with the full app's boot.
import 'maplibre-gl/dist/maplibre-gl.css'
import './assets/fonts.css'
import './assets/styles.css'
// Global a11y baseline (focus-visible, reduced motion, skip-link/sr-only
// utilities) — imported last so its focus ring overrides component resets.
import './assets/a11y.css'

import { useAppStore } from '@sentinel/shell-api/stores/app'
import { APP_MODE_STORAGE_KEY, asSourceMode } from '@sentinel/shell-api/utils/sourceMode'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { useThemeStore } from '@sentinel/shell-api/stores/theme'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useDocsDeploymentStore } from '@sentinel/shell-api/stores/docsDeployment'
import { clearRemovedStorageKeys } from './utils/removedStorageKeys'
// The sections this build includes: imported in dev/tests, Module Federation
// remotes in the built app (vite.config.ts swaps the module).
import { sectionSources } from './shell/sections'
import { loadSections } from './shell/sectionLoader'
import { fetchAppMode, setAppMode } from './shell/appMode'
// Built app only: every @sentinel/ui and shell-api module, so this container
// can provide each one a remote uses (remotes never carry their own copies —
// @sentinel/web-config/federation). map-kit's come with the full app's boot.
// Empty in dev and tests.
import 'virtual:sentinel-shared-package-modules'
import type { AllSettings } from '@sentinel/shell-api/shell/settingsHydration'
import { applySettingsPayload } from './shell/applySettings'
import type { ModeBoot } from './boot/modeBoot'

const pinia = createPinia()
// The root component depends on the app mode, so the app is created once boot
// knows it; the stores below are needed before that.
setActivePinia(pinia)

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
  // Whether the optional docs service is deployed, so Settings offers Docs only
  // when it is. Never throws; awaited before mount so the entry never flickers.
  const docsDeploymentLoaded = useDocsDeploymentStore().load()
  // Which app this deployment is (never throws: the full app when core can't
  // say). Each mode's boot is its own chunk, so SDR Manager-only mode never
  // downloads the map app: App, map-kit, MapLibre, pmtiles, the SDR engine.
  const appMode = await fetchAppMode()
  setAppMode(appMode)
  const modeBoot: ModeBoot =
    appMode.mode === 'sdr-manager-local-only'
      ? (await import('./boot/sdrManagerOnlyBoot')).sdrManagerOnlyBoot(appMode)
      : (await import('./boot/fullAppBoot')).fullAppBoot()
  try {
    await loadSections(await sectionSources(), { pinia, appMode: appMode.mode })
  } catch (error) {
    console.error('[sentinel] loading sections failed:', error)
  }
  const enginesReady = modeBoot.startEngines()
  try {
    const res = await settingsResponse
    if (res?.ok) {
      // The same routine a settings refresh uses (APPLY CHANGES, a config-file
      // edit), so a refresh leaves the app as this boot does.
      applySettingsPayload((await res.json()) as AllSettings)
    }
  } catch {}
  await enginesReady
  await docsDeploymentLoaded
  const app = createApp(modeBoot.rootComponent)
  app.use(pinia)
  const router = modeBoot.createRouter()
  app.use(router)
  // Mount only once the initial navigation has resolved, so App.vue's route
  // watchers start on the real route: seeing the start location ('/') change
  // to it would count as a navigation — focus jumps to <main> (skipping the
  // skip link) and the SDR radio pane toggles as if the operator had arrived.
  await router.isReady()
  app.mount('#app')
})()
