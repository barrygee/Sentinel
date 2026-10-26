import * as maplibregl from 'maplibre-gl'
// MapLibre 6 runs tile parsing in a separate worker module that it expects to
// find beside its own bundle (`./maplibre-gl-worker.mjs`). Vite folds the
// library into the app chunk and emits no such file, so tiles never load and
// every basemap stays blank. `?worker&url` has Vite build the worker (with its
// shared-chunk import resolved) as its own asset and hand back the served URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import * as pmtiles from 'pmtiles'
// Built app only: every @sentinel/map-kit module, so this container can
// provide each one a section remote uses. Here rather than in main.ts because
// map-kit imports MapLibre, which SDR Manager-only mode never loads. Empty in
// dev and tests.
import 'virtual:sentinel-shared-map-kit-modules'

import App from '@/App.vue'
import { createAppRouter } from '@/router'
import { startSectionEngines } from '@/shell/sectionEngines'
import type { ModeBoot } from './modeBoot'

/** Boots the full app: the map, every section, the SDR engine. */
export function fullAppBoot(): ModeBoot {
  maplibregl.setWorkerUrl(maplibreWorkerUrl)
  // Register PMTiles protocol once at app startup — never inside a component.
  const protocol = new pmtiles.Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol))
  return {
    rootComponent: App,
    createRouter: createAppRouter,
    // The SDR engine (its persistent radio pane) loads alongside the settings;
    // boot waits for it only up to a timeout, then mounts and late-mounts it.
    startEngines: () => startSectionEngines(),
  }
}
