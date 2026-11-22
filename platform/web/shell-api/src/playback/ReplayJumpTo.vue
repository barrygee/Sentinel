<template>
  <form class="replay-jump" @submit.prevent="submit">
    <BaseTextField
      v-model="draft"
      class="replay-jump-field"
      label="GO TO (UTC)"
      input-type="datetime-local"
      :min="toUtcInputValue(rangeStart)"
      :max="toUtcInputValue(rangeEnd)"
      step="60"
    />
    <BaseButton
      class="replay-jump-go"
      variant="ghost"
      type="submit"
      aria-label="Go to this date and time"
    >
      GO
    </BaseButton>
  </form>
</template>

<script setup lang="ts">
/**
 * Jump straight to a date and time, typed in UTC, with the app's text field
 * and button. Out-of-range moments are clamped by whoever handles `seek`.
 */
import { ref, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
import { fromUtcInputValue, toUtcInputValue } from '@sentinel/ui/utils/playbackTime'

const props = defineProps<{ rangeStart: number; rangeEnd: number; momentMs: number }>()
const emit = defineEmits<{ seek: [epochMs: number] }>()

const draft = ref(toUtcInputValue(props.momentMs))
let editing = false

// Follow the moment to each new minute, but not while someone is typing.
watch(
  () => Math.floor(props.momentMs / 60_000),
  () => {
    if (!editing) draft.value = toUtcInputValue(props.momentMs)
  },
)
watch(draft, (value) => {
  editing = value !== toUtcInputValue(props.momentMs)
})

function submit(): void {
  const epochMs = fromUtcInputValue(draft.value)
  if (epochMs === null) return
  editing = false
  emit('seek', epochMs)
}
</script>

<style scoped>
.replay-jump {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0;
}
.replay-jump-field {
  flex: 1;
  min-width: 0;
}
.replay-jump-field :deep(input) {
  color-scheme: dark light;
}
</style>
