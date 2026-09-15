import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LandCameraDetails from './LandCameraDetails.vue'
import type { CameraFeature } from '@/types/landFeeds'

/**
 * `LandCameraDetails` is the accordion body for one camera in the Land FILTER
 * pane: the live still, the CAMERA / LOCATION / NOTES grids and SHOW ON MAP.
 */

function camera(overrides: Partial<CameraFeature['properties']> = {}): CameraFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-1.586437, 54.784455] },
    properties: {
      kind: 'camera',
      id: 'durham-cc:dutmc_24',
      name: 'Framwellgate Peth',
      description: 'CCTV camera mounted onto existing street lighting column number 332.',
      view: 'View towards the City Centre',
      updatedAt: null,
      state: 'live',
      imageUrl: '/api/land/feeds/durham-cc/image/dutmc_24',
      clipUrl: null,
      externalUrl: null,
      sourceId: 'durham-cc',
      sourceName: 'Durham County Council',
      attribution: 'OGL',
      ...overrides,
    },
  }
}

function mountDetails(overrides: Partial<CameraFeature['properties']> = {}, refreshSeconds = 60) {
  return mount(LandCameraDetails, { props: { camera: camera(overrides), refreshSeconds } })
}

describe('LandCameraDetails', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the proxied still with an accessible alt, cache-busted', () => {
    const wrapper = mountDetails()
    const image = wrapper.get('img')
    expect(image.attributes('alt')).toBe('Framwellgate Peth — latest camera image')
    expect(image.attributes('src')).toMatch(
      /^\/api\/land\/feeds\/durham-cc\/image\/dutmc_24\?t=\d+$/,
    )
  })

  it('shows the state in place of the image when the camera has none', () => {
    const wrapper = mountDetails({ imageUrl: null, state: 'offline' })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.land-camera-details-no-image').text()).toBe('OFFLINE')
  })

  it('lists state, source, position (5 dp), view and the description', () => {
    const text = mountDetails().text()
    expect(text).toContain('LIVE')
    expect(text).toContain('Durham County Council')
    expect(text).toContain('54.78446')
    expect(text).toContain('-1.58644')
    expect(text).toContain('View towards the City Centre')
    expect(text).toContain('street lighting column number 332')
  })

  it('omits the NOTES grid when there is no description and dashes a missing view', () => {
    const wrapper = mountDetails({ description: '', view: null })
    expect(wrapper.text()).not.toContain('NOTES')
    expect(wrapper.text()).toContain('—')
  })

  it('falls back to the feed cadence for UPDATED when the camera carries no timestamp', () => {
    expect(mountDetails({}, 300).text()).toContain('every ~300s')
  })

  it('assumes a 60 s cadence when the feed does not say', () => {
    const wrapper = mount(LandCameraDetails, { props: { camera: camera() } })
    expect(wrapper.text()).toContain('every ~60s')
  })

  it('formats a valid timestamp as a local time and dashes an unparseable one', () => {
    const stamped = mountDetails({ updatedAt: '2026-09-14T19:29:11Z' }).text()
    expect(stamped).not.toContain('every ~')
    expect(stamped).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(mountDetails({ updatedAt: 'not a date' }).text()).toContain('—')
  })

  it('re-requests the still at the feed cadence (floored at 15 s) and stops on unmount', async () => {
    vi.useFakeTimers()
    const wrapper = mountDetails({}, 5)
    const initialSrc = wrapper.get('img').attributes('src')
    vi.advanceTimersByTime(14_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('img').attributes('src')).toBe(initialSrc)
    vi.setSystemTime(Date.now() + 1)
    vi.advanceTimersByTime(1_001)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('img').attributes('src')).not.toBe(initialSrc)
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
  })

  it('emits locate with the feature id from SHOW ON MAP', async () => {
    const wrapper = mountDetails()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('locate')).toEqual([['durham-cc:dutmc_24']])
  })

  it('has no accessibility violations with and without an image', async () => {
    // The body renders inside the FILTER pane's landmark in the app; alone in
    // a test there is none, so the page-level region rule is not meaningful.
    const axeOptions = { rules: { region: { enabled: false } } }
    expect(await axe(mountDetails().element, axeOptions)).toHaveNoViolations()
    expect(await axe(mountDetails({ imageUrl: null }).element, axeOptions)).toHaveNoViolations()
  })
})
