import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useFooterClusterWidths, type FooterClusterWidths } from './useFooterClusterWidths'

/** Adds a footer group with the given id whose box spans `left`..`right` px. */
function addCluster(id: string, left: number, right: number): HTMLElement {
  const cluster = document.createElement('div')
  cluster.id = id
  cluster.getBoundingClientRect = () => ({ left, right }) as DOMRect
  document.body.appendChild(cluster)
  return cluster
}

/** Mounts a host that uses the composable and hands back what it returned. */
function mountHost() {
  let widths: FooterClusterWidths | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        widths = useFooterClusterWidths()
        return () => h('div')
      },
    }),
  )
  return { wrapper, widths: widths! }
}

/** A ResizeObserver stand-in that records what it watches and can fire. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly observed: Element[] = []
  disconnected = false
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }
  observe(target: Element): void {
    this.observed.push(target)
  }
  disconnect(): void {
    this.disconnected = true
  }
}

describe('useFooterClusterWidths', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('innerWidth', 1200)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('measures how far each group reaches in from its edge', () => {
    addCluster('footer-left', 0, 44)
    addCluster('footer-right', 1012, 1200)
    const { widths } = mountHost()
    expect(widths.left.value).toBe(44)
    expect(widths.right.value).toBe(188)
  })

  it('reads 0 for a group that is not on the page', () => {
    const { widths } = mountHost()
    expect(widths.left.value).toBe(0)
    expect(widths.right.value).toBe(0)
  })

  it('re-measures when a group changes size, as when a live item appears', () => {
    addCluster('footer-left', 0, 44)
    const rightCluster = addCluster('footer-right', 1112, 1200)
    const { widths } = mountHost()
    const [observer] = FakeResizeObserver.instances
    expect(observer!.observed.map((element) => element.id)).toEqual(['footer-left', 'footer-right'])

    rightCluster.getBoundingClientRect = () => ({ left: 980, right: 1200 }) as DOMRect
    observer!.callback()
    expect(widths.right.value).toBe(220)
  })

  it('observes only the groups that exist', () => {
    addCluster('footer-right', 1112, 1200)
    mountHost()
    expect(FakeResizeObserver.instances[0]!.observed.map((element) => element.id)).toEqual([
      'footer-right',
    ])
  })

  it('re-measures when the window is resized, which moves the right group', () => {
    const rightCluster = addCluster('footer-right', 1112, 1200)
    const { widths } = mountHost()
    vi.stubGlobal('innerWidth', 800)
    rightCluster.getBoundingClientRect = () => ({ left: 712, right: 800 }) as DOMRect
    window.dispatchEvent(new Event('resize'))
    expect(widths.right.value).toBe(88)
  })

  it('stops watching once unmounted', () => {
    const rightCluster = addCluster('footer-right', 1112, 1200)
    const { wrapper, widths } = mountHost()
    wrapper.unmount()
    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true)

    rightCluster.getBoundingClientRect = () => ({ left: 900, right: 1200 }) as DOMRect
    window.dispatchEvent(new Event('resize'))
    expect(widths.right.value).toBe(88)
  })

  it('still measures, and tracks window resizes, without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const rightCluster = addCluster('footer-right', 1112, 1200)
    const { wrapper, widths } = mountHost()
    expect(widths.right.value).toBe(88)

    rightCluster.getBoundingClientRect = () => ({ left: 1000, right: 1200 }) as DOMRect
    window.dispatchEvent(new Event('resize'))
    expect(widths.right.value).toBe(200)
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
