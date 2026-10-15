import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DocsTableScroll from './DocsTableScroll.vue'

const TABLE_HTML =
  '<table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>SDR</td></tr></tbody></table>'

/** Makes the region report a width, so the "more to scroll" fade can be tested without layout. */
function giveRegionWidths(widths: { scrollWidth: number; clientWidth: number }): void {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(widths.scrollWidth)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(widths.clientWidth)
}

/** A ResizeObserver that records what it watches and lets a spec fire it by hand. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  disconnected = false
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this)
  }
  observe(element: Element): void {
    this.observed.push(element)
  }
  disconnect(): void {
    this.disconnected = true
  }
}

function mountTable(html = TABLE_HTML, label = 'Environment variables table') {
  return mount(DocsTableScroll, { props: { html, label }, attachTo: document.body })
}

describe('DocsTableScroll', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders the table inside a named, keyboard-focusable region', () => {
    const wrapper = mountTable()
    const region = wrapper.get('[role="region"]')
    expect(region.attributes('tabindex')).toBe('0')
    expect(region.attributes('aria-label')).toBe('Environment variables table')
    expect(region.get('table td').text()).toBe('SDR')
  })

  it('has no fade when the table fits', () => {
    giveRegionWidths({ scrollWidth: 300, clientWidth: 300 })
    const wrapper = mountTable()
    expect(wrapper.get('.doc-table-scroll').classes()).not.toContain('doc-table-scroll--more')
  })

  it('has a trailing-edge fade when the table is wider than its region', async () => {
    giveRegionWidths({ scrollWidth: 900, clientWidth: 300 })
    const wrapper = mountTable()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.doc-table-scroll').classes()).toContain('doc-table-scroll--more')
  })

  it('ignores a sub-pixel difference', () => {
    giveRegionWidths({ scrollWidth: 301, clientWidth: 300 })
    const wrapper = mountTable()
    expect(wrapper.get('.doc-table-scroll').classes()).not.toContain('doc-table-scroll--more')
  })

  it('drops the fade once scrolled to the end, and brings it back when scrolled away', async () => {
    giveRegionWidths({ scrollWidth: 900, clientWidth: 300 })
    const wrapper = mountTable()
    await wrapper.vm.$nextTick()
    const region = wrapper.get('.doc-table-scroll')
    expect(region.classes()).toContain('doc-table-scroll--more')

    region.element.scrollLeft = 600
    await region.trigger('scroll')
    expect(region.classes()).not.toContain('doc-table-scroll--more')

    region.element.scrollLeft = 0
    await region.trigger('scroll')
    expect(region.classes()).toContain('doc-table-scroll--more')
  })

  it('measures again when the region or the table is resized', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    giveRegionWidths({ scrollWidth: 300, clientWidth: 300 })
    const wrapper = mountTable()
    const observer = FakeResizeObserver.instances[0] as FakeResizeObserver
    expect(observer.observed.map((element) => element.tagName)).toEqual(['DIV', 'TABLE'])

    giveRegionWidths({ scrollWidth: 900, clientWidth: 300 })
    observer.callback()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.doc-table-scroll').classes()).toContain('doc-table-scroll--more')
  })

  it('watches only the region when the html contains no table', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    mountTable('<p>no table here</p>')
    const observer = FakeResizeObserver.instances[0] as FakeResizeObserver
    expect(observer.observed.map((element) => element.tagName)).toEqual(['DIV'])
  })

  it('stops watching when removed', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const wrapper = mountTable()
    const observer = FakeResizeObserver.instances[0] as FakeResizeObserver
    wrapper.unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('works in a browser without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const wrapper = mountTable()
    expect(wrapper.find('table').exists()).toBe(true)
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountTable()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
