<template>
  <ul class="replay-legend" aria-label="Timeline shading">
    <li>
      <span class="replay-legend-swatch replay-legend-swatch--online" aria-hidden="true" />RECORDED
      ONLINE
    </li>
    <li>
      <span class="replay-legend-swatch replay-legend-swatch--offgrid" aria-hidden="true" />RECORDED
      OFF GRID
    </li>
  </ul>
</template>

<script setup lang="ts">
/** The key to the timeline's shading. */
</script>

<style scoped>
.replay-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-primary);
  font-size: 9px;
  letter-spacing: 0.14em;
  color: var(--ink-secondary);
}
.replay-legend li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.replay-legend-swatch {
  width: 10px;
  height: 3px;
  border-radius: 2px;
}
.replay-legend-swatch--online {
  background: rgba(var(--accent-rgb), 0.55);
}
.replay-legend-swatch--offgrid {
  background: rgba(var(--warn-rgb), 0.7);
}
</style>
