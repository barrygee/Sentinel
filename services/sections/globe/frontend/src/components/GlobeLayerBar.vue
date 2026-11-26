<script setup lang="ts">
/**
 * The globe's layer toggles: one chip per live layer, pressed while the layer
 * shows, with how many objects it holds. Turning a layer off hides it at once
 * and stops asking the feed for it.
 */
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import { DRAWN_LAYERS, type DrawnLayerId } from '../feeds/globeFeedTypes'

defineProps<{
  /** Which layers are on. */
  visible: Record<DrawnLayerId, boolean>
  /** Objects per layer; null while unknown (off, loading or unavailable). */
  counts: Record<DrawnLayerId, number | null>
}>()

const emit = defineEmits<{
  /** The viewer flipped a layer. */
  toggle: [layer: DrawnLayerId, visible: boolean]
}>()

const LABELS: Readonly<Record<DrawnLayerId, string>> = { air: 'Air', sea: 'Sea', aprs: 'APRS' }
</script>

<template>
  <div class="globe-layer-bar" role="group" aria-label="Globe layers">
    <BaseChip
      v-for="layer in DRAWN_LAYERS"
      :key="layer"
      :active="visible[layer]"
      :aria-pressed="visible[layer]"
      @click="emit('toggle', layer, !visible[layer])"
    >
      {{ LABELS[layer] }}
      <span v-if="visible[layer] && counts[layer] !== null" class="globe-layer-count">
        {{ counts[layer]!.toLocaleString('en-GB') }}
      </span>
    </BaseChip>
  </div>
</template>

<style scoped>
.globe-layer-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  /* A backing behind the chips' translucent fills, so they read over bright land. */
  padding: 6px;
  background: rgba(13, 15, 20, 0.85);
  border-radius: 2px;
}

.globe-layer-count {
  margin-left: 8px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
</style>
