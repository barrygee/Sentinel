import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSearchSection from './SdrSearchSection.vue'
import SdrAdhocSearchRow from './SdrAdhocSearchRow.vue'
import SdrSavedRangesList from './SdrSavedRangesList.vue'
import type { SdrSearchRange } from './services/sdrSearchApi'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const RANGE: SdrSearchRange = {
  id: 4,
  label: 'PMR',
  low_hz: 446_000_000,
  high_hz: 446_200_000,
  step_hz: 12_500,
  mode: 'NFM',
  threshold_dbfs: -60,
  dwell_ms: 500,
  band_name: '',
  enabled: true,
  notes: '',
  sort_order: 0,
}

interface SearchProps {
  searchActive?: boolean
  searchLocked?: boolean
  adhocSearching?: boolean
  adhocValid?: boolean
  controlsDisabled?: boolean
  tuningDisabled?: boolean
  ranges?: SdrSearchRange[]
  selectedRangeId?: number | null
  isRangeSearching?: (rangeId: number) => boolean
}

function mountSearch(props: SearchProps = {}) {
  return mount(SdrSearchSection, {
    props: {
      expanded: true,
      savedRangesExpanded: true,
      lowMhz: '446',
      highMhz: '446.2',
      stepKhz: '12.5',
      searchActive: props.searchActive ?? false,
      searchLocked: props.searchLocked ?? false,
      adhocSearching: props.adhocSearching ?? false,
      adhocValid: props.adhocValid ?? true,
      controlsDisabled: props.controlsDisabled ?? false,
      tuningDisabled: props.tuningDisabled ?? false,
      ranges: props.ranges ?? [RANGE],
      selectedRangeId: props.selectedRangeId ?? null,
      isRangeSearching: props.isRangeSearching ?? (() => false),
    },
    attachTo: document.body,
  })
}

describe('SdrSearchSection — accordion and state', () => {
  it('is a SEARCH accordion controlling its body, and emits update:expanded', async () => {
    const wrapper = mountSearch()
    const toggle = wrapper.findAll('.base-accordion-toggle')[0]!
    expect(toggle.text()).toContain('SEARCH')
    expect(toggle.attributes('aria-controls')).toBe('sdr-search-section')
    await toggle.trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[false]])
  })

  it('relays the nested SAVED RANGES accordion as update:savedRangesExpanded', async () => {
    const wrapper = mountSearch()
    wrapper.findComponent(SdrSavedRangesList).vm.$emit('update:expanded', false)
    expect(wrapper.emitted('update:savedRangesExpanded')).toEqual([[false]])
  })

  it('shows the search state in the bar: hidden, searching, then paused', () => {
    expect((mountSearch().find('.sdr-scan-state-row').element as HTMLElement).style.display).toBe(
      'none',
    )
    expect(mountSearch({ searchActive: true }).find('.sdr-scan-state-label').text()).toBe(
      'SEARCHING',
    )
    expect(
      mountSearch({ searchActive: true, searchLocked: true }).find('.sdr-scan-state-label').text(),
    ).toBe('SEARCHING PAUSED')
  })
})

describe('SdrSearchSection — one-off range', () => {
  it('relays the LOW, HIGH and STEP models', () => {
    const adhocRow = mountSearch().findComponent(SdrAdhocSearchRow)
    expect(adhocRow.props()).toMatchObject({ lowMhz: '446', highMhz: '446.2', stepKhz: '12.5' })
  })

  it('relays model updates from the row', () => {
    const wrapper = mountSearch()
    const adhocRow = wrapper.findComponent(SdrAdhocSearchRow)
    adhocRow.vm.$emit('update:lowMhz', '430')
    adhocRow.vm.$emit('update:highMhz', '440')
    adhocRow.vm.$emit('update:stepKhz', '25')
    expect(wrapper.emitted('update:lowMhz')).toEqual([['430']])
    expect(wrapper.emitted('update:highMhz')).toEqual([['440']])
    expect(wrapper.emitted('update:stepKhz')).toEqual([['25']])
  })

  it.each([
    [{}, false],
    [{ controlsDisabled: true }, true],
    [{ searchActive: true }, true],
  ])('locks the inputs for %o: %s', (props, expectedLocked) => {
    expect(mountSearch(props).findComponent(SdrAdhocSearchRow).props('inputsDisabled')).toBe(
      expectedLocked,
    )
  })

  it.each([
    [{ adhocValid: true }, false],
    [{ adhocValid: false }, true],
    [{ adhocValid: false, adhocSearching: true }, false],
    [{ tuningDisabled: true }, true],
    [{ tuningDisabled: true, adhocSearching: true }, true],
  ])('disables the play button for %o: %s', (props, expectedDisabled) => {
    expect(mountSearch(props).findComponent(SdrAdhocSearchRow).props('playDisabled')).toBe(
      expectedDisabled,
    )
  })

  it('passes adhocSearching through as the row running state', () => {
    expect(
      mountSearch({ adhocSearching: true }).findComponent(SdrAdhocSearchRow).props('searching'),
    ).toBe(true)
  })

  it('emits toggleAdhocSearch from the row', async () => {
    const wrapper = mountSearch()
    await wrapper.findComponent(SdrAdhocSearchRow).find('.sdr-search-adhoc-play').trigger('click')
    expect(wrapper.emitted('toggleAdhocSearch')).toHaveLength(1)
  })
})

describe('SdrSearchSection — saved ranges', () => {
  it('passes the ranges, selection, lock and searching test to the list', () => {
    const isRangeSearching = (rangeId: number) => rangeId === 4
    const list = mountSearch({
      selectedRangeId: 4,
      tuningDisabled: true,
      isRangeSearching,
    }).findComponent(SdrSavedRangesList)
    expect(list.props()).toMatchObject({
      ranges: [RANGE],
      selectedRangeId: 4,
      disabled: true,
      isRangeSearching,
    })
  })

  it('relays select and toggleSearch with the range id', async () => {
    const wrapper = mountSearch()
    await wrapper.find('.sdr-search-range-item-body').trigger('click')
    await wrapper.find('.sdr-search-range-item-play').trigger('click')
    expect(wrapper.emitted('selectRange')).toEqual([[4]])
    expect(wrapper.emitted('toggleRangeSearch')).toEqual([[4]])
  })
})

describe('SdrSearchSection — accessibility', () => {
  it('has no axe violations idle and searching', async () => {
    expect(await axe(mountSearch().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(
      await axe(mountSearch({ searchActive: true, adhocSearching: true }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
  })
})
