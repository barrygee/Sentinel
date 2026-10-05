<template>
  <!-- Sea FILTER rail sub-tab glyphs: the same hull glyphs the Sea map's own
       rail uses, at the rail's 19px. Decorative: the rail button carries the
       accessible name. -->
  <SeaFamilyGlyph v-if="isSeaFilterCategory(category)" :category="category" :size="19" />
  <UnknownCategoryGlyph v-else />
</template>

<script setup lang="ts">
// Registered with the shell's sidebar registry as Sea's sub-tab icon
// (components/sea/seaSidebarFilter.ts).
import UnknownCategoryGlyph from '@sentinel/ui/icons/UnknownCategoryGlyph.vue'
import SeaFamilyGlyph from './SeaFamilyGlyph.vue'
import { isSeaFilterCategory } from '@/utils/aisShipType'

defineProps<{ category: string }>()
</script>
