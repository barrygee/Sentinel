import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import TrackingPanel from './TrackingPanel.vue'
import { useTrackingStore, type TrackingField } from '@/stores/tracking'

function fieldsWithEverything(): TrackingField[] {
  return [
    { label: 'ALT', value: '35000' },
    { label: 'GS', value: '450' },
    { label: 'REG', value: 'G-ABCD' },
    { label: 'CATEGORY', value: 'Heavy' },
    { label: 'EMRG', value: 'HIJACK', emrg: true },
    // A label that matches neither known group — must fall through into AIRCRAFT.
    { label: 'OPERATOR', value: 'ACME AIR' },
  ]
}

describe('TrackingPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the empty state when nothing is tracked', () => {
    const wrapper = mount(TrackingPanel)
    expect(wrapper.find('#msb-tracking-empty').text()).toBe('No tracked items')
    expect(wrapper.findAll('.tracking-card')).toHaveLength(0)
  })

  it('renders a card per tracked item with its domain and name', () => {
    const store = useTrackingStore()
    store.register({ id: 'a1', name: 'BAW123', domain: 'air', fields: fieldsWithEverything() })
    const wrapper = mount(TrackingPanel)

    const cards = wrapper.findAll('.tracking-card')
    expect(cards).toHaveLength(1)
    expect(wrapper.find('.tracking-card-domain').text()).toBe('AIR')
    expect(wrapper.find('.tracking-card-name').text()).toBe('BAW123')
    expect(wrapper.find('#msb-tracking-empty').exists()).toBe(false)
  })

  it('groups fields into FLIGHT DATA and AIRCRAFT DATA, appending unknown labels to AIRCRAFT', () => {
    const store = useTrackingStore()
    store.register({ id: 'a1', name: 'BAW123', domain: 'air', fields: fieldsWithEverything() })
    const wrapper = mount(TrackingPanel)

    const sectionTitles = wrapper.findAll('.sfr-acc-section-title').map((node) => node.text())
    expect(sectionTitles).toEqual(['FLIGHT DATA', 'AIRCRAFT DATA'])

    const sections = wrapper.findAll('.sfr-acc-section')
    const flightLabels = sections[0]!.findAll('.sfr-acc-cell-label').map((node) => node.text())
    const aircraftLabels = sections[1]!.findAll('.sfr-acc-cell-label').map((node) => node.text())
    expect(flightLabels).toEqual(['ALT', 'GS'])
    // Known aircraft labels in declared order, then the unknown OPERATOR appended.
    expect(aircraftLabels).toEqual(['REG', 'CATEGORY', 'EMRG', 'OPERATOR'])
  })

  it('marks the CATEGORY cell wide and the EMRG cell as an emergency', () => {
    const store = useTrackingStore()
    store.register({ id: 'a1', name: 'BAW123', domain: 'air', fields: fieldsWithEverything() })
    const wrapper = mount(TrackingPanel)

    const cells = wrapper.findAll('.sfr-acc-cell')
    const categoryCell = cells.find(
      (cell) => cell.find('.sfr-acc-cell-label').text() === 'CATEGORY',
    )!
    expect(categoryCell.classes()).toContain('sfr-acc-cell--wide')

    const emrgValue = wrapper.find('.sfr-acc-cell-value--emrg')
    expect(emrgValue.exists()).toBe(true)
    expect(emrgValue.text()).toBe('HIJACK')
  })

  it('hides a section that has no cells', () => {
    const store = useTrackingStore()
    // Only a flight field → the AIRCRAFT DATA section has no cells and is omitted.
    store.register({
      id: 'a1',
      name: 'BAW123',
      domain: 'air',
      fields: [{ label: 'ALT', value: '1' }],
    })
    const wrapper = mount(TrackingPanel)

    const sectionTitles = wrapper.findAll('.sfr-acc-section-title').map((node) => node.text())
    expect(sectionTitles).toEqual(['FLIGHT DATA'])
  })

  it('applies the read-only class to items that are not live', () => {
    const store = useTrackingStore()
    store.register({
      id: 'a1',
      name: 'LIVE',
      domain: 'air',
      fields: [{ label: 'ALT', value: '1' }],
    })
    // deactivate drops the live callback but keeps the item in localStorage, so it
    // re-appears as a read-only card.
    store.deactivate('a1')
    const wrapper = mount(TrackingPanel)

    const card = wrapper.find('.tracking-card')
    expect(card.classes()).toContain('tracking-card-readonly')
  })

  it('untracks an item when its close button is clicked', async () => {
    const store = useTrackingStore()
    const onUntrack = vi.fn()
    store.register({
      id: 'a1',
      name: 'BAW123',
      domain: 'air',
      fields: [{ label: 'ALT', value: '1' }],
      onUntrack,
    })
    const wrapper = mount(TrackingPanel)

    await wrapper.find('.tracking-card-close').trigger('click')
    expect(onUntrack).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations', async () => {
    const store = useTrackingStore()
    store.register({ id: 'a1', name: 'BAW123', domain: 'air', fields: fieldsWithEverything() })
    const wrapper = mount(TrackingPanel)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
