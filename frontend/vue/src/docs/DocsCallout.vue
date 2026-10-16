<script setup lang="ts">
import { computed } from 'vue'
import type { CalloutVariant } from './markdown/docBlocks'

/**
 * A note in the page: NOTE, TIP, IMPORTANT, WARNING or CAUTION (the GitHub
 * alert kinds, so the same markdown reads right on GitHub). Square, with a bar
 * on the left and a captioned label, so the kind is stated in words as well as
 * colour. The body text is always the normal ink, never the bar colour.
 */
const props = defineProps<{ variant: CalloutVariant }>()

const label = computed(() => props.variant.toUpperCase())
const showWarningGlyph = computed(() => props.variant === 'warning' || props.variant === 'caution')
</script>

<template>
  <aside class="doc-callout" :class="`doc-callout--${variant}`" role="note">
    <p class="doc-callout__label">
      <svg
        v-if="showWarningGlyph"
        class="doc-callout__glyph"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="6.2" stroke="currentColor" stroke-width="1.4" />
        <line
          x1="7"
          y1="3.8"
          x2="7"
          y2="7.6"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <circle cx="7" cy="10" r="0.9" fill="currentColor" />
      </svg>
      <span v-else class="doc-callout__dot" aria-hidden="true"></span>
      {{ label }}
    </p>
    <div class="doc-callout__body">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.doc-callout {
  --doc-callout-bar: var(--accent-text);
  --doc-callout-wash: rgba(var(--accent-rgb), 0.08);
  max-width: var(--doc-measure, 720px);
  margin: 0 0 18px;
  padding: 14px 18px;
  background: var(--doc-callout-wash);
  color: var(--ink);
}

.doc-callout--warning {
  --doc-callout-bar: var(--sev-warn);
  --doc-callout-wash: rgba(240, 196, 25, 0.14);
}

.doc-callout--caution {
  --doc-callout-bar: var(--danger);
  --doc-callout-wash: var(--danger-soft);
}

.doc-callout__label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  /* Caption text uses the ink, not the bar: yellow text would fail contrast. */
  color: rgba(var(--ink-rgb), 0.78);
}

.doc-callout__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--doc-callout-bar);
}

.doc-callout__glyph {
  color: var(--ink-strong);
  flex-shrink: 0;
}

.doc-callout__body :deep(p) {
  margin: 0 0 8px;
  font-size: var(--doc-text-body);
  line-height: var(--doc-line);
}

.doc-callout__body :deep(> :last-child) {
  margin-bottom: 0;
}

.doc-callout__body :deep(a) {
  color: var(--accent-text-deep);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
