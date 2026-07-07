import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type PropType } from 'vue'
import { useSidebarPaneTarget } from './useSidebarPaneTarget'
import { SIDEBAR_PANE_IDS, type SidebarPaneId } from '@/constants/sidebarPanes'

// Single reusable harness (keeps eslint's vue/one-component-per-file happy):
// exposes `ready` so each test can assert on it.
const SidebarPaneTargetHarness = defineComponent({
  props: {
    paneId: { type: String as PropType<SidebarPaneId>, required: true },
  },
  setup(props, { expose }) {
    const { ready } = useSidebarPaneTarget(props.paneId)
    expose({ ready })
    return () => h('div')
  },
})

function mountHarness(paneId: SidebarPaneId) {
  return mount(SidebarPaneTargetHarness, { props: { paneId } })
}

function readyOf(wrapper: ReturnType<typeof mountHarness>): boolean {
  return (wrapper.vm as unknown as { ready: boolean }).ready
}

describe('useSidebarPaneTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves ready synchronously when the pane element already exists', () => {
    const pane = document.createElement('div')
    pane.id = SIDEBAR_PANE_IDS.search
    document.body.appendChild(pane)

    const wrapper = mountHarness('search')
    expect(readyOf(wrapper)).toBe(true)
  })

  it('polls with requestAnimationFrame until the pane element appears', () => {
    const queued: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.push(cb)
      return queued.length
    })

    const wrapper = mountHarness('playback')
    expect(readyOf(wrapper)).toBe(false)

    // First frame: pane still absent → reschedules another frame.
    queued.shift()!(0)
    expect(readyOf(wrapper)).toBe(false)
    expect(queued).toHaveLength(1)

    // Pane mounts; next frame flips ready to true.
    const pane = document.createElement('div')
    pane.id = SIDEBAR_PANE_IDS.playback
    document.body.appendChild(pane)
    queued.shift()!(0)
    expect(readyOf(wrapper)).toBe(true)

    vi.unstubAllGlobals()
  })

  it('stops polling after unmount via the unmounted guard', () => {
    const queued: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      queued.push(cb)
      return queued.length
    })

    const wrapper = mountHarness('passes')
    wrapper.unmount()

    const pane = document.createElement('div')
    pane.id = SIDEBAR_PANE_IDS.passes
    document.body.appendChild(pane)

    // Guard returns early: no reschedule, and invoking the stale frame
    // callback must not throw even after the component has been torn down.
    expect(() => queued.shift()!(0)).not.toThrow()
    expect(queued).toHaveLength(0)

    vi.unstubAllGlobals()
  })

  it('resets ready to false on unmount', () => {
    const pane = document.createElement('div')
    pane.id = SIDEBAR_PANE_IDS.alerts
    document.body.appendChild(pane)

    const wrapper = mountHarness('alerts')
    expect(readyOf(wrapper)).toBe(true)
    wrapper.unmount()
    expect(readyOf(wrapper)).toBe(false)
  })
})
