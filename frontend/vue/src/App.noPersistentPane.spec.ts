/* eslint-disable vue/one-component-per-file -- this spec defines a couple of
   tiny stub components to stand in for App.vue's child components. */
/**
 * Focused spec for App.vue's `v-if="persistentRadioPane"` false branch: when
 * no registered section provides a persistent radio pane (sdr normally
 * does), the shell's `#radio` slot must render nothing rather than erroring
 * on `<component :is="undefined">`. Kept separate from App.spec.ts because it
 * needs to override `getPersistentRadioPane()` for the whole file — mounting
 * both behaviours from one file would mean one test's module mock leaking
 * into the other.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h, reactive } from 'vue'

vi.mock('vue-router', () => ({
  useRoute: () => reactive({ path: '/air/', meta: { domain: 'air' } }),
}))

vi.mock('@sentinel/map-kit/composables/useUserLocation', () => ({
  useUserLocation: () => ({
    locationUnavailable: { value: false },
    start: vi.fn(),
    hydrateFromConfig: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@sentinel/map-kit/composables/useRangeRingOrigin', () => ({
  useRangeRingOrigin: () => ({ hydrateFromConfig: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/composables/useAirAlertsService', () => ({
  useAirAlertsService: () => ({ start: vi.fn() }),
}))

vi.mock('@/composables/useSpaceAlertsService', () => ({
  useSpaceAlertsService: () => ({ start: vi.fn() }),
}))

vi.mock('@sentinel/shell-api/services/offlineMapsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentinel/shell-api/services/offlineMapsApi')>()),
  getOfflineMapStatus: vi.fn().mockResolvedValue({
    basemap_available: true,
    terrain_available: true,
    basemap_max_zoom: 14,
    terrain_max_zoom: 12,
    free_bytes: 0,
    used_bytes: 0,
    sources_configured: true,
    pmtiles_available: true,
    tiers_version: 'v1',
    avg_tile_bytes: { basemap: {}, terrain: {} },
  }),
  listOfflineRegions: vi.fn().mockResolvedValue([]),
}))

// The one override this file exists for: no section provides a persistent
// radio pane. Real registrations (getNavEntries, getSectionRoutes, etc.) are
// left untouched so the rest of the shell mounts exactly as it does in
// production — only the pane lookup is forced to the "none registered" case.
vi.mock('@sentinel/shell-api/shell/sectionRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentinel/shell-api/shell/sectionRegistry')>()
  return { ...actual, getPersistentRadioPane: () => undefined }
})

const MapSidebarStub = defineComponent({
  name: 'MapSidebar',
  props: { hideTabs: { type: Boolean, default: false } },
  setup(_props, { slots }) {
    return () => h('div', { class: 'map-sidebar-stub' }, [slots.radio?.()])
  },
})

const InertStub = defineComponent({ name: 'InertStub', setup: () => () => h('div') })

import App from './App.vue'

enableAutoUnmount(afterEach)

describe('App — no persistent radio pane registered', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders nothing in the #radio slot when no section registers a persistent pane', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          MapSidebar: MapSidebarStub,
          AppFooter: InertStub,
          SettingsPanel: InertStub,
          RouterView: InertStub,
          RouterLink: InertStub,
        },
      },
    })
    await flushPromises()

    const sidebarStub = wrapper.find('.map-sidebar-stub')
    expect(sidebarStub.exists()).toBe(true)
    // `v-if="persistentRadioPane"` is false, so `<component :is="...">` never
    // mounts — the slot content is just the v-if's comment anchor, which
    // `.element.children` (unlike `.childNodes`) does not count.
    expect(sidebarStub.element.children).toHaveLength(0)
  })
})
