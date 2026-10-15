import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import DocsLiveStatus from './DocsLiveStatus.vue'
import { useDocsStore } from './docsStore'

describe('DocsLiveStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is one polite status region, visually hidden', () => {
    const wrapper = mount(DocsLiveStatus)
    const region = wrapper.get('[role="status"]')
    expect(region.attributes('aria-live')).toBe('polite')
    expect(region.classes()).toContain('sr-only')
    expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
  })

  it('is empty until something is announced', () => {
    const wrapper = mount(DocsLiveStatus)
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })

  it('speaks what the store announces', async () => {
    vi.useFakeTimers()
    const wrapper = mount(DocsLiveStatus)
    useDocsStore().announce('3 results')
    await vi.advanceTimersByTimeAsync(60)
    expect(wrapper.get('[role="status"]').text()).toBe('3 results')
  })

  it('clears first so repeating the same message is a change a screen reader notices', async () => {
    vi.useFakeTimers()
    const wrapper = mount(DocsLiveStatus)
    const store = useDocsStore()
    store.announce('Copied to clipboard')
    await vi.advanceTimersByTimeAsync(60)
    store.announce('Copied to clipboard')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[role="status"]').text()).toBe('')
    await vi.advanceTimersByTimeAsync(60)
    expect(wrapper.get('[role="status"]').text()).toBe('Copied to clipboard')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(DocsLiveStatus)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
