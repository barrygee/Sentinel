<script setup lang="ts">
/**
 * The stack of per-layer notices over the globe: why a layer is empty, or
 * that the feed isn't answering. Each can be closed for the rest of the
 * visit; a notice with a new reason shows again.
 */
import { computed, ref } from 'vue'
import type { LayerNotice } from '../feeds/layerNotices'
import GlobeUnavailableNotice from './GlobeUnavailableNotice.vue'

const props = defineProps<{
  notices: LayerNotice[]
}>()

const dismissed = ref(new Set<string>())
const shown = computed(() => props.notices.filter((notice) => !dismissed.value.has(notice.id)))

function dismiss(id: string): void {
  dismissed.value = new Set([...dismissed.value, id])
}
</script>

<template>
  <div v-if="shown.length" class="globe-layer-notices">
    <GlobeUnavailableNotice
      v-for="notice in shown"
      :key="notice.id"
      :message="notice.message"
      placement="inline"
      dismissible
      @dismiss="dismiss(notice.id)"
    />
  </div>
</template>

<style scoped>
.globe-layer-notices {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  max-width: min(520px, 100%);
}
</style>
