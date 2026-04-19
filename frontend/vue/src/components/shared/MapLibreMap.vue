<template>
  <div ref="containerRef" class="map-container" />
</template>

<script setup lang="ts">
// IMPORTANT: The MapLibre Map instance is stored as a plain module-level variable.
// Never put it in ref() or reactive() — Vue's Proxy wrapping breaks WebGL internals.
import { ref, onMounted, onUnmounted } from 'vue'
import maplibregl, { type Map, type StyleSpecification } from 'maplibre-gl'

const props = defineProps<{
  styleUrl: string
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
}>()

const emit = defineEmits<{
  'map-created': [map: Map]
  'map-removed': []
  'style-loaded': [map: Map]
}>()

const containerRef = ref<HTMLElement | null>(null)

let map: Map | null = null

onMounted(() => {
  if (!containerRef.value) return
  map = new maplibregl.Map({
    container: containerRef.value,
    style: props.styleUrl,
    center: props.center ?? [0, 51.5],
    zoom: props.zoom ?? 6,
    pitch: props.pitch ?? 0,
    bearing: props.bearing ?? 0,
    attributionControl: false,
  })

  map.on('style.load', () => {
    if (map) emit('style-loaded', map)
  })

  emit('map-created', map)
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
    emit('map-removed')
  }
})

function getMap(): Map | null { return map }

defineExpose({ getMap })
</script>

<style>
.map-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
