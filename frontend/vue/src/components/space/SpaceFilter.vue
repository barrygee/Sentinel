<template>
  <div id="space-filter">
    <div id="space-filter-input-wrap">
      <input
        id="space-filter-input"
        type="text"
        placeholder="Search satellites…"
        :value="spaceStore.filterQuery"
        @input="spaceStore.setFilter(($event.target as HTMLInputElement).value)"
        autocomplete="off"
        spellcheck="false"
      />
      <button v-if="spaceStore.filterQuery" @click="spaceStore.setFilter('')">✕</button>
    </div>
    <div id="space-filter-results">
      <!-- Results rendered here in Phase 4 -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSpaceStore } from '@/stores/space'
const spaceStore = useSpaceStore()
</script>
