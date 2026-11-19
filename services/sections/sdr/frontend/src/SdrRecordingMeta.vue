<template>
  <dl class="sdr-recording-meta">
    <div class="sdr-recording-meta-row">
      <dt>Date</dt>
      <dd>{{ date }}</dd>
    </div>
    <div class="sdr-recording-meta-row">
      <dt>Duration</dt>
      <dd>{{ duration }}</dd>
    </div>
    <div class="sdr-recording-meta-row">
      <dt>Size</dt>
      <dd>{{ size }}</dd>
    </div>
  </dl>
</template>

<script setup lang="ts">
/** A recording row's labelled Date / Duration / Size rows, values already formatted. */
import './SdrRecordingMeta.css'

defineProps<{
  date: string
  duration: string
  size: string
}>()
</script>
