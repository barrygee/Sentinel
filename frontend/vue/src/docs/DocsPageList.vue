<script setup lang="ts">
import { ref, watch } from 'vue'
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'
import type { DocGroupKey, DocsGroup, DocsPage } from './docsTypes'

/**
 * Every docs group as a collapsible heading with its pages beneath (and
 * sub-lists, such as the design decisions, under their own label). This is the
 * docs' own navigation: the rail beside it only holds the Settings buttons, so
 * nothing there repeats a docs group.
 *
 * The open page's group starts expanded and the rest collapsed; any can be
 * opened or closed, and moving to a page in another group expands that one.
 * The current page is marked with `aria-current="page"`.
 */
const props = defineProps<{
  groups: readonly DocsGroup[]
  /** The group of the page on screen; undefined when none is (not found). */
  activeGroupKey?: DocGroupKey | undefined
  currentPath: string
}>()

/** Which groups are open. Local: it never has to outlive the docs page. */
const openGroups = ref(new Set<DocGroupKey>())

watch(
  () => props.activeGroupKey,
  (key) => {
    if (key) openGroups.value = new Set([...openGroups.value, key])
  },
  { immediate: true },
)

function isOpen(key: DocGroupKey): boolean {
  return openGroups.value.has(key)
}

function toggle(key: DocGroupKey): void {
  const next = new Set(openGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openGroups.value = next
}

function isCurrent(page: DocsPage): boolean {
  return page.path === props.currentPath
}
</script>

<template>
  <nav class="doc-page-list" aria-label="Documentation pages">
    <ul class="doc-page-list__groups">
      <li
        v-for="group in groups"
        :key="group.key"
        class="doc-page-list__group"
        :class="{ 'doc-page-list__group--open': isOpen(group.key) }"
      >
        <button
          type="button"
          class="doc-page-list__group-toggle"
          :class="{ 'doc-page-list__group-toggle--active': group.key === activeGroupKey }"
          :aria-expanded="isOpen(group.key)"
          :aria-controls="`doc-pages-${group.key}`"
          @click="toggle(group.key)"
        >
          <span>{{ group.title }}</span>
          <ChevronIcon class="doc-page-list__chevron" :open="isOpen(group.key)" />
        </button>
        <ol
          v-show="isOpen(group.key)"
          :id="`doc-pages-${group.key}`"
          class="doc-page-list__pages"
          :aria-label="group.title"
        >
          <template
            v-for="entry in group.entries"
            :key="entry.kind === 'page' ? entry.page.path : entry.subgroup.title"
          >
            <li v-if="entry.kind === 'page'">
              <RouterLink v-slot="{ href, navigate }" :to="entry.page.url" custom>
                <a
                  class="doc-page-list__link"
                  :class="{ 'doc-page-list__link--current': isCurrent(entry.page) }"
                  :href="href"
                  :aria-current="isCurrent(entry.page) ? 'page' : undefined"
                  @click="navigate"
                  >{{ entry.page.title }}</a
                >
              </RouterLink>
            </li>
            <li v-else class="doc-page-list__subgroup">
              <p class="doc-page-list__sublabel">
                {{ entry.subgroup.title }}
              </p>
              <ol class="doc-page-list__pages" :aria-label="entry.subgroup.title">
                <li v-for="page in entry.subgroup.pages" :key="page.path">
                  <RouterLink v-slot="{ href, navigate }" :to="page.url" custom>
                    <a
                      class="doc-page-list__link"
                      :class="{ 'doc-page-list__link--current': isCurrent(page) }"
                      :href="href"
                      :aria-current="isCurrent(page) ? 'page' : undefined"
                      @click="navigate"
                      >{{ page.title }}</a
                    >
                  </RouterLink>
                </li>
              </ol>
            </li>
          </template>
        </ol>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* Kept small and light so the menu reads as navigation, not headings: page
   links sit a size below the group headings, all in regular weight. */
.doc-page-list__groups,
.doc-page-list__pages {
  margin: 0;
  padding: 0;
  list-style: none;
}

.doc-page-list__groups {
  padding-top: 4px;
}

.doc-page-list__group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 14px 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Barlow', sans-serif;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  color: var(--ink-secondary);
}

/* As the app's rows: an open group tints its heading and its pages (each
   painted directly, so the two tints never stack), and hover or open lights
   the chevron in accent instead of washing the row. */
.doc-page-list__group--open > .doc-page-list__group-toggle,
.doc-page-list__group--open > .doc-page-list__pages {
  background: rgba(var(--ink-rgb), 0.04);
}

.doc-page-list__chevron {
  transition: color 0.15s;
}

.doc-page-list__group-toggle:hover .doc-page-list__chevron,
.doc-page-list__group--open .doc-page-list__chevron {
  color: var(--accent-text);
}

/* The open page's group reads in full ink, so where you are is clear at a glance. */
.doc-page-list__group-toggle--active {
  color: var(--ink-strong);
}

.doc-page-list__pages {
  padding-bottom: 8px;
}

.doc-page-list__link {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 13px 24px;
  font-family: 'Barlow', sans-serif;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.35;
  color: var(--ink-strong);
  text-decoration: none;
}

.doc-page-list__link:hover {
  background: var(--hover-surface);
}

/* The current page: accent text, on its open group's tint. */
.doc-page-list__link--current {
  color: var(--accent-text);
}

.doc-page-list__sublabel {
  margin: 0;
  padding: 14px 24px 4px;
  font-family: 'Barlow', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-secondary);
}
</style>
