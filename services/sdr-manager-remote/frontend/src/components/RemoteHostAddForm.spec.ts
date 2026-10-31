import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostAddForm from './RemoteHostAddForm.vue'
import RemoteHostForm from './RemoteHostForm.vue'
import { onHostsChanged } from '../hostsChanged'

/**
 * `RemoteHostAddForm` — "+ ADD A NEW SENTINEL HOST": a blank host form that
 * announces the new host and closes once added, or just closes on cancel.
 */
describe('RemoteHostAddForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows a blank host form', () => {
    const wrapper = mount(RemoteHostAddForm)
    expect(wrapper.findComponent(RemoteHostForm).props('host')).toBeNull()
  })

  it('announces the new host and is done once it is added', () => {
    const changed = vi.fn()
    const stopListening = onHostsChanged(changed)
    const wrapper = mount(RemoteHostAddForm)
    wrapper.findComponent(RemoteHostForm).vm.$emit('save')
    expect(changed).toHaveBeenCalledOnce()
    expect(wrapper.emitted('done')).toHaveLength(1)
    stopListening()
  })

  it('is done, announcing nothing, when cancelled', () => {
    const changed = vi.fn()
    const stopListening = onHostsChanged(changed)
    const wrapper = mount(RemoteHostAddForm)
    wrapper.findComponent(RemoteHostForm).vm.$emit('cancel')
    expect(changed).not.toHaveBeenCalled()
    expect(wrapper.emitted('done')).toHaveLength(1)
    stopListening()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(RemoteHostAddForm, { attachTo: document.body })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
