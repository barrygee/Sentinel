<script setup lang="ts">
import '@/assets/lightIsland.css'
import './docTokens.css'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DocsArticle from './DocsArticle.vue'
import DocsBreadcrumb from './DocsBreadcrumb.vue'
import DocsCloseButton from './DocsCloseButton.vue'
import DocsDisclosure from './DocsDisclosure.vue'
import DocsGroupRail from './DocsGroupRail.vue'
import DocsHeading from './DocsHeading.vue'
import DocsLiveStatus from './DocsLiveStatus.vue'
import DocsNotFound from './DocsNotFound.vue'
import DocsOnThisPage from './DocsOnThisPage.vue'
import DocsPageList from './DocsPageList.vue'
import DocsPrevNext from './DocsPrevNext.vue'
import DocsSearchField from './DocsSearchField.vue'
import DocsSearchResults from './DocsSearchResults.vue'
import { useDocsFocus } from './composables/useDocsFocus'
import { useDocsReturn } from './composables/useDocsReturn'
import { useDocsRouteState } from './composables/useDocsRouteState'
import { useDocsResultAnnouncement } from './composables/useDocsResultAnnouncement'
import { useDocsSearch } from './composables/useDocsSearch'
import { useDocsWindowTitle } from './composables/useDocsWindowTitle'
import { adjacentDocsPages } from './docsNavigation'
import { docsImageUrls } from './docsSources'
import { useDocsStore } from './docsStore'
import { renderDocument } from './markdown/renderDocument'

/**
 * The `/doc/...` view: a document you read for a long time, in the Settings
 * language (a light island with a charcoal rail), not a modal. It composes the
 * group rail, the page list with search, a breadcrumb and close button, and the
 * content column, which shows one of: the page, the search results, or "page
 * not found". The header and footer stay usable, and the skip link lands here.
 *
 * Escape closes Docs (as it closes Settings) unless focus is in a field or an
 * open disclosure, which take the key first.
 */
const docsStore = useDocsStore()
const { closeDocs } = useDocsReturn()
const { library, pagePath, page, activeGroup, query, searchActive, hashId, setQuery } =
  useDocsRouteState()

const search = useDocsSearch(
  library,
  computed(() => (searchActive.value ? query.value : '')),
)
useDocsResultAnnouncement(search.outcome, searchActive)

const notFound = computed(() => !searchActive.value && page.value === undefined)

const rendered = computed(() => {
  const current = page.value
  if (!current) return null
  return renderDocument(current.markdown, {
    file: current.file,
    pageUrl: current.url,
    library,
    imageUrls: docsImageUrls,
  })
})

// The page's address, for the in-page links of "On this page" (only shown for a page).
/* v8 ignore start -- only read while a page is shown, so the fallback never applies */
const currentPageUrl = computed(() => page.value?.url ?? '/doc/')
/* v8 ignore stop */

const adjacent = computed(() => adjacentDocsPages(library, pagePath.value))

const headingText = computed(() => {
  if (searchActive.value) return 'SEARCH RESULTS'
  return page.value ? page.value.title : 'PAGE NOT FOUND'
})

const windowTitle = computed(() => {
  if (searchActive.value) return 'Search results'
  return page.value ? page.value.title : 'Page not found'
})

const trail = computed(() => {
  const current = page.value
  if (searchActive.value || !current) {
    return [
      { label: 'Docs', to: '/doc/' },
      { label: searchActive.value ? 'Search' : 'Page not found' },
    ]
  }
  return [
    {
      label: current.groupTitle,
      /* v8 ignore start -- a page always belongs to a group that has at least that page */
      to: activeGroup.value?.pages[0]?.url ?? '/doc/',
      /* v8 ignore stop */
    },
    { label: current.title },
  ]
})

useDocsWindowTitle(windowTitle)

const rootRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const mainRef = ref<HTMLElement | null>(null)
const searchFieldRef = ref<InstanceType<typeof DocsSearchField> | null>(null)
const searchResultsRef = ref<InstanceType<typeof DocsSearchResults> | null>(null)
const pageListOpen = ref(false)

// Showing or leaving the search results is a view change too, so focus follows it.
const viewKey = computed(() => `${pagePath.value}|${searchActive.value}`)
useDocsFocus(viewKey, hashId, notFound, {
  scrollRegions: computed(() => [bodyRef.value, mainRef.value]),
  /* v8 ignore start -- the root is mounted, and the view always has its h1, when this runs */
  findPageHeading: () => rootRef.value?.querySelector<HTMLElement>('h1') ?? null,
  /* v8 ignore stop */
  findAnchorTarget: (anchorId) => {
    const target = document.getElementById(anchorId)
    return target && rootRef.value?.contains(target) ? target : null
  },
})

// A new page closes the phone page list that was used to pick it.
watch(pagePath, () => {
  pageListOpen.value = false
})

function onEscape(event: KeyboardEvent): void {
  const target = event.target
  const inField =
    target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]')
  if (inField || event.defaultPrevented) return
  closeDocs()
}

onMounted(() => docsStore.setActive(true))
onBeforeUnmount(() => docsStore.setActive(false))
</script>

