<script setup lang="ts">
/**
 * The known-frequency markers along the top of the spectrum: a dot per saved
 * frequency in view (or a counted dot where several would overlap), a name tag
 * on the one the radio is tuned to, and a name popover on click or hover. The
 * popover state lives in `useKnownFrequencyMarkers`; this renders it and
 * reports the presses.
 */
import './SdrKnownFrequencyMarkers.css'
import type { StyleValue } from 'vue'
import type { KnownFreqMarker } from './composables/useKnownFrequencyMarkers'

defineProps<{
  markers: KnownFreqMarker[]
  /** The marker whose popover is pinned open by a click, if any. */
  openKey: string | null
  isPopoverShown: (key: string) => boolean
  /** Insets matching the spectrum's data box. */
  overlayStyle: StyleValue
}>()

const emit = defineEmits<{
  toggle: [key: string]
  pointerEnter: [event: PointerEvent, key: string]
  pointerLeave: [key: string]
}>()
</script>

<template>
  <div class="sdr-wf-known-overlay" :style="overlayStyle">
    <div
      v-for="marker in markers"
      :key="marker.key"
      class="sdr-wf-known-marker"
      :class="{
        'sdr-wf-known-marker--open': openKey === marker.key,
        'sdr-wf-known-marker--tuned': marker.tunedLabel !== null,
      }"
      :style="{ left: marker.leftPct + '%' }"
    >
      <button
        type="button"
        class="sdr-wf-known-marker-dot"
        :aria-label="marker.isCluster ? `${marker.count} known frequencies` : marker.label"
        :aria-expanded="openKey === marker.key"
        @click="emit('toggle', marker.key)"
        @pointerenter="emit('pointerEnter', $event, marker.key)"
        @pointerleave="emit('pointerLeave', marker.key)"
      >
        <svg
          class="sdr-wf-known-marker-glyph"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          overflow="visible"
          aria-hidden="true"
        >
          <!-- Just the green dot of the SENTINEL ⊙ mark — no outer ring. -->
          <circle cx="7" cy="7" r="2.8" fill="#c8ff00" />
        </svg>
        <span v-if="marker.isCluster" class="sdr-wf-known-marker-badge">{{ marker.count }}</span>
      </button>
      <span
        v-if="marker.tunedLabel !== null && !isPopoverShown(marker.key)"
        class="sdr-wf-known-marker-tag"
        >{{ marker.tunedLabel }}</span
      >
      <div v-if="isPopoverShown(marker.key)" class="sdr-wf-known-marker-pop" role="tooltip">
        <template v-if="marker.isCluster">
          <span
            v-for="member in marker.members"
            :key="member.id"
            class="sdr-wf-known-marker-pop-line"
            >{{ member.label }}</span
          >
        </template>
        <span v-else class="sdr-wf-known-marker-pop-line">{{ marker.label }}</span>
      </div>
    </div>
  </div>
</template>
