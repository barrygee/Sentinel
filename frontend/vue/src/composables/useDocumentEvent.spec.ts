import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useDocumentEvent } from './useDocumentEvent'

describe('useDocumentEvent', () => {
  it('adds the listener on mount and removes it on unmount', () => {
    const handler = vi.fn()
    const Harness = defineComponent({
      setup() {
        useDocumentEvent('sentinel:test-event', handler)
        return () => h('div')
      },
    })

    const wrapper = mount(Harness)
    document.dispatchEvent(new CustomEvent('sentinel:test-event'))
    expect(handler).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    document.dispatchEvent(new CustomEvent('sentinel:test-event'))
    expect(handler).toHaveBeenCalledTimes(1) // listener removed on unmount
  })
})
