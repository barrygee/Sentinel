<template>
  <!-- AIR side menu — overlay controls panel (right side of map).
       Buttons wired to overlay states in Phase 3 when controls are ported. -->
  <div id="side-menu">
    <!-- Controls injected here in Phase 3 -->
  </div>
</template>

<script setup lang="ts">
import { useAirStore } from '@/stores/air'
const airStore = useAirStore()
</script>
