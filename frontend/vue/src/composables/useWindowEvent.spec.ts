import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type PropType } from 'vue'
import { useWindowEvent } from './useWindowEvent'

// A single reusable harness so the whole file declares just one component
// (keeps eslint's vue/one-component-per-file happy). It wires the composable
// from props so each test can pass a different event name / handler / options.
const WindowEventHarness = defineComponent({
  props: {
    eventName: { type: String, required: true },
    handler: { type: Function as PropType<(event: Event) => void>, required: true },
    options: { type: Object as PropType<AddEventListenerOptions>, default: undefined },
  },
  setup(props) {
    useWindowEvent(props.eventName, props.handler, props.options)
    return () => h('div')
  },
})

describe('useWindowEvent', () => {
  it('adds the listener on mount and removes it on unmount', () => {
    const handler = vi.fn()
    const wrapper = mount(WindowEventHarness, { props: { eventName: 'resize', handler } })

    window.dispatchEvent(new Event('resize'))
    expect(handler).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    window.dispatchEvent(new Event('resize'))
    expect(handler).toHaveBeenCalledTimes(1) // listener removed on unmount
  })

  it('forwards addEventListener options so the same options remove the listener', () => {
    const handler = vi.fn()
    const options: AddEventListenerOptions = { capture: true }
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const wrapper = mount(WindowEventHarness, { props: { eventName: 'scroll', handler, options } })
    expect(addSpy).toHaveBeenCalledWith('scroll', handler, options)

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('scroll', handler, options)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
