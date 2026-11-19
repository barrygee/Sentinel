<template>
  <BaseIconAction
    class="sdr-search-adhoc-play"
    :active="running"
    active-class="sdr-search-adhoc-play--active"
    :disabled="disabled"
    :accessible-name="label"
    :title="label"
  >
    <SdrPlayStopIcon :stop="running" />
  </BaseIconAction>
</template>

<script setup lang="ts">
/**
 * The square start/stop button of the SCANNER and SEARCH accordions: an accent
 * play triangle, red with a stop square while its sweep runs. The click falls
 * through to the button.
 */
import './SdrSweepPlayButton.css'
import { computed } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import SdrPlayStopIcon from './SdrPlayStopIcon.vue'

const props = defineProps<{
  /** What the button starts, for its name: "Start scan" / "Stop scan". */
  sweepName: 'scan' | 'search'
  running: boolean
  disabled: boolean
}>()

const label = computed(() => `${props.running ? 'Stop' : 'Start'} ${props.sweepName}`)
</script>
