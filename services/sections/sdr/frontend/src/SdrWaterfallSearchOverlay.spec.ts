import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrWaterfallSearchOverlay from './SdrWaterfallSearchOverlay.vue'
import { useSdrStore } from './stores/sdr'

enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
})

function mountOverlay() {
  return mount(SdrWaterfallSearchOverlay, { attachTo: document.body })
}

function progressBar(wrapper: ReturnType<typeof mountOverlay>) {
  return wrapper.find('[role="progressbar"]')
}

describe('SdrWaterfallSearchOverlay — idle', () => {
  it('renders nothing while neither a search nor a scan sweeps', () => {
    expect(mountOverlay().find('.sdr-wf-search-overlay').exists()).toBe(false)
  })
})

describe('SdrWaterfallSearchOverlay — search', () => {
  it('shows the range in MHz and the progress through it', async () => {
    const store = useSdrStore()
    store.searchSweeping = true
    store.searchLowHz = 144_000_000
    store.searchHighHz = 146_000_000
    store.searchCurrentHz = 144_500_000
    const wrapper = mountOverlay()
    expect(wrapper.find('.sdr-wf-search-overlay-headline').text()).toBe('Searching')
    expect(
      wrapper.findAll('.sdr-wf-search-overlay-range-val').map((value) => value.text()),
    ).toEqual(['144.0000', '146.0000'])
    expect(progressBar(wrapper).attributes('aria-valuenow')).toBe('25')
    expect(progressBar(wrapper).attributes('aria-label')).toBe('Search progress')
    expect(wrapper.find('.sdr-wf-search-overlay-progress-fill').attributes('style')).toBe(
      'width: 25%;',
    )
  })

  it('shows dashes and no progress before the range is known', () => {
    useSdrStore().searchSweeping = true
    const wrapper = mountOverlay()
    expect(
      wrapper.findAll('.sdr-wf-search-overlay-range-val').map((value) => value.text()),
    ).toEqual(['—', '—'])
    expect(progressBar(wrapper).attributes('aria-valuenow')).toBe('0')
  })

  it('shows no progress until the sweep reports a position', () => {
    const store = useSdrStore()
    store.searchSweeping = true
    store.searchLowHz = 144_000_000
    store.searchHighHz = 146_000_000
    expect(progressBar(mountOverlay()).attributes('aria-valuenow')).toBe('0')
  })

  it('shows no progress for an inverted range', () => {
    const store = useSdrStore()
    store.searchSweeping = true
    store.searchLowHz = 146_000_000
    store.searchHighHz = 146_000_000
    store.searchCurrentHz = 146_000_000
    expect(progressBar(mountOverlay()).attributes('aria-valuenow')).toBe('0')
  })

  it('clamps the progress to 0..100', async () => {
    const store = useSdrStore()
    store.searchSweeping = true
    store.searchLowHz = 144_000_000
    store.searchHighHz = 146_000_000
    store.searchCurrentHz = 147_000_000
    const wrapper = mountOverlay()
    expect(progressBar(wrapper).attributes('aria-valuenow')).toBe('100')
    store.searchCurrentHz = 143_000_000
    await wrapper.vm.$nextTick()
    expect(progressBar(wrapper).attributes('aria-valuenow')).toBe('0')
  })

  it('shows the search name as a chip only when there is one', async () => {
    const store = useSdrStore()
    store.searchSweeping = true
    const wrapper = mountOverlay()
    expect(wrapper.find('.sdr-wf-scan-overlay-groups').exists()).toBe(false)
    store.searchLabel = '2m band'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sdr-wf-scan-overlay-groups').text()).toBe('2m band')
  })

  it('wins over a scan when both flags are set', () => {
    const store = useSdrStore()
    store.searchSweeping = true
    store.scanSweeping = true
    const wrapper = mountOverlay()
    expect(wrapper.findAll('.sdr-wf-search-overlay')).toHaveLength(1)
    expect(wrapper.find('.sdr-wf-search-overlay-headline').text()).toBe('Searching')
  })
})

describe('SdrWaterfallSearchOverlay — scan', () => {
  it('shows a chip per scanned group, duplicates included', () => {
    const store = useSdrStore()
    store.scanSweeping = true
    store.scanGroupNames = ['Airband', 'Marine', 'Airband']
    const wrapper = mountOverlay()
    expect(wrapper.find('.sdr-wf-search-overlay-headline').text()).toBe('Scanning')
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false)
    expect(wrapper.findAll('.sdr-wf-scan-overlay-groups > *').map((chip) => chip.text())).toEqual([
      'Airband',
      'Marine',
      'Airband',
    ])
  })
})

describe('SdrWaterfallSearchOverlay — accessibility', () => {
  it('has no axe violations while searching', async () => {
    const store = useSdrStore()
    store.searchSweeping = true
    store.searchLowHz = 144_000_000
    store.searchHighHz = 146_000_000
    store.searchCurrentHz = 145_000_000
    store.searchLabel = '2m band'
    const wrapper = mountOverlay()
    expect(await axe(wrapper.element.parentElement as HTMLElement)).toHaveNoViolations()
  })

  it('has no axe violations while scanning', async () => {
    const store = useSdrStore()
    store.scanSweeping = true
    store.scanGroupNames = ['Airband']
    const wrapper = mountOverlay()
    expect(await axe(wrapper.element.parentElement as HTMLElement)).toHaveNoViolations()
  })
})
