<template>
  <div class="settings-source-override-wrap">
    <div class="settings-source-override-group" role="radiogroup" aria-label="Data source override">
      <BasePillToggle
        v-for="(opt, optionIndex) in OPTIONS"
        :key="opt"
        class="settings-source-override-btn"
        role="radio"
        :aria-checked="current === opt"
        :tabindex="overrideKeyboard.radioTabindex(optionIndex)"
        :active="current === opt"
        active-class="is-active"
        :data-value="opt"
        @click="select(opt)"
        @keydown="overrideKeyboard.onRadioKeydown($event, optionIndex)"
      >
        {{ opt === 'offgrid' ? 'OFF GRID' : opt.toUpperCase() }}
      </BasePillToggle>
    </div>
    <div v-if="current !== 'auto'" class="settings-source-override-note">
      This overrides the app-level connectivity mode setting.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BasePillToggle from '@/components/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@/composables/useRadioGroupKeyboard'
import * as settingsApi from '@/services/settingsApi'

const props = defineProps<{ ns: string }>()
const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const OPTIONS = ['auto', 'online', 'offgrid'] as const
type OverrideOpt = (typeof OPTIONS)[number]

const LS_KEY = `sentinel_${props.ns}_sourceOverride`
const current = ref<OverrideOpt>('auto')

try {
  current.value = (localStorage.getItem(LS_KEY) as OverrideOpt) ?? 'auto'
} catch {}

onMounted(async () => {
  const data = await settingsApi.getNamespace(props.ns)
  if (data?.sourceOverride && data.sourceOverride !== current.value) {
    current.value = data.sourceOverride as OverrideOpt
    try {
      localStorage.setItem(LS_KEY, current.value)
    } catch {}
  }
})

function select(opt: OverrideOpt): void {
  if (current.value === opt) return
  current.value = opt
  emit('stage', () => {
    try {
      localStorage.setItem(LS_KEY, current.value)
    } catch {}
    settingsApi.put(props.ns, 'sourceOverride', current.value)
    window.dispatchEvent(new CustomEvent('sentinel:sourceOverrideChanged'))
  })
}

// Radio-group keyboard model for the override pills; arrow keys run the same
// select() path (stage + persist) as a click.
const overrideKeyboard = useRadioGroupKeyboard({
  optionCount: () => OPTIONS.length,
  selectedIndex: () => OPTIONS.indexOf(current.value),
  select: (optionIndex) => select(OPTIONS[optionIndex]!),
})
</script>
