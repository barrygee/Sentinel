import { nextTick, watch, type Ref } from 'vue'

/** The elements the focus rules act on. */
interface DocsFocusTargets {
  /** The scrolling regions to return to the top on a page change. */
  scrollRegions: Ref<Array<HTMLElement | null>>
  /** Looks up the page's own heading (the h1 focus target). */
  findPageHeading: () => HTMLElement | null
  /** Looks up a heading inside the content by its anchor id. */
  findAnchorTarget: (anchorId: string) => HTMLElement | null
}

/**
 * Focus and scroll rules for moving through the docs, so keyboard and
 * screen-reader users land on the new content instead of staying on the link
 * they pressed:
 * - a new page resets scroll to the top and focuses its h1;
 * - a `#hash` scrolls to and focuses that heading (unknown hashes fall back to
 *   the h1, without error);
 * - a hash change on the same page does the same;
 * - focus never leaves a text field the reader is typing in.
 *
 * @param pageKey Changes when a different page, or the search results, are shown.
 * @param hashId The current fragment, decoded.
 * @param skip True while something else owns focus (the not-found state focuses
 *   its search field).
 */
export function useDocsFocus(
  pageKey: Ref<string>,
  hashId: Ref<string>,
  skip: Ref<boolean>,
  targets: DocsFocusTargets,
): void {
  watch(
    [pageKey, hashId],
    async ([, anchorId], previous) => {
      /* v8 ignore start -- Vue passes [] (never undefined) as the old value of a multi-source watcher on its immediate run */
      const [previousKey] = previous ?? []
      /* v8 ignore stop */
      // Wait for the new content (and App's own route handling) to settle.
      await nextTick()
      if (skip.value) return
      if (previousKey !== pageKey.value) {
        for (const region of targets.scrollRegions.value) if (region) region.scrollTop = 0
      }
      // Typing into a search box changes the view, but focus must stay in the box.
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return
      const anchorTarget = anchorId === '' ? null : targets.findAnchorTarget(anchorId)
      if (anchorTarget) {
        anchorTarget.scrollIntoView({ block: 'start' })
        anchorTarget.focus({ preventScroll: true })
        return
      }
      targets.findPageHeading()?.focus({ preventScroll: true })
    },
    { immediate: true, flush: 'post' },
  )
}
