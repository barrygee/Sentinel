<script setup lang="ts">
/**
 * "Group > Page" above the heading. The group is a link; the last item is the
 * current page and is not.
 */
defineProps<{
  trail: ReadonlyArray<{ label: string; to?: string }>
}>()
</script>

<template>
  <nav class="doc-breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li v-for="(item, index) in trail" :key="item.label">
        <!-- aria-current is cleared: when a crumb points at the page being read
             (a group's first page, "Docs" on the search page) the router would
             also flag it, leaving two "current page" items. Only the last is. -->
        <RouterLink
          v-if="item.to && index < trail.length - 1"
          :to="item.to"
          :aria-current="undefined"
          >{{ item.label }}</RouterLink
        >
        <span v-else aria-current="page">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.doc-breadcrumb ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(var(--ink-rgb), 0.62);
}

.doc-breadcrumb li + li::before {
  content: '\203A';
  margin-right: 8px;
}

.doc-breadcrumb a {
  color: inherit;
  text-decoration: none;
}

.doc-breadcrumb a:hover {
  color: var(--ink-strong);
  text-decoration: underline;
}
</style>
