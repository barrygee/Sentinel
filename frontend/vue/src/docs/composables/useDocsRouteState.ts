import { computed, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { docsParamOf } from '@/router/docsRoute'
import { docsPathFromParam } from '../docsNavigation'
import { getDocsLibrary } from '../docsSources'
import type { DocsGroup, DocsLibrary, DocsPage } from '../docsTypes'

/** The minimum characters before a typed query becomes a search. */
export const MINIMUM_QUERY_LENGTH = 2

/** What the docs URL says: which page, which group, and any search in progress. */
export interface DocsRouteState {
  library: DocsLibrary
  /** The page path the URL names (`index` for `/docs/`). */
  pagePath: ComputedRef<string>
  /** The page, or undefined when the URL names none (the not-found state). */
  page: ComputedRef<DocsPage | undefined>
  /** The group the page belongs to, or undefined when no group is active. */
  activeGroup: ComputedRef<DocsGroup | undefined>
  /** The `?q=` text, which is the single source of truth for the search. */
  query: ComputedRef<string>
  /** True once the query is long enough to search. */
  searchActive: ComputedRef<boolean>
  /** The URL fragment without its `#`, decoded. */
  hashId: ComputedRef<string>
  /** Sets or clears the query without adding a history entry. */
  setQuery: (nextQuery: string) => void
}

/**
 * Reads the docs route. The search query lives in the URL (`?q=`) rather than
 * in component state so that following a result and pressing Back returns to
 * the results, and a search can be shared as a link.
 */
export function useDocsRouteState(): DocsRouteState {
  const route = useRoute()
  const router = useRouter()
  const library = getDocsLibrary()

  const pagePath = computed(() => docsPathFromParam(docsParamOf(route)))
  const page = computed(() => library.pageByPath.get(pagePath.value))
  const activeGroup = computed(() =>
    library.groups.find((group) => group.key === page.value?.groupKey),
  )
  const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
  const searchActive = computed(() => query.value.trim().length >= MINIMUM_QUERY_LENGTH)
  const hashId = computed(() => {
    const raw = route.hash.replace(/^#/, '')
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })

  function setQuery(nextQuery: string): void {
    const { q: _previousQuery, ...otherQuery } = route.query
    void router.replace({
      path: route.path,
      query: nextQuery === '' ? otherQuery : { ...otherQuery, q: nextQuery },
      hash: route.hash,
    })
  }

  return { library, pagePath, page, activeGroup, query, searchActive, hashId, setQuery }
}
