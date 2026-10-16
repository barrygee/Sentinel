import { computed, type ComputedRef, type Ref } from 'vue'
import type { DocsLibrary } from '../docsTypes'
import {
  createDocsSearchEngine,
  type DocsSearchEngine,
  type DocsSearchOutcome,
} from '../search/docsSearchEngine'

/** Reactive search over the whole docs set. */
export interface DocsSearch {
  /** The results for the current query; null while there is no query. */
  outcome: ComputedRef<DocsSearchOutcome | null>
}

/**
 * Search over the bundled docs. The records are prepared on the first query
 * (not at page load) and reused after, so a reader who never searches never
 * pays for it. Works the same on a cold `/docs/?q=...` load.
 *
 * @param library The validated docs set to search.
 * @param activeQuery The query to search for; an empty string means no search.
 */
export function useDocsSearch(library: DocsLibrary, activeQuery: Ref<string>): DocsSearch {
  let engine: DocsSearchEngine | null = null

  const outcome = computed(() => {
    const query = activeQuery.value.trim()
    if (query === '') return null
    engine ??= createDocsSearchEngine(library)
    return engine.search(query)
  })

  return { outcome }
}
