<template>
  <div class="sdr-recordings-search-wrap">
    <input
      v-model="filterText"
      class="sdr-recordings-search-input"
      type="text"
      aria-label="Filter recordings by notes or mode"
      placeholder="NOTES · MODE"
      autocomplete="off"
      spellcheck="false"
    />
    <BaseIconAction
      v-if="filterText"
      class="sdr-recordings-search-clear"
      accessible-name="Clear filter"
      @click="filterText = ''"
    >
      ✕
    </BaseIconAction>
  </div>
</template>

<script setup lang="ts">
/**
 * The RECORDINGS tab's pinned filter box (NOTES · MODE) with its clear button.
 * Only the list below it scrolls.
 */
import './SdrRecordingsFilter.css'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'

const filterText = defineModel<string>({ required: true })
</script>
