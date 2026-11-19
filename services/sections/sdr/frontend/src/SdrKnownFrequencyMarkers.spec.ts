import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrKnownFrequencyMarkers from './SdrKnownFrequencyMarkers.vue'
import type { KnownFreqMarker } from './composables/useKnownFrequencyMarkers'

enableAutoUnmount(afterEach)

const SINGLE: KnownFreqMarker = {
  key: '1',
  leftPct: 20,
  isCluster: false,
  count: 1,
  label: 'Tower',
  members: [{ id: '1', label: 'Tower', frequencyHz: 118_500_000 }],
  tunedLabel: null,
}
const CLUSTER: KnownFreqMarker = {
  key: '2-3',
  leftPct: 70,
  isCluster: true,
  count: 2,
  label: 'Ground',
  members: [
    { id: '2', label: 'Ground', frequencyHz: 121_800_000 },
    { id: '3', label: 'Approach', frequencyHz: 121_810_000 },
  ],
  tunedLabel: null,
}

function mountMarkers(
  options: {
    markers?: KnownFreqMarker[]
    openKey?: string | null
    shownKeys?: string[]
  } = {},
) {
  const shownKeys = options.shownKeys ?? []
  return mount(SdrKnownFrequencyMarkers, {
    props: {
      markers: options.markers ?? [SINGLE, CLUSTER],
      openKey: options.openKey ?? null,
      isPopoverShown: (key: string) => shownKeys.includes(key),
      overlayStyle: { left: '56px', top: '19px' },
    },
    attachTo: document.body,
  })
}

describe('SdrKnownFrequencyMarkers — layout', () => {
  it('covers the data box and places each marker by percentage', () => {
    const wrapper = mountMarkers()
    expect(wrapper.find('.sdr-wf-known-overlay').attributes('style')).toContain('left: 56px')
    const markers = wrapper.findAll('.sdr-wf-known-marker')
    expect(markers).toHaveLength(2)
    expect(markers[0]!.attributes('style')).toContain('left: 20%')
    expect(markers[1]!.attributes('style')).toContain('left: 70%')
  })

  it('names a single dot after its frequency and a cluster by its count', () => {
    const dots = mountMarkers().findAll('button')
    expect(dots[0]!.attributes('aria-label')).toBe('Tower')
    expect(dots[1]!.attributes('aria-label')).toBe('2 known frequencies')
  })

  it('badges only a cluster with its count', () => {
    const markers = mountMarkers().findAll('.sdr-wf-known-marker')
    expect(markers[0]!.find('.sdr-wf-known-marker-badge').exists()).toBe(false)
    expect(markers[1]!.find('.sdr-wf-known-marker-badge').text()).toBe('2')
  })
})

describe('SdrKnownFrequencyMarkers — open and tuned state', () => {
  it('marks only the clicked-open marker open and expanded', () => {
    const wrapper = mountMarkers({ openKey: '2-3' })
    const markers = wrapper.findAll('.sdr-wf-known-marker')
    expect(markers[0]!.classes()).not.toContain('sdr-wf-known-marker--open')
    expect(markers[1]!.classes()).toContain('sdr-wf-known-marker--open')
    expect(markers[0]!.find('button').attributes('aria-expanded')).toBe('false')
    expect(markers[1]!.find('button').attributes('aria-expanded')).toBe('true')
  })

  it('tags the tuned marker with its name while its popover is hidden', () => {
    const wrapper = mountMarkers({ markers: [{ ...SINGLE, tunedLabel: 'Tower' }, CLUSTER] })
    const markers = wrapper.findAll('.sdr-wf-known-marker')
    expect(markers[0]!.classes()).toContain('sdr-wf-known-marker--tuned')
    expect(markers[0]!.find('.sdr-wf-known-marker-tag').text()).toBe('Tower')
    expect(markers[1]!.classes()).not.toContain('sdr-wf-known-marker--tuned')
    expect(markers[1]!.find('.sdr-wf-known-marker-tag').exists()).toBe(false)
  })

  it('swaps the tag for the popover when the tuned marker is shown', () => {
    const wrapper = mountMarkers({
      markers: [{ ...SINGLE, tunedLabel: 'Tower' }],
      shownKeys: ['1'],
    })
    expect(wrapper.find('.sdr-wf-known-marker-tag').exists()).toBe(false)
    expect(wrapper.find('[role="tooltip"]').text()).toBe('Tower')
  })

  it('lists every cluster member in its popover', () => {
    const wrapper = mountMarkers({ shownKeys: ['2-3'] })
    const popovers = wrapper.findAll('[role="tooltip"]')
    expect(popovers).toHaveLength(1)
    expect(
      popovers[0]!.findAll('.sdr-wf-known-marker-pop-line').map((line) => line.text()),
    ).toEqual(['Ground', 'Approach'])
  })
})

describe('SdrKnownFrequencyMarkers — events', () => {
  it('reports a click as a toggle of that marker', async () => {
    const wrapper = mountMarkers()
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('toggle')).toEqual([['2-3']])
  })

  it('reports pointer enter with the event and pointer leave with the key', async () => {
    const wrapper = mountMarkers()
    const dot = wrapper.findAll('button')[0]!
    await dot.trigger('pointerenter')
    await dot.trigger('pointerleave')
    const entered = wrapper.emitted('pointerEnter')!
    expect(entered).toHaveLength(1)
    expect(entered[0]![0]).toBeInstanceOf(Event)
    expect((entered[0]![0] as Event).type).toBe('pointerenter')
    expect(entered[0]![1]).toBe('1')
    expect(wrapper.emitted('pointerLeave')).toEqual([['1']])
  })
})

describe('SdrKnownFrequencyMarkers — accessibility', () => {
  it('has no axe violations closed, open and tuned', async () => {
    const wrapper = mountMarkers({
      markers: [{ ...SINGLE, tunedLabel: 'Tower' }, CLUSTER],
      openKey: '2-3',
      shownKeys: ['2-3'],
    })
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
