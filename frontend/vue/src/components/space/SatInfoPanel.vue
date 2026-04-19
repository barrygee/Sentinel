<template>
  <div id="sat-info-panel" v-if="visible">
    <!-- Satellite detail panel — populated in Phase 4 -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const visible = ref(false)
</script>
