import { onBeforeUnmount, watch, type Ref } from 'vue'
import type { DocsSearchOutcome } from '../search/docsSearchEngine'
import { useDocsStore } from '../docsStore'

/** How long typing must pause before the result count is spoken. */
export const RESULT_ANNOUNCEMENT_DELAY_MS = 500

/**
 * Speaks how many search results there are, once typing settles and never per
 * keystroke, through the page's single live region.
 *
 * @param outcome The current search outcome; null when there is no search.
 * @param searchActive Whether a search is being shown.
 */
export function useDocsResultAnnouncement(
  outcome: Readonly<Ref<DocsSearchOutcome | null>>,
  searchActive: Readonly<Ref<boolean>>,
): void {
  const docsStore = useDocsStore()
  let timer: ReturnType<typeof setTimeout> | undefined
  // Immediate: on a cold `/docs/?q=...` load the outcome exists from the start,
  // so there is no later change to wait for.
  watch(
    outcome,
    (current) => {
      clearTimeout(timer)
      if (!current || !searchActive.value) return
      timer = setTimeout(() => {
        const total = current.totalHits
        docsStore.announce(
          total === 0 ? 'No results' : `${total} ${total === 1 ? 'result' : 'results'}`,
        )
      }, RESULT_ANNOUNCEMENT_DELAY_MS)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => clearTimeout(timer))
}
