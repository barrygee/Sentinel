import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandCamerasList from './LandCamerasList.vue'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature } from '@/types/landFeeds'

enableAutoUnmount(afterEach)

function camera(overrides: Partial<CameraFeature['properties']> = {}): CameraFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-1.6, 54.9] },
    properties: {
      kind: 'camera',
      id: 'durham-cc:dutmc_24',
      name: 'Framwellgate Peth',
      description: '',
      view: 'West',
      updatedAt: null,
      state: 'live',
      imageUrl: '/api/land/feeds/durham-cc/image/dutmc_24',
      clipUrl: null,
      externalUrl: null,
      sourceId: 'durham-cc',
      sourceName: 'Durham County Council',
      attribution: '',
      ...overrides,
    },
  }
}

describe('LandCamerasList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountList() {
    return mount(LandCamerasList)
  }

  it('shows the layer-hidden empty message when the traffic cameras layer is off', () => {
    useLandStore().setTrafficCamerasLayerVisible(false)
    const wrapper = mountList()
    expect(wrapper.text()).toContain('Traffic cameras layer hidden')
  })

  it('shows the no-cameras empty message when the layer is on but nothing has arrived', () => {
    const wrapper = mountList()
    expect(wrapper.text()).toContain('No traffic cameras in view')
  })

  it('lists every camera across every feed when no viewport bounds are set yet', () => {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': { type: 'FeatureCollection', features: [camera()] },
      'tfl-jamcams': {
        type: 'FeatureCollection',
        features: [camera({ id: 'tfl-jamcams:00001.00865', name: 'A1 Southbound' })],
      },
    }
    const wrapper = mountList()
    const names = wrapper.findAll('.land-cameras-list-item-name').map((node) => node.text())
    expect(names).toEqual(['Framwellgate Peth', 'A1 Southbound'])
  })

  it('filters to cameras within the current viewport bounds', () => {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [
          camera({ id: 'inside' }), // [-1.6, 54.9]
          camera({
            id: 'outside',
            name: 'Far away camera',
          }),
        ],
      },
    }
    // Move the second feature's coordinates outside the bounds below.
    landFeedsStore.featuresByFeed['durham-cc']!.features[1]!.geometry.coordinates = [10, 60]
    landFeedsStore.setViewportBounds({ west: -2, south: 54, east: -1, north: 55 })
    const wrapper = mountList()
    const names = wrapper.findAll('.land-cameras-list-item-name').map((node) => node.text())
    expect(names).toEqual(['Framwellgate Peth'])
  })

  it('shows an empty list once every camera falls outside the viewport', () => {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': { type: 'FeatureCollection', features: [camera()] },
    }
    landFeedsStore.setViewportBounds({ west: 10, south: 10, east: 20, north: 20 })
    const wrapper = mountList()
    expect(wrapper.text()).toContain('No traffic cameras in view')
    expect(wrapper.findAll('.land-cameras-list-item')).toHaveLength(0)
  })

  it('shows nothing while the layer is off, even with cameras loaded and in view', () => {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': { type: 'FeatureCollection', features: [camera()] },
    }
    useLandStore().setTrafficCamerasLayerVisible(false)
    const wrapper = mountList()
    expect(wrapper.findAll('.land-cameras-list-item')).toHaveLength(0)
    expect(wrapper.text()).toContain('Traffic cameras layer hidden')
  })

  it('shows each camera state label uppercased, with a distinct class per state', () => {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [
          camera({ id: 'live-cam', state: 'live' }),
          camera({ id: 'stale-cam', state: 'stale' }),
          camera({ id: 'offline-cam', state: 'offline' }),
        ],
      },
    }
    const wrapper = mountList()
    const states = wrapper.findAll('.land-cameras-list-item-state')
    expect(states.map((node) => node.text())).toEqual(['LIVE', 'STALE', 'OFFLINE'])
    expect(states[0]!.classes()).toContain('land-cameras-list-item-state--live')
    expect(states[1]!.classes()).toContain('land-cameras-list-item-state--stale')
    expect(states[2]!.classes()).toContain('land-cameras-list-item-state--offline')
  })

  it('dispatches land-camera-selected with the clicked camera id, for map parity', async () => {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': { type: 'FeatureCollection', features: [camera()] },
    }
    const listener = vi.fn()
    document.addEventListener('land-camera-selected', listener)
    const wrapper = mountList()
    await wrapper.find('.land-cameras-list-item').trigger('click')
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      featureId: 'durham-cc:dutmc_24',
    })
    document.removeEventListener('land-camera-selected', listener)
  })

  it('has no accessibility violations empty or populated', async () => {
    const empty = mountList()
    expect(await axe(empty.element)).toHaveNoViolations()

    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.featuresByFeed = {
      'durham-cc': { type: 'FeatureCollection', features: [camera()] },
    }
    const populated = mountList()
    expect(await axe(populated.element)).toHaveNoViolations()
  })
})
