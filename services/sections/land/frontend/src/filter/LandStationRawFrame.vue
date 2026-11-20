<template>
  <!-- The raw frame runs to several wrapped lines and is reference material,
       not something to read at a glance, so it collapses. -->
  <div class="land-filter-raw">
    <button
      type="button"
      class="land-filter-raw-toggle"
      :aria-expanded="expanded"
      :aria-controls="RAW_BODY_ID"
      @click.stop="expanded = !expanded"
    >
      <span class="land-filter-raw-label">RAW</span>
      <!-- Rotated by CSS, like the row chevron above, rather than by the
           icon's own `open` prop: that flips down to up, where a disclosure in
           this panel points right when closed and down when open. -->
      <span class="land-filter-raw-chevron" :class="{ open: expanded }">
        <ChevronIcon />
      </span>
    </button>
    <div v-if="expanded" :id="RAW_BODY_ID" class="land-filter-raw-body">
      {{ raw ?? '—' }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * LandStationRawFrame — the RAW disclosure under an expanded APRS station:
 * the frame exactly as received, collapsed until asked for.
 *
 * It starts closed on every mount. The FILTER pane renders an accordion only
 * while its row is expanded, so opening a different station (or the same one
 * again) always shows the frame folded away.
 */
import { ref } from 'vue'
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'

defineProps<{
  /** The raw APRS frame, or null when the station carried none. */
  raw: string | null
}>()

// Only one station is open at a time, so one fixed id is unique in the pane.
const RAW_BODY_ID = 'land-filter-raw-body'

const expanded = ref(false)
</script>

<style scoped>
.land-filter-raw {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* Set off from the fields above: it is a control, not another field. */
  padding: 12px 24px 14px;
}
/* Matches the data cells' own label, so the disclosure reads as another field
   in the section rather than a control bolted onto it. */
.land-filter-raw-toggle {
  display: flex;
  align-items: center;
  /* Full width with the chevron pushed to the far edge, so it lines up with
     the row chevron above rather than floating beside the label. */
  justify-content: space-between;
  width: 100%;
  gap: 6px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(var(--ink-rgb), 0.35);
}
.land-filter-raw-chevron {
  display: flex;
  align-items: center;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}
.land-filter-raw-chevron.open {
  transform: rotate(0deg);
}
.land-filter-raw-toggle:hover {
  color: rgba(var(--ink-rgb), 0.6);
}
.land-filter-raw-label {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
/* Declared to match a packet field's value exactly — same family, size,
   weight, line height, colour and spacing — so the frame reads as the same
   kind of text as the COMMENT above it, and in capitals like every other
   station value. */
.land-filter-raw-body {
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: normal;
  color: rgba(var(--ink-rgb), 0.82);
  word-break: break-word;
  text-transform: uppercase;
}
</style>
