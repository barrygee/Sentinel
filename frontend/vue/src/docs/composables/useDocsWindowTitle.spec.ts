import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountComposable } from '@/test/docsHarness'
import { useDocsWindowTitle } from './useDocsWindowTitle'

describe('useDocsWindowTitle', () => {
  beforeEach(() => {
    document.title = 'SENTINEL — DOCS'
  })

  it('sets "<title> · Docs · Sentinel" on mount, after App has set its own', async () => {
    const title = ref('Operations')
    mountComposable(() => useDocsWindowTitle(title))
    await nextTick()
    expect(document.title).toBe('Operations · Docs · Sentinel')
  })

  it('follows the title as it changes', async () => {
    const title = ref('Operations')
    mountComposable(() => useDocsWindowTitle(title))
    await nextTick()
    title.value = 'Search results'
    await nextTick()
    expect(document.title).toBe('Search results · Docs · Sentinel')
  })
})