<template>
  <div
    ref="rootRef"
    class="doc-page theme-light light-island"
    data-testid="docs-page"
    @keydown.esc="onEscape"
  >
    <DocsGroupRail
      v-if="docsStore.sidebarOpen"
      :groups="library.groups"
      :active-group-key="activeGroup?.key"
    />

    <div ref="bodyRef" class="doc-body" :class="{ 'doc-body--no-sidebar': !docsStore.sidebarOpen }">
      <aside v-if="docsStore.sidebarOpen" class="doc-sidebar" aria-label="Documentation navigation">
        <div class="doc-sidebar__search">
          <DocsSearchField
            ref="searchFieldRef"
            :model-value="query"
            @update:model-value="setQuery"
            @focus-results="searchResultsRef?.focusFirst()"
          />
        </div>
        <DocsDisclosure
          v-model:open="pageListOpen"
          :label="`Pages in ${activeGroup?.title ?? 'Docs'}`"
          collapse-below="tablet"
        >
          <DocsPageList :group="activeGroup ?? library.groups[0]" :current-path="pagePath" />
        </DocsDisclosure>
      </aside>

      <div class="doc-column">
        <div class="doc-topbar">
          <DocsBreadcrumb :trail="trail" />
          <DocsCloseButton />
        </div>

        <div ref="mainRef" class="doc-main">
          <div class="doc-content" :class="{ 'doc-content--page': rendered && !searchActive }">
            <div class="doc-content__header">
              <DocsHeading :id="!searchActive ? rendered?.headingId : undefined">{{
                headingText
              }}</DocsHeading>
            </div>

            <DocsSearchResults
              v-if="searchActive"
              ref="searchResultsRef"
              class="doc-content__body"
              :query="query"
              :outcome="search.outcome.value"
              :library="library"
              @focus-field="searchFieldRef?.focus()"
            />
            <DocsNotFound
              v-else-if="!rendered"
              class="doc-content__body"
              :requested-path="pagePath"
              @search="setQuery"
            />
            <template v-else>
              <div class="doc-content__body">
                <DocsArticle :key="page?.url" :blocks="rendered.blocks" />
                <DocsPrevNext :previous="adjacent.previous" :next="adjacent.next" />
              </div>
              <!-- After the article in the DOM so Tab follows the wide layout (the
                   column to its right); below 1280px it is placed under the heading. -->
              <div class="doc-content__toc">
                <DocsOnThisPage :entries="rendered.outline" :page-url="currentPageUrl" />
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <DocsLiveStatus />
  </div>
</template>

<style scoped>
/* Sits exactly where the Settings panel does, between the header and footer, so
   both stay in reach. Same layer as Settings (the map sidebar behind is inert). */
.doc-page {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  left: 0;
  right: 0;
  z-index: 10000;
  display: flex;
  background-color: var(--canvas);
  color: var(--ink);
}

/* Phone first: one column that scrolls as a whole (search and page list, then
   the page). The rail stays at 48px. */
.doc-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--ink-rgb), 0.08) transparent;
}

.doc-sidebar {
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--border);
}

.doc-sidebar__search {
  padding: 12px 16px;
}

.doc-column {
  min-width: 0;
}

/* Stays at the top while the phone column scrolls, so close is always in reach. */
.doc-topbar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 4px 0 16px;
  background: var(--canvas);
}

.doc-main {
  padding: 0 16px 80px;
}

.doc-content {
  max-width: 100%;
}

/* Heading, then "On this page", then the article — though the article comes
   before "On this page" in the DOM (see the template). */
.doc-content--page {
  display: flex;
  flex-direction: column;
}

.doc-content--page .doc-content__toc {
  order: 1;
}

.doc-content--page .doc-content__body {
  order: 2;
}

/* With the heading's own 6px, a 32px gap to the text, as under Settings' title. */
.doc-content__header {
  margin-bottom: 26px;
}

@media (min-width: 769px) {
  .doc-body {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    overflow: hidden;
  }

  .doc-body--no-sidebar {
    grid-template-columns: minmax(0, 1fr);
  }

  .doc-sidebar {
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    border-right: 1px solid var(--border);
    border-bottom: none;
  }

  .doc-column {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .doc-topbar {
    position: static;
    flex-shrink: 0;
    padding: 12px 8px 0 24px;
  }

  .doc-main {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--ink-rgb), 0.08) transparent;
    padding: 0 24px 90px;
  }
}

@media (min-width: 1025px) {
  .doc-body {
    grid-template-columns: 264px minmax(0, 1fr);
  }

  .doc-body--no-sidebar {
    grid-template-columns: minmax(0, 1fr);
  }

  .doc-topbar {
    padding-left: 44px;
    padding-right: 12px;
  }

  .doc-main {
    padding: 0 44px 110px;
  }
}

/* Wide: "On this page" becomes a sticky column beside the article. */
@media (min-width: 1280px) {
  .doc-content--page {
    display: grid;
    grid-template-columns: minmax(0, 960px) 232px;
    column-gap: 40px;
    align-items: start;
  }

  .doc-content--page .doc-content__header,
  .doc-content--page .doc-content__body {
    grid-column: 1;
  }

  .doc-content--page .doc-content__toc {
    grid-column: 2;
    grid-row: 1 / span 2;
    position: sticky;
    top: 34px;
    padding-top: 34px;
  }
}

.doc-body::-webkit-scrollbar,
.doc-main::-webkit-scrollbar {
  width: 10px;
}
.doc-body::-webkit-scrollbar-thumb,
.doc-main::-webkit-scrollbar-thumb {
  background: rgba(var(--ink-rgb), 0.08);
  border-radius: 8px;
}
</style>
