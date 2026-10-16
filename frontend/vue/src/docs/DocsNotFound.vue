<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DocsSearchField from './DocsSearchField.vue'

/**
 * Body of the "page not found" view. The URL stays as typed so it can be
 * corrected; the reader is offered the welcome page and a search box, focused,
 * with the last part of the address filled in as a first guess.
 */
const props = defineProps<{
  /** The address the reader asked for, below `/docs/`. */
  requestedPath: string
}>()

const emit = defineEmits<{ search: [query: string] }>()

const searchRef = ref<InstanceType<typeof DocsSearchField> | null>(null)

/** "use/sdr/record" -> "record": the part most likely to be searched for. */
const guess = props.requestedPath.split('/').filter(Boolean).pop() ?? ''

onMounted(() => {
  searchRef.value?.focus()
  searchRef.value?.select()
})
</script>

<template>
  <div class="doc-not-found">
    <p>
      There's no page at <code>/docs/{{ requestedPath }}</code
      >. It may have moved.
    </p>
    <p>
      <RouterLink to="/docs/">Welcome to Sentinel</RouterLink>
    </p>
    <p class="doc-not-found__prompt">Or search for it:</p>
    <DocsSearchField
      ref="searchRef"
      class="doc-not-found__search"
      :model-value="guess"
      :shortcut="false"
      :landmark="false"
      @update:model-value="emit('search', $event)"
    />
  </div>
</template>

<style scoped>
.doc-not-found {
  max-width: var(--doc-measure, 720px);
  padding-top: 18px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--doc-text-body);
  line-height: var(--doc-line);
  color: var(--ink);
}

.doc-not-found p {
  margin: 0 0 14px;
}

.doc-not-found a {
  color: var(--accent-text-deep);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.doc-not-found code {
  padding: 1px 5px;
  background: var(--surface);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.88em;
  color: var(--ink-strong);
  overflow-wrap: anywhere;
}

.doc-not-found__search {
  max-width: 420px;
}
</style>
