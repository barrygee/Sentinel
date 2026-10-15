import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDocsStore } from './docsStore'

describe('docsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with the sidebar open, docs inactive and nothing announced', () => {
    const store = useDocsStore()
    expect(store.sidebarOpen).toBe(true)
    expect(store.active).toBe(false)
    expect(store.announcement).toBe('')
  })

  it('toggles the sidebar both ways', () => {
    const store = useDocsStore()
    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(false)
    store.toggleSidebar()
    expect(store.sidebarOpen).toBe(true)
  })

  it('records whether the docs page is mounted', () => {
    const store = useDocsStore()
    store.setActive(true)
    expect(store.active).toBe(true)
    store.setActive(false)
    expect(store.active).toBe(false)
  })

  it('speaks a message after a short delay, not synchronously', () => {
    const store = useDocsStore()
    store.announce('3 results')
    expect(store.announcement).toBe('')
    vi.advanceTimersByTime(49)
    expect(store.announcement).toBe('')
    vi.advanceTimersByTime(1)
    expect(store.announcement).toBe('3 results')
  })

  it('clears the previous message first so repeating the same text is heard again', () => {
    const store = useDocsStore()
    store.announce('Copied to clipboard')
    vi.advanceTimersByTime(50)
    expect(store.announcement).toBe('Copied to clipboard')

    store.announce('Copied to clipboard')
    // Cleared immediately, so a screen reader sees a change when it is set again.
    expect(store.announcement).toBe('')
    vi.advanceTimersByTime(50)
    expect(store.announcement).toBe('Copied to clipboard')
  })
})
