import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrFrequencyEntry from './SdrFrequencyEntry.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

interface EntryProps {
  modelValue?: string
  disabled?: boolean
  readonly?: boolean
  unsavedHz?: number | null
  label?: string
}

function mountEntry(props: EntryProps = {}) {
  return mount(SdrFrequencyEntry, {
    props: {
      modelValue: props.modelValue ?? '100.000000',
      disabled: props.disabled ?? false,
      readonly: props.readonly ?? false,
      unsavedHz: props.unsavedHz === undefined ? null : props.unsavedHz,
      label: props.label ?? '',
    },
    attachTo: document.body,
  })
}

describe('SdrFrequencyEntry — the input', () => {
  it('shows the model text in a named input', () => {
    const input = mountEntry({ modelValue: '145.500000' }).find('input')
    expect((input.element as HTMLInputElement).value).toBe('145.500000')
    expect(input.attributes('aria-label')).toBe('Tuned frequency in MHz')
  })

  it('emits update:modelValue as the operator types', async () => {
    const wrapper = mountEntry()
    await wrapper.find('input').setValue('118.1')
    expect(wrapper.emitted('update:modelValue')).toEqual([['118.1']])
  })

  it('emits tune on Enter and format on blur', async () => {
    const wrapper = mountEntry()
    await wrapper.find('input').trigger('keydown', { key: 'Enter' })
    await wrapper.find('input').trigger('blur')
    expect(wrapper.emitted('tune')).toHaveLength(1)
    expect(wrapper.emitted('format')).toHaveLength(1)
  })

  it('does not tune on other keys', async () => {
    const wrapper = mountEntry()
    await wrapper.find('input').trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('tune')).toBeUndefined()
  })

  it('forwards the wheel event and cancels the page scroll', async () => {
    const wrapper = mountEntry()
    const wheelEvent = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    wrapper.find('input').element.dispatchEvent(wheelEvent)
    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(wrapper.emitted('wheel')).toEqual([[wheelEvent]])
  })

  it('reflects disabled and readonly', () => {
    const locked = mountEntry({ disabled: true, readonly: true }).find('input')
    expect(locked.attributes('disabled')).toBeDefined()
    expect(locked.attributes('readonly')).toBeDefined()
    const open = mountEntry().find('input')
    expect(open.attributes('disabled')).toBeUndefined()
    expect(open.attributes('readonly')).toBeUndefined()
  })

  it('exposes the input element for the digit wheel', () => {
    const wrapper = mountEntry()
    expect((wrapper.vm as unknown as { inputElement: HTMLInputElement }).inputElement).toBe(
      wrapper.find('input').element,
    )
  })
})

describe('SdrFrequencyEntry — add button and name', () => {
  it('hides the add button when nothing unsaved is typed', () => {
    expect(mountEntry({ unsavedHz: null }).find('button').exists()).toBe(false)
  })

  it('shows the add button for an unsaved frequency and emits add with its Hz', async () => {
    const wrapper = mountEntry({ unsavedHz: 145_500_000 })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('add')).toEqual([[145_500_000]])
  })

  it('shows the add button for a 0 Hz value (null is the only "none")', () => {
    expect(mountEntry({ unsavedHz: 0 }).find('button').exists()).toBe(true)
  })

  it('shows the saved name only when there is one', () => {
    expect(mountEntry({ label: '' }).find('.sdr-freq-name').exists()).toBe(false)
    expect(mountEntry({ label: 'Tower' }).find('.sdr-freq-name').text()).toBe('Tower')
  })
})

describe('SdrFrequencyEntry — accessibility', () => {
  it('has no axe violations with and without the add button and name', async () => {
    expect(await axe(mountEntry().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(
      await axe(mountEntry({ unsavedHz: 1, label: 'Tower' }).html(), AXE_OPTIONS),
    ).toHaveNoViolations()
  })
})
