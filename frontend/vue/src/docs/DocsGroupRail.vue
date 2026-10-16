<script setup lang="ts">
import BaseIconLink from '@sentinel/ui/base/BaseIconLink.vue'
import SectionIcon from '@/components/shared/SectionIcon.vue'
import { useOfferedSettingsSections } from '@/composables/useOfferedSettingsSections'

/**
 * The charcoal rail beside the docs: exactly the Settings rail, its section
 * buttons (each a link back to that section's settings) then Docs, shown as
 * the current area. The docs' own groups live in the sidebar's page list, so
 * nothing on this rail repeats a docs group.
 *
 * Every entry is a *link*, not a toggle: middle-click and open-in-new-tab work.
 */
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
  </div>
</template>

<style scoped>
/* The same charcoal rail as Settings': pinned dark in either app theme. */
.doc-rail {
  width: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
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
</style>
