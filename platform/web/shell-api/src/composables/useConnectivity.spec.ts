import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { useConnectivity } from './useConnectivity'
import { useAppStore } from '../stores/app'

function mountConnectivity(onModeChange?: (online: boolean) => void) {
  const Harness = defineComponent({
    setup() {
      useConnectivity(onModeChange)
      return () => h('div')
    },
  })
  return mount(Harness)
}

describe('useConnectivity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not fire on mount — the views already render the current mode', async () => {
    const onModeChange = vi.fn()
    const wrapper = mountConnectivity(onModeChange)
    await nextTick()
    expect(onModeChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reports false when the app switches to off grid', async () => {
    const app = useAppStore()
    const onModeChange = vi.fn()
    const wrapper = mountConnectivity(onModeChange)
    app.setConnectivityMode('offgrid')
    await nextTick()
    expect(onModeChange).toHaveBeenCalledOnce()
    expect(onModeChange).toHaveBeenCalledWith(false)
    wrapper.unmount()
  })

  it('reports true when the app switches back online', async () => {
    const app = useAppStore()
    app.setConnectivityMode('offgrid')
    const onModeChange = vi.fn()
    const wrapper = mountConnectivity(onModeChange)
    app.setConnectivityMode('online')
    await nextTick()
    expect(onModeChange).toHaveBeenCalledOnce()
    expect(onModeChange).toHaveBeenCalledWith(true)
    wrapper.unmount()
  })

  it('does not fire when the mode is set to what it already is', async () => {
    const app = useAppStore()
    const onModeChange = vi.fn()
    const wrapper = mountConnectivity(onModeChange)
    app.setConnectivityMode('online')
    await nextTick()
    expect(onModeChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('tolerates a caller with no callback', async () => {
    const app = useAppStore()
    const wrapper = mountConnectivity()
    app.setConnectivityMode('offgrid')
    await nextTick()
    expect(app.isOnline).toBe(false)
    wrapper.unmount()
  })

  it('stops reporting once the component unmounts', async () => {
    const app = useAppStore()
    const onModeChange = vi.fn()
    const wrapper = mountConnectivity(onModeChange)
    wrapper.unmount()
    app.setConnectivityMode('offgrid')
    await nextTick()
    expect(onModeChange).not.toHaveBeenCalled()
  })
})
