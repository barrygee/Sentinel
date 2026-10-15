<script setup lang="ts">
import BaseIconLink from '@sentinel/ui/base/BaseIconLink.vue'
import DocsGroupIcon from './DocsGroupIcon.vue'
import type { DocGroupKey, DocsGroup } from './docsTypes'

/**
 * The charcoal icon rail of docs groups. Each entry is a *link* to its group's
 * first page, not a toggle: it changes the URL, so middle-click and
 * open-in-new-tab work. The current group carries `aria-current="true"` (the
 * current *page* is a child of it, so `page` would be wrong).
 */
defineProps<{
  groups: readonly DocsGroup[]
  /** The group of the page on screen; undefined when none is (not found). */
  activeGroupKey?: DocGroupKey | undefined
}>()
</script>

<template>
  <nav class="doc-rail theme-dark" aria-label="Documentation sections">
    <ul>
      <li v-for="group in groups" :key="group.key">
        <RouterLink v-slot="{ href, navigate }" :to="group.pages[0]?.url ?? '/doc/'" custom>
          <BaseIconLink
            class="doc-rail__item"
            :href="href"
            :accessible-name="group.title"
            :tooltip="group.title"
            :active="group.key === activeGroupKey"
            :current="group.key === activeGroupKey"
            @click="navigate"
          >
            <DocsGroupIcon :group-key="group.key" />
          </BaseIconLink>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* The same charcoal rail as Settings': pinned dark in either app theme. */
.doc-rail {
  width: 48px;
  flex-shrink: 0;
  background: var(--rail-bg);
  border-right: 1px solid var(--rail-border);
}

.doc-rail ul {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
