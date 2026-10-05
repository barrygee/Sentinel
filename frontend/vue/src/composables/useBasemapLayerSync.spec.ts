import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import type { Map } from 'maplibre-gl'
import { useBasemapStore } from '@sentinel/shell-api/stores/basemap'
import { BASEMAP_LAYER_GROUPS, type BasemapLayerGroup } from '@/utils/basemapLayers'
import { useBasemapLayerSync } from './useBasemapLayerSync'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn().mockResolvedValue(undefined),
}))

/** A fake map whose style holds every layer of every group. */
function fakeMap() {
  return {
    getLayer: vi.fn((layerId: string) => ({ id: layerId })),
    setLayoutProperty: vi.fn(),
  }
}

type FakeMap = ReturnType<typeof fakeMap>

/** The visibility last written to each layer id. */
function visibilities(map: FakeMap): Record<string, string> {
  return Object.fromEntries(
    map.setLayoutProperty.mock.calls.map(([layerId, , value]) => [layerId, value]),
  )
}

/** Run the composable in a scope, as a component's setup would. */
function startSync(getMap: () => Map | null, groups: readonly BasemapLayerGroup[]) {
  const scope = effectScope()
  const sync = scope.run(() => useBasemapLayerSync(getMap, groups))!
  return { sync, scope }
}

describe('useBasemapLayerSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('applies the stored visibility of each requested group when asked', () => {
    const map = fakeMap()
    const basemapStore = useBasemapStore()
    basemapStore.layers.roads = false
    basemapStore.layers.borders = true
    const { sync } = startSync(() => map as unknown as Map, ['roads', 'borders'])

    sync.apply()

    const written = visibilities(map)
    for (const layerId of BASEMAP_LAYER_GROUPS.roads) expect(written[layerId]).toBe('none')
    for (const layerId of BASEMAP_LAYER_GROUPS.borders) expect(written[layerId]).toBe('visible')
  })

  it('leaves groups it was not given alone', () => {
    const map = fakeMap()
    const { sync } = startSync(() => map as unknown as Map, ['borders'])

    sync.apply()

    const touched = map.setLayoutProperty.mock.calls.map(([layerId]) => layerId)
    expect(touched).toEqual([...BASEMAP_LAYER_GROUPS.borders])
  })

  it('does nothing before the map exists', () => {
    const { sync } = startSync(() => null, ['borders'])
    expect(() => sync.apply()).not.toThrow()
  })

  it('re-applies when a requested group changes in the store', async () => {
    const map = fakeMap()
    startSync(() => map as unknown as Map, ['borders'])

    useBasemapStore().setLayer('borders', false)
    await nextTick()

    for (const layerId of BASEMAP_LAYER_GROUPS.borders) {
      expect(map.setLayoutProperty).toHaveBeenCalledWith(layerId, 'visibility', 'none')
    }
  })

  it('ignores a change to a group it does not follow', async () => {
    const map = fakeMap()
    startSync(() => map as unknown as Map, ['borders'])

    useBasemapStore().setLayer('names', true)
    await nextTick()

    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('stops following the store once its scope is disposed', async () => {
    const map = fakeMap()
    const { scope } = startSync(() => map as unknown as Map, ['borders'])
    scope.stop()

    useBasemapStore().setLayer('borders', false)
    await nextTick()

    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})
