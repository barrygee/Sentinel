<template>
  <div id="msb-tracking-list">
    <div v-if="trackingStore.items.length === 0" id="msb-tracking-empty">No tracked items</div>
    <div
      v-for="item in trackingStore.items"
      :key="`${item.domain}-${item.id}`"
      class="msb-tracking-item"
      :data-domain="item.domain"
    >
      <div class="msb-tracking-name">{{ item.name }}</div>
      <div class="msb-tracking-fields">
        <span v-for="(val, key) in item.fields" :key="key" class="msb-tracking-field">
          <span class="msb-tracking-field-key">{{ key }}</span>
          <span class="msb-tracking-field-val">{{ val }}</span>
        </span>
      </div>
      <button class="msb-tracking-remove" @click="trackingStore.unregister(item.id, item.domain)">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTrackingStore } from '@/stores/tracking'
const trackingStore = useTrackingStore()
</script>
