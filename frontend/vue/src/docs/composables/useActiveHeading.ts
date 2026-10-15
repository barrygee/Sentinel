import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * Tracks which of a page's headings is currently being read, for the "On this
 * page" list. The current heading is the first one inside the top band of the
 * viewport; when none is, the last one passed stays current.
 *
 * @param headingIds Anchor ids to watch, in document order.
 */
export function useActiveHeading(headingIds: Ref<readonly string[]>): Ref<string> {
  const activeId = ref('')
  const visibleIds = new Set<string>()
  let observer: IntersectionObserver | null = null

  function refreshActive(): void {
    const firstVisible = headingIds.value.find((headingId) => visibleIds.has(headingId))
    if (firstVisible !== undefined) activeId.value = firstVisible
  }

  function watchHeadings(): void {
    observer?.disconnect()
    visibleIds.clear()
    activeId.value = ''
    if (typeof IntersectionObserver === 'undefined') return
    // Only the top 30% of the viewport counts as "being read".
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleIds.add(entry.target.id)
          else visibleIds.delete(entry.target.id)
        }
        refreshActive()
      },
      { rootMargin: '0px 0px -70% 0px' },
    )
    for (const headingId of headingIds.value) {
      const heading = document.getElementById(headingId)
      if (heading) observer.observe(heading)
    }
  }

  watch(headingIds, watchHeadings, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => observer?.disconnect())
  return activeId
}
