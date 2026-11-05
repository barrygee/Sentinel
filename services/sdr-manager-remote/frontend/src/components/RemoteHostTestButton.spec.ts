import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostTestButton, { type HostTestState } from './RemoteHostTestButton.vue'

function mountButton(state: HostTestState) {
  return mount(RemoteHostTestButton, { props: { state } })
}

describe('RemoteHostTestButton', () => {
  it.each([
    ['idle', 'TEST CONNECTION'],
    ['connecting', 'CONNECTING'],
    ['connected', 'SUCCESSFULLY CONNECTED'],
    ['failed', 'UNSUCCESSFUL'],
  ] as const)('reads correctly when %s', (state, label) => {
    expect(mountButton(state).get('button').text()).toBe(label)
  })

  it('can be pressed only when idle', async () => {
    const idle = mountButton('idle')
    await idle.get('button').trigger('click')
    expect(idle.emitted('test')).toHaveLength(1)
  })

  it.each(['connecting', 'connected', 'failed'] as const)('can’t be pressed when %s', (state) => {
    const button = mountButton(state).get('button')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it.each(['connected', 'failed'] as const)('marks the %s state for its colour', (state) => {
    expect(mountButton(state).get('button').classes()).toContain(`remote-host-test-btn--${state}`)
  })

  it('keeps a result undimmed, so it stays readable', () => {
    expect(mountButton('connected').get('button').attributes('style')).toContain(
      '--ba-disabled-opacity: 1',
    )
    expect(mountButton('idle').get('button').attributes('style') ?? '').not.toContain(
      '--ba-disabled-opacity',
    )
  })

  it.each(['idle', 'failed'] as const)('has no accessibility violations when %s', async (state) => {
    const wrapper = mount(RemoteHostTestButton, { props: { state }, attachTo: document.body })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })

  it('announces each change to screen readers', () => {
    expect(mountButton('failed').attributes('aria-live')).toBe('polite')
  })
})
