<template>
  <div class="settings-source-override-wrap">
    <div class="settings-source-override-group">
      <button
        v-for="opt in OPTIONS"
        :key="opt.value"
        class="settings-source-override-btn"
        :class="{ 'is-active': current === opt.value }"
        @click="select(opt.value)"
      >{{ opt.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as settingsApi from '@/services/settingsApi'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const LS_KEY = 'sentinel_space_filterHoverPreview'
const OPTIONS: Array<{ value: 'stay' | 'fly'; label: string }> = [
  { value: 'stay', label: 'STAY IN PLACE' },
  { value: 'fly',  label: 'FLY TO SATELLITE' },
]

const current = ref<'stay' | 'fly'>('stay')

try {
  const saved = localStorage.getItem(LS_KEY) as 'stay' | 'fly' | null
  if (saved === 'fly' || saved === 'stay') current.value = saved
} catch {}

onMounted(async () => {
  const data = await settingsApi.getNamespace('space')
  if (data?.filterHoverPreview === 'fly' || data?.filterHoverPreview === 'stay') {
    current.value = data.filterHoverPreview as 'stay' | 'fly'
    try { localStorage.setItem(LS_KEY, current.value) } catch {}
  }
})

function select(val: 'stay' | 'fly'): void {
  if (current.value === val) return
  current.value = val
  emit('stage', () => {
    try { localStorage.setItem(LS_KEY, current.value) } catch {}
    settingsApi.put('space', 'filterHoverPreview', current.value)
  })
}
</script>
