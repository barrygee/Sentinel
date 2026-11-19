import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingRowActions from './SdrRecordingRowActions.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountActions(props: { editing?: boolean; deleteArmed?: boolean } = {}) {
  return mount(SdrRecordingRowActions, {
    props: { editing: props.editing ?? false, deleteArmed: props.deleteArmed ?? false },
    attachTo: document.body,
  })
}

const names = (wrapper: ReturnType<typeof mountActions>) =>
  wrapper.findAll('button').map((button) => button.attributes('aria-label'))

describe('SdrRecordingRowActions — edit', () => {
  it('shows a named pencil with a tooltip below it', () => {
    const pencil = mountActions().find('.sdr-recording-edit')
    expect(pencil.attributes('aria-label')).toBe('Edit')
    expect(pencil.attributes('data-tooltip')).toBe('Edit')
    expect(pencil.classes()).toContain('ba-icon-action--tip-bottom')
  })

  it('turns the pencil accent only while editing', () => {
    expect(mountActions().find('.sdr-recording-edit').classes()).not.toContain(
      'sdr-recording-edit--active',
    )
    expect(mountActions({ editing: true }).find('.sdr-recording-edit').classes()).toContain(
      'sdr-recording-edit--active',
    )
  })

  it('emits toggleEdit from the pencil', async () => {
    const wrapper = mountActions()
    await wrapper.find('.sdr-recording-edit').trigger('click')
    expect(wrapper.emitted('toggleEdit')).toHaveLength(1)
  })
})

describe('SdrRecordingRowActions — delete', () => {
  it('shows only the bin while not armed', () => {
    expect(names(mountActions())).toEqual(['Edit', 'Delete'])
  })

  it('swaps the bin for confirm and cancel while armed', () => {
    const wrapper = mountActions({ deleteArmed: true })
    expect(names(wrapper)).toEqual(['Edit', 'Confirm delete', 'Cancel delete'])
    expect(wrapper.find('.sdr-recording-del--confirm').exists()).toBe(true)
    expect(wrapper.find('.sdr-recording-del--cancel').exists()).toBe(true)
  })

  it.each([
    ['Delete', false, 'armDelete'],
    ['Confirm delete', true, 'confirmDelete'],
    ['Cancel delete', true, 'cancelDelete'],
  ] as const)('"%s" emits %s and nothing else', async (label, deleteArmed, event) => {
    const wrapper = mountActions({ deleteArmed })
    await wrapper.find(`button[aria-label="${label}"]`).trigger('click')
    const emitted = Object.keys(wrapper.emitted()).filter((name) => name !== 'click')
    expect(emitted).toEqual([event])
  })

  it('keeps its clicks from reaching the row', async () => {
    const rowClicks: string[] = []
    const wrapper = mountActions({ deleteArmed: true })
    wrapper.element.parentElement!.addEventListener('click', () => rowClicks.push('row'))
    for (const button of wrapper.findAll('button')) await button.trigger('click')
    expect(rowClicks).toEqual([])
  })

  it('has no axe violations, armed or not, editing or not', async () => {
    expect(await axe(mountActions().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(
      await axe(mountActions({ editing: true, deleteArmed: true }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
  })
})
