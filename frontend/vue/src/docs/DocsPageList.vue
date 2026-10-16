<script setup lang="ts">
import { CHANGELOG_URL } from './markdown/docLinks'
import type { DocsGroup, DocsPage } from './docsTypes'

/**
 * The ordered page links of one group (with its sub-lists, such as the design
 * decisions, nested), and the link to the online changelog beneath them. The
 * current page is marked with `aria-current="page"`.
 */
defineProps<{
  /** The group to list; undefined shows nothing (no group is active). */
  group: DocsGroup | undefined
  currentPath: string
}>()

function isCurrent(page: DocsPage, currentPath: string): boolean {
  return page.path === currentPath
}
</script>

<template>
  <nav v-if="group" class="doc-page-list" :aria-label="`Pages in ${group.title}`">
    <p class="doc-page-list__label">{{ group.title }}</p>
    <ol class="doc-page-list__pages">
      <template
        v-for="entry in group.entries"
        :key="entry.kind === 'page' ? entry.page.path : entry.subgroup.title"
      >
        <li v-if="entry.kind === 'page'">
          <RouterLink v-slot="{ href, navigate }" :to="entry.page.url" custom>
            <a
              class="doc-page-list__link"
              :class="{ 'doc-page-list__link--current': isCurrent(entry.page, currentPath) }"
              :href="href"
              :aria-current="isCurrent(entry.page, currentPath) ? 'page' : undefined"
              @click="navigate"
              >{{ entry.page.title }}</a
            >
          </RouterLink>
        </li>
        <li v-else class="doc-page-list__subgroup">
          <p class="doc-page-list__sublabel">
            {{ entry.subgroup.title }}
          </p>
          <ol
            class="doc-page-list__pages doc-page-list__pages--nested"
            :aria-label="entry.subgroup.title"
          >
            <li v-for="page in entry.subgroup.pages" :key="page.path">
              <RouterLink v-slot="{ href, navigate }" :to="page.url" custom>
                <a
                  class="doc-page-list__link"
                  :class="{ 'doc-page-list__link--current': isCurrent(page, currentPath) }"
                  :href="href"
                  :aria-current="isCurrent(page, currentPath) ? 'page' : undefined"
                  @click="navigate"
                  >{{ page.title }}</a
                >
              </RouterLink>
            </li>
          </ol>
        </li>
      </template>
    </ol>
  </nav>
  <p class="doc-page-list__external">
    <a :href="CHANGELOG_URL" target="_blank" rel="noopener noreferrer"
      >What's new (online only)
      <span aria-hidden="true">↗</span>
      <span class="sr-only">(opens in a new tab)</span></a
    >
  </p>
</template>

<style scoped>
.doc-page-list__label {
  margin: 0;
  padding: 18px 16px 8px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-page-list__pages {
  margin: 0;
  padding: 0;
  list-style: none;
}

.doc-page-list__link {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 9px 16px;
  border-left: 2px solid transparent;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-value);
  font-weight: 500;
  line-height: 1.35;
  color: var(--ink);
  text-decoration: none;
}

.doc-page-list__link:hover {
  background: var(--hover-surface);
}

.doc-page-list__link--current {
  font-weight: 600;
  color: var(--ink-strong);
  border-left-color: var(--accent-text);
  background: rgba(var(--accent-rgb), 0.08);
}

.doc-page-list__sublabel {
  margin: 0;
  padding: 14px 16px 4px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-page-list__pages--nested {
  padding-left: 12px;
}

.doc-page-list__pages--nested .doc-page-list__link {
  font-size: var(--settings-text-body);
}

.doc-page-list__external {
  margin: 14px 0 0;
  padding: 0 16px 24px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
}

.doc-page-list__external a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  color: var(--accent-text-deep);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
