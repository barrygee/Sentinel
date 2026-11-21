import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PlaybackJumpTo from './PlaybackJumpTo.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }
const START = Date.UTC(2026, 10, 7, 0, 0)
const END = Date.UTC(2026, 10, 14, 0, 0)
const VALUE = Date.UTC(2026, 10, 10, 13, 42, 30)

function mountJump(value = VALUE) {
  return mount(PlaybackJumpTo, {
    props: { rangeStart: START, rangeEnd: END, value },
    attachTo: document.body,
  })
}

describe('PlaybackJumpTo', () => {
  it('labels a UTC datetime input bounded by the window', () => {
    const wrapper = mountJump()
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('datetime-local')
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(wrapper.get('label').text()).toBe('GO TO (UTC)')
    expect(input.attributes('min')).toBe('2026-11-07T00:00')
    expect(input.attributes('max')).toBe('2026-11-14T00:00')
    expect((input.element as HTMLInputElement).value).toBe('2026-11-10T13:42')
  })

  it('emits the typed moment on GO', async () => {
    const wrapper = mountJump()
    await wrapper.get('input').setValue('2026-11-08T06:30')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('seek')).toEqual([[Date.UTC(2026, 10, 8, 6, 30)]])
    expect(wrapper.get('button').attributes('type')).toBe('submit')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Go to this date and time')
  })

  it('does nothing on GO with the field cleared', async () => {
    const wrapper = mountJump()
    await wrapper.get('input').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('seek')).toBeUndefined()
  })

  it('follows the cursor to a new minute while the field is not focused', async () => {
    const wrapper = mountJump()
    await wrapper.setProps({ value: VALUE + 20_000 }) // same minute: unchanged
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-10T13:42')
    await wrapper.setProps({ value: Date.UTC(2026, 10, 11, 9, 5) })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-11T09:05')
  })

  it('does not overwrite what the operator is typing', async () => {
    const wrapper = mountJump()
    const input = wrapper.get('input')
    ;(input.element as HTMLInputElement).focus()
    await input.setValue('2026-11-08T06:30')
    await wrapper.setProps({ value: Date.UTC(2026, 10, 12, 1, 0) })
    expect((input.element as HTMLInputElement).value).toBe('2026-11-08T06:30')
  })

  it('has no axe violations', async () => {
    expect(await axe(mountJump().html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
