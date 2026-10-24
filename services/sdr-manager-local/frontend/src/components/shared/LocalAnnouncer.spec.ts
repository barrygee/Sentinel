import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocalAnnouncer from './LocalAnnouncer.vue'

describe('LocalAnnouncer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is a polite live region that is empty until something is announced', () => {
    const wrapper = mount(LocalAnnouncer)
    const region = wrapper.get('[aria-live]')
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.text()).toBe('')
  })

  it('is visually hidden, so only screen readers get the sentence', () => {
    expect(mount(LocalAnnouncer).get('[aria-live]').classes()).toContain('sr-only')
  })

  it('reads out the sentence the store announces', async () => {
    const wrapper = mount(LocalAnnouncer)
    useLocalSdrStore().announce('Roof connected.')
    await flushPromises()
    expect(wrapper.get('[aria-live]').text()).toBe('Roof connected.')
  })

  it('replaces the previous sentence with the next one', async () => {
    const wrapper = mount(LocalAnnouncer)
    const store = useLocalSdrStore()
    store.announce('First.')
    await flushPromises()
    store.announce('Second.')
    await flushPromises()
    expect(wrapper.get('[aria-live]').text()).toBe('Second.')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LocalAnnouncer)
    useLocalSdrStore().announce('Saved Roof.')
    await flushPromises()
    await expectNoAxeViolations(wrapper)
  })
})
