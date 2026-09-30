import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { nextTick } from 'vue'
import RegionList from './RegionList.vue'
import type { OfflineRegion } from '@/services/offlineMapsApi'

function region(overrides: Partial<OfflineRegion>): OfflineRegion {
  return {
    id: 'r1',
    label: 'Region',
    west: -1,
    south: 50,
    east: 1,
    north: 52,
    max_zoom: 12,
    include_basemap: true,
    include_terrain: true,
    status: 'complete',
    phase: null,
    bytes_done: 100,
    bytes_estimated: 100,
    tiles_estimated: 10,
    size_bytes: 100,
    error: null,
    created_at: 1,
    completed_at: 2,
    ...overrides,
  }
}

function mountList(regions: OfflineRegion[], totalBytes = 0) {
  return mount(RegionList, { props: { regions, totalBytes }, attachTo: document.body })
}

describe('RegionList', () => {
  it('shows an empty-state message with no regions', () => {
    const wrapper = mountList([])
    expect(wrapper.find('.oma-region-list-empty').exists()).toBe(true)
    expect(wrapper.findAll('li')).toHaveLength(0)
    // Nothing downloaded: the heading carries no total.
    expect(wrapper.find('.oma-region-list-heading').text()).toBe('Downloaded Areas')
  })

  it('renders one row per region and the total downloaded size in the heading', () => {
    const wrapper = mountList(
      [region({ id: 'a', label: 'A' }), region({ id: 'b', label: 'B' })],
      2 * 1024 * 1024,
    )
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.find('.oma-region-list-heading').text()).toBe('Downloaded Areas (2.0 MB)')
    expect(wrapper.text()).not.toContain('Total downloaded')
  })

  it('re-emits select-region with the full region object', async () => {
    const target = region({ id: 'a', label: 'A' })
    const wrapper = mountList([target])
    await wrapper.find('.oma-region-select').trigger('click')
    expect(wrapper.emitted('select-region')).toEqual([[target]])
  })

  it('re-emits delete-region for a cancel-job on an active row', async () => {
    const wrapper = mountList([region({ id: 'a', status: 'running' })])
    await wrapper.find('.oma-region-progress button').trigger('click')
    expect(wrapper.emitted('delete-region')).toEqual([['a']])
  })

  it('opens exactly one row confirmation at a time', async () => {
    const wrapper = mountList([region({ id: 'a', label: 'A' }), region({ id: 'b', label: 'B' })])
    const deleteButtons = wrapper.findAll('.oma-region-delete')
    await deleteButtons[0]!.trigger('click')
    expect(wrapper.findAll('.oma-region-confirm')).toHaveLength(1)
    // Only row a shows the confirmation; row b still shows its delete button.
    expect(wrapper.findAll('.oma-region-delete')).toHaveLength(1)
  })

  it('emits delete-region on confirm and closes the confirmation', async () => {
    const wrapper = mountList([region({ id: 'a', label: 'A' })])
    await wrapper.find('.oma-region-delete').trigger('click')
    const yesButton = wrapper.findAll('button').find((button) => button.text() === 'YES')!
    await yesButton.trigger('click')
    expect(wrapper.emitted('delete-region')).toEqual([['a']])
  })

  it('cancelling a confirmation emits nothing and restores the delete button', async () => {
    const wrapper = mountList([region({ id: 'a', label: 'A' })])
    await wrapper.find('.oma-region-delete').trigger('click')
    const noButton = wrapper.findAll('button').find((button) => button.text() === 'NO')!
    await noButton.trigger('click')
    expect(wrapper.emitted('delete-region')).toBeUndefined()
    expect(wrapper.find('.oma-region-delete').exists()).toBe(true)
  })

  it('moves focus to the row that now occupies a deleted (non-last) row position', async () => {
    const wrapper = mountList([
      region({ id: 'a', label: 'A' }),
      region({ id: 'b', label: 'B' }),
      region({ id: 'c', label: 'C' }),
    ])
    await wrapper.findAll('.oma-region-delete')[0]!.trigger('click') // confirm on row a (index 0)
    const yesButton = wrapper.findAll('button').find((button) => button.text() === 'YES')!
    await yesButton.trigger('click')
    // Simulate the parent's store removing the region, causing `regions` to shrink.
    await wrapper.setProps({
      regions: [region({ id: 'b', label: 'B' }), region({ id: 'c', label: 'C' })],
    })
    await nextTick()
    await nextTick()
    const rowBSelectButton = wrapper.findAll('.oma-region-select')[0]!
    expect(rowBSelectButton.element).toBe(document.activeElement)
  })

  it('does not act on a pending delete while the list has not shrunk yet (e.g. a poll tick adding a row first)', async () => {
    const wrapper = mountList([region({ id: 'a', label: 'A' }), region({ id: 'b', label: 'B' })])
    await wrapper.findAll('.oma-region-delete')[0]!.trigger('click') // confirm on row a
    const yesButton = wrapper.findAll('button').find((button) => button.text() === 'YES')!
    await yesButton.trigger('click')
    // Confirming (with the delete not actually landed yet) returns focus to
    // row a's own delete button, per RegionListItem's own cancel-focus
    // behaviour — capture that as the baseline the "list grew" branch must
    // leave alone.
    const focusAfterConfirm = document.activeElement
    // The regions array grows (not shrinks) before the delete has landed —
    // the list's own pending-delete focus handling must be a no-op here,
    // leaving focus exactly where RegionListItem put it.
    await wrapper.setProps({
      regions: [
        region({ id: 'a', label: 'A' }),
        region({ id: 'b', label: 'B' }),
        region({ id: 'c', label: 'C' }),
      ],
    })
    await nextTick()
    expect(document.activeElement).toBe(focusAfterConfirm)
    expect(wrapper.find('.oma-region-list-heading').element).not.toBe(document.activeElement)
  })

  it('moves focus to the heading when deleting the last remaining row', async () => {
    const wrapper = mountList([region({ id: 'a', label: 'A' })])
    await wrapper.find('.oma-region-delete').trigger('click')
    const yesButton = wrapper.findAll('button').find((button) => button.text() === 'YES')!
    await yesButton.trigger('click')
    await wrapper.setProps({ regions: [] })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.oma-region-list-heading').element).toBe(document.activeElement)
  })

  it('does not move focus when regions changes for a reason other than a pending delete', async () => {
    const wrapper = mountList([region({ id: 'a', label: 'A' })])
    const heading = wrapper.find('.oma-region-list-heading').element as HTMLElement
    heading.focus()
    await wrapper.setProps({
      regions: [region({ id: 'a', label: 'A' }), region({ id: 'b', label: 'B' })],
    })
    await nextTick()
    // A region being ADDED (list growing) must not trigger the delete-focus logic.
    expect(document.activeElement).toBe(heading)
  })

  it('has no accessibility violations, empty or populated', async () => {
    const empty = mountList([])
    expect(await axe(empty.html(), { rules: { region: { enabled: false } } })).toHaveNoViolations()
    const populated = mountList([region({ id: 'a', status: 'running' }), region({ id: 'b' })])
    expect(
      await axe(populated.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
