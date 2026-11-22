import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplayJumpTo from './ReplayJumpTo.vue'

enableAutoUnmount(afterEach)

const START = Date.UTC(2026, 10, 7, 0, 0)
const END = Date.UTC(2026, 10, 14, 0, 0)
const MOMENT = Date.UTC(2026, 10, 10, 13, 42, 30)

function mountJump(momentMs = MOMENT) {
  return mount(ReplayJumpTo, {
    props: { rangeStart: START, rangeEnd: END, momentMs },
    attachTo: document.body,
  })
}

describe('ReplayJumpTo', () => {
  it('is the app text field (UTC datetime) bounded by the window, with a GO button', () => {
    const wrapper = mountJump()
    const input = wrapper.get('input')
    expect(input.attributes('type')).toBe('datetime-local')
    expect(wrapper.get(`label[for="${input.attributes('id')}"]`).text()).toBe('GO TO (UTC)')
    expect(input.attributes('min')).toBe('2026-11-07T00:00')
    expect(input.attributes('max')).toBe('2026-11-14T00:00')
    expect((input.element as HTMLInputElement).value).toBe('2026-11-10T13:42')
    expect(wrapper.get('button').attributes('type')).toBe('submit')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Go to this date and time')
  })

  it('emits the typed moment on GO', async () => {
    const wrapper = mountJump()
    await wrapper.get('input').setValue('2026-11-08T06:30')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('seek')).toEqual([[Date.UTC(2026, 10, 8, 6, 30)]])
  })

  it('does nothing on GO with the field cleared', async () => {
    const wrapper = mountJump()
    await wrapper.get('input').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('seek')).toBeUndefined()
  })

  it('follows the moment to each new minute', async () => {
    const wrapper = mountJump()
    await wrapper.setProps({ momentMs: MOMENT + 20_000 })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-10T13:42')
    await wrapper.setProps({ momentMs: Date.UTC(2026, 10, 11, 9, 5) })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-11T09:05')
  })

  it('does not overwrite a date being typed, until it is used', async () => {
    const wrapper = mountJump()
    await wrapper.get('input').setValue('2026-11-08T06:30')
    await wrapper.setProps({ momentMs: Date.UTC(2026, 10, 12, 1, 0) })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-08T06:30')
    await wrapper.get('form').trigger('submit')
    await wrapper.setProps({ momentMs: Date.UTC(2026, 10, 12, 2, 0) })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('2026-11-12T02:00')
  })

  it('has no axe violations', async () => {
    expect(
      await axe(mountJump().html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
