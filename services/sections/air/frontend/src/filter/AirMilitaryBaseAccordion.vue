<template>
  <!-- The base data carries no frequencies, so there is no tuning section. -->
  <div class="apt-acc-body">
    <AirLocationGrid :coords="base.coords" />
  </div>
</template>

<script setup lang="ts">
/** An expanded military base row in the Air FILTER pane: its location. */
import AirLocationGrid from './AirLocationGrid.vue'
import type { MilResult } from './airFilterTypes'
import './AirAccordionBody.css'

defineProps<{ base: MilResult }>()
</script>
