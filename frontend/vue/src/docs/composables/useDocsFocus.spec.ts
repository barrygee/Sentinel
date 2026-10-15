import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountComposable } from '@/test/docsHarness'
import { useDocsFocus } from './useDocsFocus'

function setup(options: { pageKey?: string; hashId?: string; skip?: boolean } = {}) {
  const pageHeading = document.createElement('h1')
  pageHeading.tabIndex = -1
  const anchorTarget = document.createElement('h2')
  anchorTarget.tabIndex = -1
  anchorTarget.id = 'target'
  document.body.append(pageHeading, anchorTarget)

  const scrollRegionOne = document.createElement('div')
  const scrollRegionTwo = document.createElement('div')
  scrollRegionOne.scrollTop = 120
  scrollRegionTwo.scrollTop = 80

  const pageKey = ref(options.pageKey ?? 'a')
  const hashId = ref(options.hashId ?? '')
  const skip = ref(options.skip ?? false)
  const scrollRegions = ref<Array<HTMLElement | null>>([scrollRegionOne, null, scrollRegionTwo])
  const findAnchorTarget = vi.fn((anchorId: string) =>
    anchorId === 'target' ? anchorTarget : null,
  )
  const findPageHeading = vi.fn((): HTMLElement | null => pageHeading)
  const scrollIntoView = vi.fn()
  anchorTarget.scrollIntoView = scrollIntoView

  mountComposable(() =>
    useDocsFocus(pageKey, hashId, skip, { scrollRegions, findPageHeading, findAnchorTarget }),
  )
  return {
    pageKey,
    hashId,
    skip,
    pageHeading,
    anchorTarget,
    scrollRegionOne,
    scrollRegionTwo,
    findAnchorTarget,
    findPageHeading,
    scrollIntoView,
  }
}

/** Lets the watcher (post-flush) and its internal nextTick run. */
async function settle(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

describe('useDocsFocus', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses the page heading when the page first shows', async () => {
    const { pageHeading } = setup()
    await settle()
    expect(document.activeElement).toBe(pageHeading)
  })

  it('resets every scroll region to the top when the page first shows, skipping missing ones', async () => {
    const { scrollRegionOne, scrollRegionTwo } = setup()
    await settle()
    expect(scrollRegionOne.scrollTop).toBe(0)
    expect(scrollRegionTwo.scrollTop).toBe(0)
  })

  it('focuses the heading named by the fragment and scrolls it into view', async () => {
    const { anchorTarget, scrollIntoView, pageHeading } = setup({ hashId: 'target' })
    await settle()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(document.activeElement).toBe(anchorTarget)
    expect(document.activeElement).not.toBe(pageHeading)
  })

  it('falls back to the page heading for an unknown fragment, without error', async () => {
    const { pageHeading, scrollIntoView } = setup({ hashId: 'nothing-here' })
    await settle()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(pageHeading)
  })

  it('does not look an anchor up when the fragment is empty', async () => {
    const { findAnchorTarget } = setup()
    await settle()
    expect(findAnchorTarget).not.toHaveBeenCalled()
  })

  it('moves to the new page heading and resets scroll when the page changes', async () => {
    const { pageKey, pageHeading, scrollRegionOne } = setup()
    await settle()
    scrollRegionOne.scrollTop = 300
    ;(document.activeElement as HTMLElement).blur()
    pageKey.value = 'b'
    await settle()
    expect(scrollRegionOne.scrollTop).toBe(0)
    expect(document.activeElement).toBe(pageHeading)
  })

  it('moves focus to the fragment heading on a hash change within the same page, without resetting scroll', async () => {
    const { hashId, anchorTarget, scrollRegionOne } = setup()
    await settle()
    scrollRegionOne.scrollTop = 300
    hashId.value = 'target'
    await settle()
    expect(document.activeElement).toBe(anchorTarget)
    expect(scrollRegionOne.scrollTop).toBe(300)
  })

  it('moves focus again when the same fragment is followed on a new page', async () => {
    const { pageKey, hashId, anchorTarget } = setup({ hashId: 'target' })
    await settle()
    ;(document.activeElement as HTMLElement).blur()
    pageKey.value = 'b'
    hashId.value = 'target'
    await settle()
    expect(document.activeElement).toBe(anchorTarget)
  })

  it('leaves focus alone while the reader is typing in an input', async () => {
    const { pageKey, pageHeading, scrollRegionOne } = setup()
    await settle()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    scrollRegionOne.scrollTop = 200
    pageKey.value = 'b'
    await settle()
    expect(document.activeElement).toBe(input)
    expect(document.activeElement).not.toBe(pageHeading)
    // The new content still starts at the top.
    expect(scrollRegionOne.scrollTop).toBe(0)
  })

  it('leaves focus alone while the reader is typing in a textarea', async () => {
    const { hashId, anchorTarget } = setup()
    await settle()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    hashId.value = 'target'
    await settle()
    expect(document.activeElement).toBe(textarea)
    expect(document.activeElement).not.toBe(anchorTarget)
  })

  it('does nothing while another part owns focus (skip), not even scrolling', async () => {
    const { pageKey, pageHeading, scrollRegionOne } = setup({ skip: true })
    await settle()
    scrollRegionOne.scrollTop = 150
    pageKey.value = 'b'
    await settle()
    expect(document.activeElement).not.toBe(pageHeading)
    expect(scrollRegionOne.scrollTop).toBe(150)
  })

  it('does not throw when the page has no heading yet', async () => {
    const { pageKey, findPageHeading } = setup()
    findPageHeading.mockReturnValue(null)
    pageKey.value = 'b'
    await settle()
    expect(findPageHeading).toHaveBeenCalled()
  })
})
