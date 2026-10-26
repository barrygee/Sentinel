import type { Component } from 'vue'
import type { Router } from 'vue-router'

/**
 * What main.ts needs from an app mode to boot it: the root component, the
 * mode's router, and anything to start before mounting. Each mode's boot is a
 * chunk of its own (`fullAppBoot`, `sdrManagerOnlyBoot`), loaded once core has
 * said which mode this is, so a mode never downloads the other's code — SDR
 * Manager-only mode never downloads the map (with
 * `lazyMapSharesPlugin`, @sentinel/web-config/federation).
 */
export interface ModeBoot {
  rootComponent: Component
  /** Builds the router. Called once every remote has registered. */
  createRouter: () => Router
  /** Starts what must run alongside the settings fetch; boot awaits it before mounting. */
  startEngines: () => Promise<unknown>
}
