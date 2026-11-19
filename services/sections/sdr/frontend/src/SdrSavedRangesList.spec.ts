import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSavedRangesList from './SdrSavedRangesList.vue'
import type { SdrSearchRange } from './services/sdrSearchApi'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function makeRange(overrides: Partial<SdrSearchRange> & { id: number }): SdrSearchRange {
  return {
    label: `Range ${overrides.id}`,
    low_hz: 144_000_000,
    high_hz: 146_000_000,
    step_hz: 12_500,
    mode: 'NFM',
    threshold_dbfs: -60,
    dwell_ms: 500,
    band_name: '',
    enabled: true,
    notes: '',
    sort_order: overrides.id,
    ...overrides,
  }
}

const RANGES = [
  makeRange({
    id: 1,
    label: 'Two metre',
    low_hz: 144_000_000,
    high_hz: 146_000_000,
    step_hz: 12_500,
  }),
  makeRange({
    id: 2,
    label: 'Air band',
    low_hz: 118_000_000,
    high_hz: 136_975_000,
    step_hz: 8_330,
    mode: 'AM',
  }),
]

interface ListProps {
  ranges?: SdrSearchRange[]
  selectedRangeId?: number | null
  disabled?: boolean
  searchingRangeId?: number | null
  expanded?: boolean
}

function mountList(props: ListProps = {}) {
  const searchingRangeId = props.searchingRangeId ?? null
  return mount(SdrSavedRangesList, {
    props: {
      expanded: props.expanded ?? true,
      ranges: props.ranges ?? RANGES,
      selectedRangeId: props.selectedRangeId ?? null,
      disabled: props.disabled ?? false,
      isRangeSearching: (rangeId: number) => rangeId === searchingRangeId,
    },
    attachTo: document.body,
  })
}

describe('SdrSavedRangesList — accordion', () => {
  it('is titled SAVED RANGES and controls its body', () => {
    const toggle = mountList().find('.base-accordion-toggle')
    expect(toggle.text()).toContain('SAVED RANGES')
    expect(toggle.attributes('aria-controls')).toBe('sdr-saved-ranges-section')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('emits update:expanded when the header is clicked', async () => {
    const wrapper = mountList({ expanded: false })
    await wrapper.find('.base-accordion-toggle').trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[true]])
  })
})

describe('SdrSavedRangesList — rows', () => {
  it('shows each range with its label, MHz span and step/mode tooltip', () => {
    const rows = mountList().findAll('.sdr-search-range-item')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('.sdr-search-range-primary').text()).toBe('Two metre')
    expect(rows[0]!.find('.sdr-search-range-secondary').text()).toMatch(/^144\.000–146\.000\s+MHz$/)
    expect(rows[0]!.attributes('title')).toBe('step 12.50 kHz · NFM')
    expect(rows[1]!.find('.sdr-search-range-secondary').text()).toMatch(/^118\.000–136\.975\s+MHz$/)
    expect(rows[1]!.attributes('title')).toBe('step 8.33 kHz · AM')
  })

  it('marks only the selected range active', () => {
    const rows = mountList({ selectedRangeId: 2 }).findAll('.sdr-search-range-item')
    expect(rows[0]!.classes()).not.toContain('sdr-search-range-item-active')
    expect(rows[1]!.classes()).toContain('sdr-search-range-item-active')
  })

  it('emits select with the range id when a row body is clicked', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.sdr-search-range-item-body')[1]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2]])
  })

  it('emits toggleSearch, and not select, when a row play button is clicked', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.sdr-search-range-item-play')[0]!.trigger('click')
    expect(wrapper.emitted('toggleSearch')).toEqual([[1]])
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('stops the play click reaching an ancestor', async () => {
    const wrapper = mount(
      {
        components: { SdrSavedRangesList },
        data: () => ({ ancestorClicks: 0, ranges: RANGES }),
        template: `<div @click="ancestorClicks++"><SdrSavedRangesList :expanded="true" :ranges="ranges"
          :selected-range-id="null" :disabled="false" :is-range-searching="() => false" /></div>`,
      },
      { attachTo: document.body },
    )
    await wrapper.find('.sdr-search-range-item-play').trigger('click')
    expect((wrapper.vm as unknown as { ancestorClicks: number }).ancestorClicks).toBe(0)
  })

  it('shows Stop search on the range being swept and Start search on the rest', () => {
    const playButtons = mountList({ searchingRangeId: 2 }).findAll('.sdr-search-range-item-play')
    expect(playButtons[0]!.attributes('aria-label')).toBe('Start search')
    expect(playButtons[0]!.attributes('title')).toBe('Start search')
    expect(playButtons[0]!.classes()).not.toContain('sdr-search-range-item-play--active')
    expect(playButtons[1]!.attributes('aria-label')).toBe('Stop search')
    expect(playButtons[1]!.attributes('title')).toBe('Stop search')
    expect(playButtons[1]!.classes()).toContain('sdr-search-range-item-play--active')
    expect(playButtons[1]!.find('rect').exists()).toBe(true)
  })

  it('disables both buttons on every row when disabled', () => {
    const wrapper = mountList({ disabled: true })
    const buttons = wrapper.findAll('.sdr-search-range-item button')
    expect(buttons).toHaveLength(4)
    expect(buttons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})

describe('SdrSavedRangesList — empty', () => {
  it('points to Frequency Manager instead of an empty list', () => {
    const wrapper = mountList({ ranges: [] })
    expect(wrapper.find('.sdr-search-range-list').exists()).toBe(false)
    expect(wrapper.find('.sdr-scan-subsection-label').text()).toBe(
      'No ranges defined — add some in Frequency Manager.',
    )
  })
})

describe('SdrSavedRangesList — accessibility', () => {
  it('has no axe violations with ranges, while searching, and empty', async () => {
    expect(await axe(mountList().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountList({ searchingRangeId: 1 }).html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountList({ ranges: [] }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
