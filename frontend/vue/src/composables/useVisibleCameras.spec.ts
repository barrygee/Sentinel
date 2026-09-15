import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVisibleCameras } from './useVisibleCameras'
import { useLandStore } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import type { CameraFeature, FeedWithStatus } from '@/types/landFeeds'

/**
 * `useVisibleCameras` groups the plotted cameras by source for the Land FILTER
 * pane. These tests pin the three things the pane relies on: the layer flag
 * empties it, only enabled feeds appear (in configured order), and "in view"
 * means inside the store's viewport bounds — with no bounds meaning everything.
 */

function feed(overrides: Partial<FeedWithStatus>): FeedWithStatus {
  return {
    id: 'durham-cc',
    name: 'Durham County Council',
    category: 'traffic-cameras',
    provider: 'durham',
    url: 'https://example.test',
    enabled: true,
    refreshSeconds: 60,
    datasets: [],
    bbox: null,
    location: null,
    auth: { type: 'none' },
    status: {
      lastFetchAt: null,
      lastError: null,
      featureCount: 0,
      credentialConfigured: false,
      running: true,
    },
    ...overrides,
  }
}

function camera(id: string, sourceId: string, coordinates: [number, number]): CameraFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      kind: 'camera',
      id: `${sourceId}:${id}`,
      name: id,
      description: '',
      view: null,
      updatedAt: null,
      state: 'live',
      imageUrl: null,
      clipUrl: null,
      externalUrl: null,
      sourceId,
      sourceName: sourceId,
      attribution: `© ${sourceId}`,
    },
  }
}

describe('useVisibleCameras', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed(): void {
    const landFeedsStore = useLandFeedsStore()
    landFeedsStore.feeds = [
      feed({ id: 'durham-cc' }),
      feed({ id: 'tfl-jamcams', name: 'TfL JamCams' }),
      feed({ id: 'utmc', name: 'UTMC', enabled: false }),
    ]
    landFeedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [
          camera('a', 'durham-cc', [-1.58, 54.78]),
          camera('b', 'durham-cc', [-1.7, 54.6]),
        ],
      },
      'tfl-jamcams': {
        type: 'FeatureCollection',
        features: [camera('c', 'tfl-jamcams', [-0.1, 51.5])],
      },
      utmc: { type: 'FeatureCollection', features: [camera('d', 'utmc', [-1.6, 54.97])] },
    }
    useLandStore().setTrafficCamerasLayerVisible(true)
  }

  it('is empty while the Traffic Cameras layer is hidden', () => {
    seed()
    useLandStore().setTrafficCamerasLayerVisible(false)
    const { sources, visibleCameras } = useVisibleCameras()
    expect(sources.value).toEqual([])
    expect(visibleCameras.value).toEqual([])
  })

  it('lists enabled feeds only, in configured order, with every camera when no bounds are known', () => {
    seed()
    const { sources, visibleCameras } = useVisibleCameras()
    expect(sources.value.map((source) => source.feed.id)).toEqual(['durham-cc', 'tfl-jamcams'])
    expect(sources.value[0]!.visible).toHaveLength(2)
    expect(sources.value[0]!.total).toBe(2)
    expect(sources.value[0]!.attribution).toBe('© durham-cc')
    expect(visibleCameras.value.map((item) => item.properties.id)).toEqual([
      'durham-cc:a',
      'durham-cc:b',
      'tfl-jamcams:c',
    ])
  })

  it('filters each source to the cameras inside the viewport bounds, keeping the total', () => {
    seed()
    useLandFeedsStore().setViewportBounds({ west: -1.6, east: -1.5, south: 54.7, north: 54.8 })
    const { sources } = useVisibleCameras()
    expect(sources.value[0]!.visible.map((item) => item.properties.id)).toEqual(['durham-cc:a'])
    expect(sources.value[0]!.total).toBe(2)
    expect(sources.value[1]!.visible).toEqual([])
    expect(sources.value[1]!.total).toBe(1)
  })

  it('reports an empty attribution and zero total for an enabled feed with no snapshot yet', () => {
    seed()
    useLandFeedsStore().featuresByFeed = {}
    const { sources } = useVisibleCameras()
    expect(sources.value[0]).toMatchObject({ visible: [], total: 0, attribution: '' })
  })

  it('looks a camera up by id across every feed, including disabled ones, and misses cleanly', () => {
    seed()
    const { cameraById } = useVisibleCameras()
    expect(cameraById('tfl-jamcams:c')?.properties.name).toBe('c')
    expect(cameraById('utmc:d')?.properties.name).toBe('d')
    expect(cameraById('nope:x')).toBeUndefined()
  })
})
