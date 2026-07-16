<template>
  <div class="settings-source-override-wrap">
    <div
      class="settings-source-override-group"
      role="radiogroup"
      aria-label="Hover preview behaviour"
    >
      <BasePillToggle
        v-for="(opt, optionIndex) in OPTIONS"
        :key="opt.value"
        class="settings-source-override-btn"
        role="radio"
        :aria-checked="current === opt.value"
        :tabindex="hoverPreviewKeyboard.radioTabindex(optionIndex)"
        :active="current === opt.value"
        active-class="is-active"
        @click="select(opt.value)"
        @keydown="hoverPreviewKeyboard.onRadioKeydown($event, optionIndex)"
      >
        {{ opt.label }}
      </BasePillToggle>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BasePillToggle from '@/components/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@/composables/useRadioGroupKeyboard'
import * as settingsApi from '@/services/settingsApi'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const LS_KEY = 'sentinel_space_filterHoverPreview'
const OPTIONS: Array<{ value: 'stay' | 'fly'; label: string }> = [
  { value: 'stay', label: 'STAY IN PLACE' },
  { value: 'fly', label: 'FLY TO SATELLITE' },
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
    try {
      localStorage.setItem(LS_KEY, current.value)
    } catch {}
  }
})

function select(val: 'stay' | 'fly'): void {
  if (current.value === val) return
  current.value = val
  emit('stage', () => {
    try {
      localStorage.setItem(LS_KEY, current.value)
    } catch {}
    settingsApi.put('space', 'filterHoverPreview', current.value)
  })
}

// Radio-group keyboard model for the preview pills; arrow keys run the same
// select() path (stage + persist) as a click.
const hoverPreviewKeyboard = useRadioGroupKeyboard({
  optionCount: () => OPTIONS.length,
  selectedIndex: () => OPTIONS.findIndex((option) => option.value === current.value),
  select: (optionIndex) => select(OPTIONS[optionIndex]!.value),
})
</script>
