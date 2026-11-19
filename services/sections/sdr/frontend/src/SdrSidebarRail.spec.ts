import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'
import SdrSidebarRail from './SdrSidebarRail.vue'
import { SDR_PANEL_TABS } from './composables/useSdrActiveTab'
import type { SdrTab } from './stores/sdr'

const routeMock = { path: '/sdr' }
vi.mock('vue-router', () => ({ useRoute: () => routeMock }))

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountRail(activeTab: SdrTab = 'radio'): VueWrapper {
  return mount(SdrSidebarRail, {
    props: { tabs: SDR_PANEL_TABS, activeTab },
    attachTo: document.body,
  })
}

function railElement(): HTMLElement {
  return document.getElementById('sdr-sidebar-rail')!
}

function railButton(tab: SdrTab): HTMLButtonElement {
  return railElement().querySelector<HTMLButtonElement>(`.sdr-rail-btn[data-tab="${tab}"]`)!
}

// Mounting twice in one test needs the first teleported rail gone, so
// getElementById finds the new one.
function removeTeleportedRail() {
  document.getElementById('sdr-sidebar-rail')?.remove()
}

function setSidebarState(open: boolean) {
  document.dispatchEvent(new CustomEvent('sentinel:sidebar-state', { detail: { open } }))
}

let panelEvents: string[]
function recordPanelEvent(event: Event) {
  panelEvents.push(event.type)
}

beforeEach(() => {
  routeMock.path = '/sdr'
  sessionStorage.clear()
  panelEvents = []
  document.addEventListener('sentinel:sdr-toggle-panel', recordPanelEvent)
  document.addEventListener('sentinel:sdr-open-panel', recordPanelEvent)
})

afterEach(() => {
  document.removeEventListener('sentinel:sdr-toggle-panel', recordPanelEvent)
  document.removeEventListener('sentinel:sdr-open-panel', recordPanelEvent)
  vi.restoreAllMocks()
})

describe('SdrSidebarRail — rendering', () => {
  it('teleports one named button per tab, in order, to the body', () => {
    mountRail()
    expect(railElement().parentElement).toBe(document.body)
    const buttons = [...railElement().querySelectorAll('.sdr-rail-btn')]
    expect(buttons.map((button) => button.getAttribute('data-tab'))).toEqual(
      SDR_PANEL_TABS.map((tab) => tab.id),
    )
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      SDR_PANEL_TABS.map((tab) => tab.label),
    )
  })

  it('is shown on an SDR route and hidden elsewhere', () => {
    mountRail()
    expect(railElement().style.display).toBe('')
    removeTeleportedRail()
    routeMock.path = '/air'
    mountRail()
    expect(railElement().style.display).toBe('none')
  })
})

describe('SdrSidebarRail — active highlight', () => {
  it('highlights nothing while the side panel is closed', () => {
    mountRail('groups')
    expect(railElement().querySelectorAll('.sdr-rail-btn-active')).toHaveLength(0)
  })

  it('highlights the active tab once the panel reports open, and clears on close', async () => {
    mountRail('groups')
    setSidebarState(true)
    await nextTick()
    expect(railButton('groups').classList).toContain('sdr-rail-btn-active')
    expect(railElement().querySelectorAll('.sdr-rail-btn-active')).toHaveLength(1)
    setSidebarState(false)
    await nextTick()
    expect(railButton('groups').classList).not.toContain('sdr-rail-btn-active')
  })

  it('treats a sidebar-state event without detail as closed', async () => {
    mountRail('groups')
    setSidebarState(true)
    await nextTick()
    document.dispatchEvent(new CustomEvent('sentinel:sidebar-state'))
    await nextTick()
    expect(railButton('groups').classList).not.toContain('sdr-rail-btn-active')
  })

  it('restores the open state from sessionStorage on mount', () => {
    sessionStorage.setItem('sentinel_sidebar_open', '1')
    mountRail('recordings')
    expect(railButton('recordings').classList).toContain('sdr-rail-btn-active')
  })

  it('starts closed when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    mountRail('recordings')
    expect(railButton('recordings').classList).not.toContain('sdr-rail-btn-active')
  })
})

describe('SdrSidebarRail — clicks', () => {
  it('selects a tab and opens the panel when it is closed', async () => {
    const wrapper = mountRail('radio')
    railButton('groups').click()
    await nextTick()
    expect(wrapper.emitted('select')).toEqual([['groups']])
    expect(panelEvents).toEqual(['sentinel:sdr-open-panel'])
  })

  it('opens the panel on the active tab too when it is closed', async () => {
    const wrapper = mountRail('radio')
    railButton('radio').click()
    expect(wrapper.emitted('select')).toEqual([['radio']])
    expect(panelEvents).toEqual(['sentinel:sdr-open-panel'])
  })

  it('switches tab without re-opening when the panel is already open', async () => {
    const wrapper = mountRail('radio')
    setSidebarState(true)
    await nextTick()
    railButton('recordings').click()
    expect(wrapper.emitted('select')).toEqual([['recordings']])
    expect(panelEvents).toEqual([])
  })

  it('collapses the panel instead of selecting when the showing tab is clicked again', async () => {
    const wrapper = mountRail('radio')
    setSidebarState(true)
    await nextTick()
    railButton('radio').click()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(panelEvents).toEqual(['sentinel:sdr-toggle-panel'])
  })

  it('emits select before asking the panel to open', async () => {
    const order: string[] = []
    const wrapper = mount(SdrSidebarRail, {
      props: { tabs: SDR_PANEL_TABS, activeTab: 'radio', onSelect: () => order.push('select') },
      attachTo: document.body,
    })
    document.addEventListener('sentinel:sdr-open-panel', () => order.push('open'), { once: true })
    railButton('groups').click()
    expect(order).toEqual(['select', 'open'])
    wrapper.unmount()
  })
})

describe('SdrSidebarRail — accessibility', () => {
  it('has no axe violations closed and open', async () => {
    mountRail('radio')
    expect(await axe(railElement().outerHTML, AXE_OPTIONS)).toHaveNoViolations()
    setSidebarState(true)
    await nextTick()
    expect(await axe(railElement().outerHTML, AXE_OPTIONS)).toHaveNoViolations()
  })
})
