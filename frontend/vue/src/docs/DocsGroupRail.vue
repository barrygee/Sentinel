<script setup lang="ts">
import BaseIconLink from '@sentinel/ui/base/BaseIconLink.vue'
import SectionIcon from '@/components/shared/SectionIcon.vue'
import { useOfferedSettingsSections } from '@/composables/useOfferedSettingsSections'
import DocsGroupIcon from './DocsGroupIcon.vue'
import type { DocGroupKey, DocsGroup } from './docsTypes'

/**
 * The charcoal rail beside the docs: the same Settings buttons as the
 * Settings page (each a link back to that section's settings), then Docs,
 * shown as the current area, with the docs groups as its sub-buttons on the
 * grey sub-panel, the way FILTER's sub-buttons sit under it in the map
 * sidebar. So the Settings buttons never change meaning on a docs page.
 *
 * Every entry is a *link*, not a toggle: middle-click and open-in-new-tab
 * work. The current group carries `aria-current="true"` (the current *page*
 * is a child of it, so `page` would be wrong).
 */
defineProps<{
  groups: readonly DocsGroup[]
  /** The group of the page on screen; undefined when none is (not found). */
  activeGroupKey?: DocGroupKey | undefined
}>()

const { offeredSections } = useOfferedSettingsSections()
</script>

<template>
  <div class="doc-rail theme-dark">
    <nav aria-label="Settings sections">
      <ul>
        <li v-for="section in offeredSections" :key="section.key">
          <RouterLink v-slot="{ href, navigate }" :to="`/settings/${section.key}`" custom>
            <BaseIconLink
              class="doc-rail__item"
              :href="href"
              :accessible-name="section.label"
              :tooltip="section.label"
              @click="navigate"
            >
              <SectionIcon :section-key="section.key" />
            </BaseIconLink>
          </RouterLink>
        </li>
        <li>
          <RouterLink v-slot="{ href, navigate }" to="/doc/" custom>
            <BaseIconLink
              class="doc-rail__item doc-rail__docs"
              :href="href"
              accessible-name="Docs (documentation)"
              tooltip="DOCS"
              :active="true"
              @click="navigate"
            >
              <SectionIcon section-key="docs" />
            </BaseIconLink>
          </RouterLink>
        </li>
      </ul>
    </nav>
    <nav class="doc-rail__groups" aria-label="Documentation sections">
      <ul>
        <li v-for="group in groups" :key="group.key">
          <RouterLink v-slot="{ href, navigate }" :to="group.pages[0]?.url ?? '/doc/'" custom>
            <BaseIconLink
              class="doc-rail__item doc-rail__group"
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
  </div>
</template>

<style scoped>
/* The same charcoal rail as Settings': pinned dark in either app theme. */
.doc-rail {
  width: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: none;
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

/* Docs sits under the section buttons, set off by a hairline, as in Settings. */
.doc-rail__docs {
  border-top: 1px solid var(--rail-border);
}

/* Docs' sub-buttons: the grey sub-panel IconRailAccordion uses under FILTER and
   MAP LAYERS, with smaller icons so they read as children of Docs. */
.doc-rail__groups {
  background: var(--rail-surface);
}

.doc-rail__group :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
