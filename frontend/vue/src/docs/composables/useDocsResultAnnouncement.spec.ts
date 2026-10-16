import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mountComposable } from '@/test/docsHarness'
import { useDocsStore } from '../docsStore'
import type { DocsSearchOutcome } from '../search/docsSearchEngine'
import {
  RESULT_ANNOUNCEMENT_DELAY_MS,
  useDocsResultAnnouncement,
} from './useDocsResultAnnouncement'

/** The result delay plus the live region's own settling delay. */
const SPOKEN_AFTER_MS = RESULT_ANNOUNCEMENT_DELAY_MS + 50

function outcomeWith(totalHits: number): DocsSearchOutcome {
  return { hits: [], totalHits, expansions: [] }
}

describe('useDocsResultAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function setup(initial: DocsSearchOutcome | null, active = true) {
    const outcome = shallowRef<DocsSearchOutcome | null>(initial)
    const searchActive = ref(active)
    const { wrapper } = mountComposable(() => useDocsResultAnnouncement(outcome, searchActive))
    return { outcome, searchActive, wrapper, store: useDocsStore() }
  }

  it('announces the count of a search that is already showing at load (cold /docs/?q=)', () => {
    const { store } = setup(outcomeWith(7))
    vi.advanceTimersByTime(SPOKEN_AFTER_MS)
    expect(store.announcement).toBe('7 results')
  })

  it('waits for typing to settle before speaking', () => {
    const { store } = setup(outcomeWith(7))
    vi.advanceTimersByTime(RESULT_ANNOUNCEMENT_DELAY_MS - 1)
    expect(store.announcement).toBe('')
  })

  it('uses the singular for exactly one result', () => {
    const { store } = setup(outcomeWith(1))
    vi.advanceTimersByTime(SPOKEN_AFTER_MS)
    expect(store.announcement).toBe('1 result')
  })

  it('says "No results" for none', () => {
    const { store } = setup(outcomeWith(0))
    vi.advanceTimersByTime(SPOKEN_AFTER_MS)
    expect(store.announcement).toBe('No results')
  })

  it('announces the total, not the capped number shown', () => {
    const { store } = setup({ hits: [], totalHits: 120, expansions: [] })
    vi.advanceTimersByTime(SPOKEN_AFTER_MS)
    expect(store.announcement).toBe('120 results')
  })

  it('speaks only the last count when the outcome changes while typing', async () => {
    const { outcome, store } = setup(outcomeWith(5))
    vi.advanceTimersByTime(200)
    outcome.value = outcomeWith(3)
    await Promise.resolve()
    vi.advanceTimersByTime(200)
    outcome.value = outcomeWith(2)
    await Promise.resolve()
    vi.advanceTimersByTime(SPOKEN_AFTER_MS)
    expect(store.announcement).toBe('2 results')
  })

  it('says nothing when there is no outcome', () => {
    const { store } = setup(null)
    vi.advanceTimersByTime(SPOKEN_AFTER_MS * 2)
    expect(store.announcement).toBe('')
  })

  it('says nothing when the search is not active', () => {
    const { store } = setup(outcomeWith(4), false)
    vi.advanceTimersByTime(SPOKEN_AFTER_MS * 2)
    expect(store.announcement).toBe('')
  })

  it('cancels a pending announcement when the outcome goes away', async () => {
    const { outcome, store } = setup(outcomeWith(4))
    vi.advanceTimersByTime(100)
    outcome.value = null
    await Promise.resolve()
    vi.advanceTimersByTime(SPOKEN_AFTER_MS * 2)
    expect(store.announcement).toBe('')
  })

  it('cancels a pending announcement when the page is left', () => {
    const { wrapper, store } = setup(outcomeWith(4))
    vi.advanceTimersByTime(100)
    wrapper.unmount()
    vi.advanceTimersByTime(SPOKEN_AFTER_MS * 2)
    expect(store.announcement).toBe('')
  })
})
