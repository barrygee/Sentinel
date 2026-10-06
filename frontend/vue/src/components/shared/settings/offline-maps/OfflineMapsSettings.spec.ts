import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { axe } from 'jest-axe'
import { OfflineMapsApiError } from '@sentinel/shell-api/services/offlineMapsApi'

const apiMock = vi.hoisted(() => ({
  getOfflineMapStatus: vi.fn(),
  listOfflineRegions: vi.fn(),
  createOfflineRegion: vi.fn(),
  deleteOfflineRegion: vi.fn(),
  getOfflineRegion: vi.fn(),
  estimateOfflineArea: vi.fn(),
}))
vi.mock('@sentinel/shell-api/services/offlineMapsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentinel/shell-api/services/offlineMapsApi')>()),
  getOfflineMapStatus: apiMock.getOfflineMapStatus,
  listOfflineRegions: apiMock.listOfflineRegions,
  createOfflineRegion: apiMock.createOfflineRegion,
  deleteOfflineRegion: apiMock.deleteOfflineRegion,
  getOfflineRegion: apiMock.getOfflineRegion,
  estimateOfflineArea: apiMock.estimateOfflineArea,
}))

// OfflineAreaMap owns a real MapLibre instance — stubbed here (it has its own
// dedicated spec) with a fake that exposes the same imperative surface and
// re-emits armed-change/draw-complete so OfflineMapsSettings's own wiring is
// what's under test.
const areaMapStub = vi.hoisted(() => ({
  armDraw: vi.fn(),
  cancelDraw: vi.fn(),
  currentViewBounds: vi.fn(() => ({ west: -1, south: 50, east: 1, north: 52 })),
  flyToBounds: vi.fn(),
}))
vi.mock('./OfflineAreaMap.vue', () => ({
  default: defineComponent({
    name: 'OfflineAreaMap',
    props: {
      selection: { type: Object, default: null },
      regions: { type: Array, default: () => [] },
    },
    emits: ['draw-complete', 'armed-change'],
    setup(_props, { expose }) {
      expose(areaMapStub)
      return () => h('div', { class: 'offline-area-map-stub' })
    },
  }),
}))

import OfflineMapsSettings from './OfflineMapsSettings.vue'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { useOfflineMapsStore } from '@sentinel/shell-api/stores/offlineMaps'

const STATUS = {
  basemap_available: true,
  terrain_available: true,
  basemap_max_zoom: 14,
  terrain_max_zoom: 12,
  free_bytes: 10_000_000_000,
  used_bytes: 0,
  sources_configured: true,
  pmtiles_available: true,
  tiers_version: 'v1',
  avg_tile_bytes: { basemap: { '0': 100 }, terrain: { '0': 50 } },
}

function mountSettings() {
  return mount(OfflineMapsSettings)
}

