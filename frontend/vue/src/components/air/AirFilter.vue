<template>
  <div id="air-filter" :class="{ 'air-filter-open': airStore.filterOpen }">
    <div id="air-filter-input-wrap">
      <input
        id="air-filter-input"
        type="text"
        placeholder="Search aircraft, airports…"
        :value="airStore.filterQuery"
        @input="airStore.setFilter(($event.target as HTMLInputElement).value)"
        autocomplete="off"
        spellcheck="false"
      />
      <button id="air-filter-clear" v-if="airStore.filterQuery" @click="airStore.setFilter('')">✕</button>
    </div>
    <div id="air-filter-results">
      <!-- Results rendered here in Phase 3 when AdsbControl feeds data -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAirStore } from '@/stores/air'
const airStore = useAirStore()
</script>
