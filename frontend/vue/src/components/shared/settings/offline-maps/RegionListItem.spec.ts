import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RegionListItem from './RegionListItem.vue'
import type { OfflineRegion } from '@/services/offlineMapsApi'

const BASE_REGION: OfflineRegion = {
  id: 'r1',
  label: 'Lake District',
  west: -3.2,
  south: 54.3,
  east: -2.9,
  north: 54.6,
  max_zoom: 12,
  include_basemap: true,
  include_terrain: true,
  status: 'complete',
  phase: null,
  bytes_done: 5_000_000,
  bytes_estimated: 5_000_000,
  tiles_estimated: 500,
  size_bytes: 5_000_000,
  error: null,
  created_at: Date.parse('2026-01-05T00:00:00Z'),
  completed_at: Date.parse('2026-01-05T00:05:00Z'),
}

function mountItem(region: Partial<OfflineRegion> = {}, confirming = false) {
  return mount(RegionListItem, {
    props: { region: { ...BASE_REGION, ...region }, confirming },
    attachTo: document.body,
  })
}

describe('RegionListItem', () => {
  it('shows zoom, contents and the completed size/date for a complete region', () => {
    const wrapper = mountItem()
    const expectedDate = new Date(BASE_REGION.created_at).toLocaleDateString()
    expect(wrapper.find('.oma-region-meta').text()).toBe(
      `z12 · basemap + terrain · 4.8 MB · ${expectedDate}`,
    )
  })

  it('falls back to 0 B for a complete region with a null size_bytes', () => {
    const wrapper = mountItem({ status: 'complete', size_bytes: null })
    expect(wrapper.find('.oma-region-meta').text()).toContain('0 B')
  })

  it('summarises contents as basemap-only, terrain-only, or neither', () => {
    expect(
      mountItem({ include_basemap: true, include_terrain: false }).find('.oma-region-meta').text(),
    ).toContain('basemap ·')
    expect(
      mountItem({ include_basemap: false, include_terrain: true }).find('.oma-region-meta').text(),
    ).toContain('terrain ·')
    expect(
      mountItem({ include_basemap: false, include_terrain: false }).find('.oma-region-meta').text(),
    ).toContain('no contents')
  })

  it.each([
    ['queued' as const, 'QUEUED'],
    ['running' as const, 'RUNNING'],
    ['failed' as const, 'Failed'],
    ['cancelled' as const, 'Cancelled'],
  ])('shows the %s status meta tail', (status, expectedTail) => {
    const wrapper = mountItem({ status, phase: null, error: null })
    expect(wrapper.find('.oma-region-meta').text()).toContain(expectedTail)
  })

  it('embeds DownloadProgress only while queued/running', () => {
    expect(mountItem({ status: 'queued' }).find('.oma-region-progress').exists()).toBe(true)
    expect(mountItem({ status: 'running' }).find('.oma-region-progress').exists()).toBe(true)
    expect(mountItem({ status: 'complete' }).find('.oma-region-progress').exists()).toBe(false)
    expect(mountItem({ status: 'failed' }).find('.oma-region-progress').exists()).toBe(false)
  })

  it('re-emits cancel-job from the embedded DownloadProgress while active', async () => {
    const wrapper = mountItem({ status: 'running' })
    await wrapper.find('.oma-region-progress button').trigger('click')
    expect(wrapper.emitted('cancel-job')).toHaveLength(1)
  })

  it('shows the failure text with role=alert only when it failed while this row was mounted', async () => {
    const wrapper = mountItem({ status: 'running', error: null })
    await wrapper.setProps({ region: { ...BASE_REGION, status: 'failed', error: 'Disk full.' } })
    const errorParagraph = wrapper.find('.oma-region-error')
    expect(errorParagraph.text()).toBe('Disk full.')
    expect(errorParagraph.attributes('role')).toBe('alert')
  })

  it('shows a failure that already existed before mount silently (no role=alert)', () => {
    const wrapper = mountItem({ status: 'failed', error: 'Disk full.' })
    const errorParagraph = wrapper.find('.oma-region-error')
    expect(errorParagraph.text()).toBe('Disk full.')
    expect(errorParagraph.attributes('role')).toBeUndefined()
  })

  it('shows no error paragraph for a failed region with no error message', () => {
    const wrapper = mountItem({ status: 'failed', error: null })
    expect(wrapper.find('.oma-region-error').exists()).toBe(false)
  })

  it('emits delete-request when the delete (×) button is clicked', async () => {
    const wrapper = mountItem({ status: 'complete' })
    await wrapper.find('.oma-region-delete').trigger('click')
    expect(wrapper.emitted('delete-request')).toHaveLength(1)
  })

  it('replaces the delete button with a YES/NO confirmation while confirming', () => {
    const wrapper = mountItem({ status: 'complete' }, true)
    expect(wrapper.find('.oma-region-delete').exists()).toBe(false)
    expect(wrapper.find('.oma-region-confirm').exists()).toBe(true)
  })

  it('moves focus to NO when confirmation opens', async () => {
    const wrapper = mountItem({ status: 'complete' }, false)
    await wrapper.setProps({ confirming: true })
    await wrapper.vm.$nextTick()
    const noButtonElement = wrapper.findAll('button').find((button) => button.text() === 'NO')!
    expect(noButtonElement.element).toBe(document.activeElement)
  })

  it('moves focus back to the delete button when confirmation is cancelled', async () => {
    const wrapper = mountItem({ status: 'complete' }, true)
    await wrapper.setProps({ confirming: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.oma-region-delete').element).toBe(document.activeElement)
  })

  it('emits delete-confirm/delete-cancel from YES/NO', async () => {
    const wrapper = mountItem({ status: 'complete' }, true)
    const buttons = wrapper.findAll('button')
    const yesButton = buttons.find((button) => button.text() === 'YES')!
    const noButton = buttons.find((button) => button.text() === 'NO')!
    await yesButton.trigger('click')
    expect(wrapper.emitted('delete-confirm')).toHaveLength(1)
    await noButton.trigger('click')
    expect(wrapper.emitted('delete-cancel')).toHaveLength(1)
  })

  it('emits select when the label button is clicked', async () => {
    const wrapper = mountItem()
    await wrapper.find('.oma-region-select').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('disables the select button while confirming delete', () => {
    const wrapper = mountItem({}, true)
    expect(wrapper.find('.oma-region-select').attributes('disabled')).toBeDefined()
  })

  it('focusSelectButton() (used by RegionList after a delete) focuses the select button', () => {
    const wrapper = mountItem()
    ;(wrapper.vm as unknown as { focusSelectButton: () => void }).focusSelectButton()
    expect(wrapper.find('.oma-region-select').element).toBe(document.activeElement)
  })

  it('has no accessibility violations, active or confirming', async () => {
    const active = mountItem({ status: 'running' })
    expect(
      await axe(active.html(), {
        rules: { region: { enabled: false }, listitem: { enabled: false } },
      }),
    ).toHaveNoViolations()
    const confirming = mountItem({ status: 'complete' }, true)
    expect(
      await axe(confirming.html(), {
        rules: { region: { enabled: false }, listitem: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
