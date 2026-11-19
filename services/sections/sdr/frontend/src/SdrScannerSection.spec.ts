import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrScannerSection from './SdrScannerSection.vue'
import type { SdrFrequencyGroup } from './stores/sdr'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const GROUPS: SdrFrequencyGroup[] = [
  { id: 3, name: 'Airband', slug: 'airband', color: '#fff', sort_order: 0 },
  { id: 7, name: 'Marine', slug: 'marine', color: '#fff', sort_order: 1 },
]

interface ScannerProps {
  expanded?: boolean
  groups?: SdrFrequencyGroup[]
  allGroupsSelected?: boolean
  selectedGroupIds?: number[]
  scanActive?: boolean
  scanLocked?: boolean
  disabled?: boolean
}

function mountScanner(props: ScannerProps = {}) {
  return mount(SdrScannerSection, {
    props: {
      expanded: props.expanded ?? true,
      groups: props.groups ?? GROUPS,
      allGroupsSelected: props.allGroupsSelected ?? true,
      selectedGroupIds: props.selectedGroupIds ?? [],
      scanActive: props.scanActive ?? false,
      scanLocked: props.scanLocked ?? false,
      disabled: props.disabled ?? false,
    },
    attachTo: document.body,
  })
}

const chips = (wrapper: ReturnType<typeof mountScanner>) =>
  wrapper.findAll('.sdr-scan-groups-row button')
const isChipActive = (chip: ReturnType<typeof chips>[number]) => chip.classes('base-chip--active')

describe('SdrScannerSection — accordion', () => {
  it('is a SCANNER accordion controlling its body, and emits update:expanded', async () => {
    const wrapper = mountScanner({ expanded: false })
    const toggle = wrapper.find('.base-accordion-toggle')
    expect(toggle.text()).toContain('SCANNER')
    expect(toggle.attributes('aria-controls')).toBe('sdr-scanner-section')
    await toggle.trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[true]])
  })

  it('shows the scan state in the bar: hidden, scanning, then paused', () => {
    const stoppedRow = mountScanner().find('.sdr-scan-state-row')
    expect((stoppedRow.element as HTMLElement).style.display).toBe('none')
    expect(mountScanner({ scanActive: true }).find('.sdr-scan-state-label').text()).toBe('SCANNING')
    expect(
      mountScanner({ scanActive: true, scanLocked: true }).find('.sdr-scan-state-label').text(),
    ).toBe('SCANNING PAUSED')
  })
})

describe('SdrScannerSection — group chips', () => {
  it('renders All followed by one chip per group', () => {
    expect(chips(mountScanner()).map((chip) => chip.text())).toEqual(['All', 'Airband', 'Marine'])
  })

  it('activates only All while all groups are selected, even if ids are listed', () => {
    const wrapper = mountScanner({ allGroupsSelected: true, selectedGroupIds: [3] })
    expect(chips(wrapper).map(isChipActive)).toEqual([true, false, false])
  })

  it('activates the selected groups and not All otherwise', () => {
    const wrapper = mountScanner({ allGroupsSelected: false, selectedGroupIds: [7] })
    expect(chips(wrapper).map(isChipActive)).toEqual([false, false, true])
  })

  it('emits toggleAll and toggleGroup with the group id', async () => {
    const wrapper = mountScanner()
    await chips(wrapper)[0]!.trigger('click')
    await chips(wrapper)[2]!.trigger('click')
    expect(wrapper.emitted('toggleAll')).toHaveLength(1)
    expect(wrapper.emitted('toggleGroup')).toEqual([[7]])
  })

  it('renders only All when there are no groups', () => {
    expect(chips(mountScanner({ groups: [] })).map((chip) => chip.text())).toEqual(['All'])
  })
})

describe('SdrScannerSection — start/stop', () => {
  it('names the button by the scan state and emits toggleScan', async () => {
    const wrapper = mountScanner()
    const playButton = wrapper.find('.sdr-search-adhoc-play')
    expect(playButton.attributes('aria-label')).toBe('Start scan')
    await playButton.trigger('click')
    expect(wrapper.emitted('toggleScan')).toHaveLength(1)
    expect(
      mountScanner({ scanActive: true }).find('.sdr-search-adhoc-play').attributes('aria-label'),
    ).toBe('Stop scan')
  })

  it('disables every chip and the button when disabled', () => {
    const wrapper = mountScanner({ disabled: true })
    const buttons = [...chips(wrapper), wrapper.find('.sdr-search-adhoc-play')]
    expect(buttons.every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})

describe('SdrScannerSection — accessibility', () => {
  it('has no axe violations stopped and scanning', async () => {
    expect(await axe(mountScanner().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(
      await axe(
        mountScanner({ scanActive: true, allGroupsSelected: false, selectedGroupIds: [3] }).html(),
        AXE_OPTIONS,
      ),
    ).toHaveNoViolations()
  })
})
