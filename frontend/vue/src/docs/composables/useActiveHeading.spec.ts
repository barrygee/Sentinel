import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountComposable } from '@/test/docsHarness'
import { useActiveHeading } from './useActiveHeading'

/** A stand-in for the browser's IntersectionObserver that lets a spec fire entries by hand. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  observed = new Set<Element>()
  disconnected = false
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this)
  }
  observe(element: Element): void {
    this.observed.add(element)
  }
  disconnect(): void {
    this.disconnected = true
    this.observed.clear()
  }
  fire(changes: Array<{ id: string; intersecting: boolean }>): void {
    const entries = changes.map((change) => ({
      target: document.getElementById(change.id) as Element,
      isIntersecting: change.intersecting,
    }))
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

function addHeadings(...ids: string[]): void {
  for (const id of ids) {
    const heading = document.createElement('h2')
    heading.id = id
    document.body.appendChild(heading)
  }
}

async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
}

describe('useActiveHeading', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  function setup(ids: string[]) {
    const headingIds = ref<readonly string[]>(ids)
    const { result: activeId, wrapper } = mountComposable(() => useActiveHeading(headingIds))
    return { headingIds, activeId, wrapper }
  }

  const latestObserver = () => FakeIntersectionObserver.instances.at(-1) as FakeIntersectionObserver

  it('starts with no active heading', async () => {
    addHeadings('one', 'two')
    const { activeId } = setup(['one', 'two'])
    await settle()
    expect(activeId.value).toBe('')
  })

  it('watches the headings that exist in the document, skipping missing ids', async () => {
    addHeadings('one', 'three')
    setup(['one', 'two', 'three'])
    await settle()
    expect([...latestObserver().observed].map((element) => element.id)).toEqual(['one', 'three'])
  })

  it('counts only the top 30% of the viewport as "being read"', async () => {
    addHeadings('one')
    setup(['one'])
    await settle()
    expect(latestObserver().options).toEqual({ rootMargin: '0px 0px -70% 0px' })
  })

  it('makes a heading active when it enters the band', async () => {
    addHeadings('one', 'two')
    const { activeId } = setup(['one', 'two'])
    await settle()
    latestObserver().fire([{ id: 'two', intersecting: true }])
    expect(activeId.value).toBe('two')
  })

  it('prefers the earliest heading in the page when several are in the band, whatever order they fired', async () => {
    addHeadings('one', 'two', 'three')
    const { activeId } = setup(['one', 'two', 'three'])
    await settle()
    latestObserver().fire([
      { id: 'three', intersecting: true },
      { id: 'two', intersecting: true },
    ])
    expect(activeId.value).toBe('two')
  })

  it('moves to the next heading when the current one leaves the band', async () => {
    addHeadings('one', 'two')
    const { activeId } = setup(['one', 'two'])
    await settle()
    latestObserver().fire([
      { id: 'one', intersecting: true },
      { id: 'two', intersecting: true },
    ])
    expect(activeId.value).toBe('one')
    latestObserver().fire([{ id: 'one', intersecting: false }])
    expect(activeId.value).toBe('two')
  })

  it('keeps the last heading passed when none is in the band', async () => {
    addHeadings('one', 'two')
    const { activeId } = setup(['one', 'two'])
    await settle()
    latestObserver().fire([{ id: 'one', intersecting: true }])
    latestObserver().fire([{ id: 'one', intersecting: false }])
    expect(activeId.value).toBe('one')
  })

  it('starts over when the page (its heading ids) changes', async () => {
    addHeadings('one', 'two')
    const { headingIds, activeId } = setup(['one'])
    await settle()
    const first = latestObserver()
    first.fire([{ id: 'one', intersecting: true }])
    expect(activeId.value).toBe('one')

    headingIds.value = ['two']
    await settle()
    expect(first.disconnected).toBe(true)
    expect(activeId.value).toBe('')
    expect([...latestObserver().observed].map((element) => element.id)).toEqual(['two'])
    // The old page's "visible" state does not leak into the new one.
    latestObserver().fire([{ id: 'two', intersecting: false }])
    expect(activeId.value).toBe('')
  })

  it('stops observing when unmounted', async () => {
    addHeadings('one')
    const { wrapper } = setup(['one'])
    await settle()
    const observer = latestObserver()
    wrapper.unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('does nothing in a browser without IntersectionObserver', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('IntersectionObserver', undefined)
    addHeadings('one')
    const { activeId, wrapper } = setup(['one'])
    await settle()
    expect(activeId.value).toBe('')
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