describe('OfflineMapsSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    apiMock.getOfflineMapStatus.mockResolvedValue(STATUS)
    apiMock.listOfflineRegions.mockResolvedValue([])
  })

  it('shows the estimate for a drawn area with 0 free space until the server status arrives', async () => {
    // Status still in flight: nothing yet says how much disk is free.
    apiMock.getOfflineMapStatus.mockReturnValue(new Promise(() => {}))
    const wrapper = mountSettings()
    await flushPromises()
    useOfflineMapsStore().setDraftBbox(-1, 50, 1, 52)
    await wrapper.vm.$nextTick()
    const estimate = wrapper.findComponent({ name: 'DownloadEstimate' })
    expect(estimate.exists()).toBe(true)
    expect(estimate.props('freeBytes')).toBe(0)
  })

  it("passes the server's free space to the estimate once status has loaded", async () => {
    const wrapper = mountSettings()
    await flushPromises()
    useOfflineMapsStore().setDraftBbox(-1, 50, 1, 52)
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'DownloadEstimate' }).props('freeBytes')).toBe(
      STATUS.free_bytes,
    )
  })

  it('fetches status and regions on mount', async () => {
    mountSettings()
    await flushPromises()
    expect(apiMock.getOfflineMapStatus).toHaveBeenCalled()
    expect(apiMock.listOfflineRegions).toHaveBeenCalled()
  })

  describe('download disabled reasons', () => {
    it('hides the estimate and DOWNLOAD, with no reason line, when no area is drawn', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      expect(wrapper.find('.oma-disabled-reason').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Draw or enter an area first.')
      expect(wrapper.findAll('button').some((button) => button.text() === 'DOWNLOAD')).toBe(false)
      expect(wrapper.find('.oma-estimate').exists()).toBe(false)
    })

    it('is disabled with a bounds-fix message for an invalid (out-of-range) area', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 999)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').text()).toBe(
        'Fix the highlighted area bounds before downloading.',
      )
    })

    it('is disabled when neither Basemap nor Terrain is ticked', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      // The store's setters refuse to reach "both off", so write the draft
      // directly: this guard is the last line if anything else ever does.
      offlineMapsStore.draft.includeBasemap = false
      offlineMapsStore.draft.includeTerrain = false
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').text()).toBe('Tick Basemap, Terrain, or both.')
    })

    it('is disabled off grid with a connectivity message', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      useAppStore().setConnectivityMode('offgrid')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').text()).toBe(
        'Downloads need a connection — you are off grid.',
      )
    })

    it('is disabled when the offline tile source is not configured/reachable', async () => {
      apiMock.getOfflineMapStatus.mockResolvedValue({ ...STATUS, sources_configured: false })
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').text()).toBe(
        'The offline tile source is not available on this server.',
      )
    })

    it('is disabled when pmtiles_available is false even if sources_configured is true', async () => {
      apiMock.getOfflineMapStatus.mockResolvedValue({ ...STATUS, pmtiles_available: false })
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').text()).toBe(
        'The offline tile source is not available on this server.',
      )
    })

    it('is disabled when the estimate exceeds free disk space', async () => {
      apiMock.getOfflineMapStatus.mockResolvedValue({ ...STATUS, free_bytes: 1 })
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').text()).toBe(
        'This exceeds the free disk space available.',
      )
    })

    it('is enabled (no disabled-reason paragraph) once a valid area with room fits', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.oma-disabled-reason').exists()).toBe(false)
      const downloadButton = wrapper
        .findAll('button')
        .find((button) => button.text() === 'DOWNLOAD')!
      expect(downloadButton.attributes('disabled')).toBeUndefined()
    })

    it('disables DOWNLOAD while a create request is submitting', async () => {
      let resolveCreate!: () => void
      apiMock.createOfflineRegion.mockReturnValue(
        new Promise((resolve) => {
          resolveCreate = () =>
            resolve({
              id: 'r',
              label: 'x',
              west: -1,
              south: 50,
              east: 1,
              north: 52,
              max_zoom: 12,
              include_basemap: true,
              include_terrain: true,
              status: 'queued',
              phase: null,
              bytes_done: 0,
              bytes_estimated: 0,
              tiles_estimated: 0,
              size_bytes: null,
              error: null,
              created_at: 1,
              completed_at: null,
            })
        }),
      )
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
      await wrapper.vm.$nextTick()
      const downloadButton = wrapper
        .findAll('button')
        .find((button) => button.text() === 'DOWNLOAD')!
      await downloadButton.trigger('click')
      expect(downloadButton.attributes('disabled')).toBeDefined()
      resolveCreate()
      await flushPromises()
      // Queued: the selected area is cleared, so DOWNLOAD goes with it.
      expect(offlineMapsStore.hasDraftArea).toBe(false)
      expect(wrapper.findAll('button').some((button) => button.text() === 'DOWNLOAD')).toBe(false)
    })
  })

  describe('wiring between the map and the form', () => {
    it('arms the map draw handler from DRAW AREA, and cancels when pressed again before a box is drawn', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const drawButton = () =>
        wrapper.findAll('button').find((button) => button.text() === 'DRAW AREA')!
      await drawButton().trigger('click')
      expect(areaMapStub.armDraw).toHaveBeenCalledTimes(1)
      expect(areaMapStub.cancelDraw).not.toHaveBeenCalled()
      await wrapper.findComponent({ name: 'OfflineAreaMap' }).vm.$emit('armed-change', true)
      await drawButton().trigger('click')
      expect(areaMapStub.cancelDraw).toHaveBeenCalledTimes(1)
      expect(areaMapStub.armDraw).toHaveBeenCalledTimes(1)
    })

    it('commits the drawn bounds to the draft store on draw-complete', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      await wrapper
        .findComponent({ name: 'OfflineAreaMap' })
        .vm.$emit('draw-complete', { west: -3, south: 54, east: -2, north: 55 })
      expect(offlineMapsStore.draft).toMatchObject({ west: -3, south: 54, east: -2, north: 55 })
    })

    it('CLEAR AREA forgets the selected area but keeps depth and contents', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      await wrapper
        .findComponent({ name: 'OfflineAreaMap' })
        .vm.$emit('draw-complete', { west: -3, south: 54, east: -2, north: 55 })
      offlineMapsStore.setDraftMaxZoom(10)
      const clearButton = wrapper
        .findAll('button')
        .find((button) => button.text() === 'CLEAR AREA')!
      await clearButton.trigger('click')
      expect(offlineMapsStore.hasDraftArea).toBe(false)
      expect(offlineMapsStore.draft.maxZoom).toBe(10)
      expect(areaMapStub.cancelDraw).not.toHaveBeenCalled()
    })

    it('CLEAR AREA pressed mid-draw stops the drawing and clears the area', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      offlineMapsStore.setDraftBbox(-3, 54, -2, 55)
      await wrapper.findComponent({ name: 'OfflineAreaMap' }).vm.$emit('armed-change', true)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'CLEAR AREA')!
        .trigger('click')
      expect(areaMapStub.cancelDraw).toHaveBeenCalled()
      expect(offlineMapsStore.hasDraftArea).toBe(false)
    })

    it('commits bounds typed into the BboxFields to the draft store', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      const northInput = wrapper
        .findAll('.oma-bbox-field')
        .find((field) => field.text().startsWith('NORTH'))!
        .find('input')
      await northInput.trigger('focus')
      await northInput.setValue('60')
      expect(offlineMapsStore.draft.north).toBe(60)
    })

    it('commits a depth change from the slider to the draft store, clamped by the store', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      await wrapper.find('input[type="range"]').setValue('9')
      expect(offlineMapsStore.draft.maxZoom).toBe(9)
    })

    it('commits a typed label to the draft store', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      await wrapper.find('#oma-label-input').setValue('Lake District')
      expect(offlineMapsStore.draft.label).toBe('Lake District')
    })

    it('uses the area map to resolve "use current view" bounds', async () => {
      const wrapper = mountSettings()
      await flushPromises()
      const offlineMapsStore = useOfflineMapsStore()
      const useCurrentViewButton = wrapper
        .findAll('button')
        .find((button) => button.text() === 'USE CURRENT VIEW')!
      await useCurrentViewButton.trigger('click')
      expect(offlineMapsStore.draft).toMatchObject({ west: -1, south: 50, east: 1, north: 52 })
    })

    it('flies the area map to a selected region', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([
        {
          id: 'r1',
          label: 'Lakes',
          west: -3,
          south: 54,
          east: -2,
          north: 55,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          status: 'complete',
          phase: null,
          bytes_done: 100,
          bytes_estimated: 100,
          tiles_estimated: 10,
          size_bytes: 100,
          error: null,
          created_at: 1,
          completed_at: 2,
        },
      ])
      const wrapper = mountSettings()
      await flushPromises()
      await wrapper.find('.oma-region-select').trigger('click')
      expect(areaMapStub.flyToBounds).toHaveBeenCalledWith({
        west: -3,
        south: 54,
        east: -2,
        north: 55,
      })
    })

    it('passes only complete regions to the area map as outlines', async () => {
      apiMock.listOfflineRegions.mockResolvedValue([
        {
          id: 'complete',
          label: 'A',
          west: -3,
          south: 54,
          east: -2,
          north: 55,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          status: 'complete',
          phase: null,
          bytes_done: 100,
          bytes_estimated: 100,
          tiles_estimated: 10,
          size_bytes: 100,
          error: null,
          created_at: 1,
          completed_at: 2,
        },
        {
          id: 'queued',
          label: 'B',
          west: 1,
          south: 1,
          east: 2,
          north: 2,
          max_zoom: 12,
          include_basemap: true,
          include_terrain: true,
          status: 'queued',
          phase: null,
          bytes_done: 0,
          bytes_estimated: 100,
          tiles_estimated: 10,
          size_bytes: null,
          error: null,
          created_at: 1,
          completed_at: null,
        },
      ])
      const wrapper = mountSettings()
      await flushPromises()
      const areaMapComponent = wrapper.findComponent({ name: 'OfflineAreaMap' })
      expect(areaMapComponent.props('regions')).toEqual([
        { west: -3, south: 54, east: -2, north: 55, label: 'A' },
      ])
    })
  })

  it('queues a download on DOWNLOAD click', async () => {
    apiMock.createOfflineRegion.mockResolvedValue({
      id: 'new',
      label: 'Untitled area',
      west: -1,
      south: 50,
      east: 1,
      north: 52,
      max_zoom: 12,
      include_basemap: true,
      include_terrain: true,
      status: 'queued',
      phase: null,
      bytes_done: 0,
      bytes_estimated: 100,
      tiles_estimated: 10,
      size_bytes: null,
      error: null,
      created_at: 1,
      completed_at: null,
    })
    const wrapper = mountSettings()
    await flushPromises()
    const offlineMapsStore = useOfflineMapsStore()
    offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
    await wrapper.vm.$nextTick()
    const downloadButton = wrapper.findAll('button').find((button) => button.text() === 'DOWNLOAD')!
    await downloadButton.trigger('click')
    await flushPromises()
    expect(apiMock.createOfflineRegion).toHaveBeenCalled()
    expect(offlineMapsStore.regions).toHaveLength(1)
    // The queued area becomes the region; the selection and its estimate go.
    expect(offlineMapsStore.hasDraftArea).toBe(false)
    expect(wrapper.find('.oma-estimate').exists()).toBe(false)
  })

  it('shows the store submitError as an alert', async () => {
    apiMock.createOfflineRegion.mockRejectedValue(
      new OfflineMapsApiError(507, 'Not enough free disk space.'),
    )
    const wrapper = mountSettings()
    await flushPromises()
    const offlineMapsStore = useOfflineMapsStore()
    offlineMapsStore.setDraftBbox(-1, 50, 1, 52)
    await wrapper.vm.$nextTick()
    const downloadButton = wrapper.findAll('button').find((button) => button.text() === 'DOWNLOAD')!
    await downloadButton.trigger('click')
    await flushPromises()
    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts.some((alert) => alert.text() === 'Not enough free disk space.')).toBe(true)
    // A rejected download keeps the area, so the user can adjust and retry.
    expect(offlineMapsStore.hasDraftArea).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountSettings()
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
