import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type PropType } from 'vue'
import { useDocumentEvent } from './useDocumentEvent'

// A single reusable harness so the whole file declares just one component
// (keeps eslint's vue/one-component-per-file happy). It wires the composable
// from props so each test can pass a different event name / handler / options.
const DocumentEventHarness = defineComponent({
  props: {
    eventName: { type: String, required: true },
    handler: { type: Function as PropType<(event: Event) => void>, required: true },
    options: { type: Object as PropType<AddEventListenerOptions>, default: undefined },
  },
  setup(props) {
    useDocumentEvent(props.eventName, props.handler, props.options)
    return () => h('div')
  },
})

describe('useDocumentEvent', () => {
  it('adds the listener on mount and removes it on unmount', () => {
    const handler = vi.fn()
    const wrapper = mount(DocumentEventHarness, {
      props: { eventName: 'sentinel:test-event', handler },
    })

    document.dispatchEvent(new CustomEvent('sentinel:test-event'))
    expect(handler).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    document.dispatchEvent(new CustomEvent('sentinel:test-event'))
    expect(handler).toHaveBeenCalledTimes(1) // listener removed on unmount
  })

  it('calls add/removeEventListener with only two arguments when no options are given', () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const wrapper = mount(DocumentEventHarness, {
      props: { eventName: 'sentinel:no-options-event', handler },
    })
    expect(addSpy).toHaveBeenCalledWith('sentinel:no-options-event', handler)

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('sentinel:no-options-event', handler)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('forwards addEventListener options so the same options remove the listener', () => {
    const handler = vi.fn()
    const options: AddEventListenerOptions = { capture: true }
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const wrapper = mount(DocumentEventHarness, {
      props: { eventName: 'scroll', handler, options },
    })
    expect(addSpy).toHaveBeenCalledWith('scroll', handler, options)

    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('scroll', handler, options)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
