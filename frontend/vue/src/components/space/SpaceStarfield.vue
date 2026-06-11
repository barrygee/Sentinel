<template>
  <canvas id="space-starfield" ref="canvasRef" />
</template>

<script setup lang="ts">
// Parallax starfield canvas — replicates space-boot.ts starfield rendering.
// Stars shift slightly as the map pans/rotates for depth effect.
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

interface Star {
  x: number
  y: number
  r: number
  opacity: number
}
let stars: Star[] = []

function resize() {
  const canvas = canvasRef.value
  /* v8 ignore start -- defensive: canvasRef is always populated after mount, the
     only context resize() runs in (onMounted + the window listener it adds). */
  if (!canvas) return
  /* v8 ignore stop */
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  draw()
}

function draw(offsetX = 0, offsetY = 0) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const s of stars) {
    ctx.beginPath()
    ctx.arc(
      (((s.x + offsetX * 0.04) % canvas.width) + canvas.width) % canvas.width,
      (((s.y + offsetY * 0.04) % canvas.height) + canvas.height) % canvas.height,
      s.r,
      0,
      Math.PI * 2,
    )
    ctx.fillStyle = `rgba(255,255,255,${s.opacity})`
    ctx.fill()
  }
}

function init() {
  const canvas = canvasRef.value
  /* v8 ignore start -- defensive: init() only runs from onMounted, where
     canvasRef is already populated. */
  if (!canvas) return
  /* v8 ignore stop */
  stars = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.2 + 0.2,
    opacity: Math.random() * 0.7 + 0.15,
  }))
  draw()
}

onMounted(() => {
  resize()
  init()
  window.addEventListener('resize', resize)
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
})

defineExpose({ draw })
</script>

<style>
#space-starfield {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}
</style>
