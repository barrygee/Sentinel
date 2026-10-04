<template>
  <div
    class="settings-item"
    :class="{
      'settings-item--half': control.layout === 'half',
      'settings-item--half-stacked': control.layout === 'half-stacked',
      'settings-item--full': control.layout === 'full',
      'settings-item--natural-height': control.naturalHeight,
    }"
  >
    <div class="settings-item-info">
      <div class="settings-item-label" :class="{ 'sr-only': item.hideLabel }">{{ item.label }}</div>
      <div v-if="item.desc" class="settings-item-desc">{{ item.desc }}</div>
    </div>
    <!-- The control the owning section registered for this item (F3). Only the
         panel events it declares are listened for: `stage` hands APPLY CHANGES
         a closure, `commit` applies now. -->
    <component :is="control.component" v-bind="control.props" v-on="listeners" />
  </div>
</template>

<script setup lang="ts">
import type { SettingItem } from '@/types/settings'

const props = defineProps<{
  item: SettingItem
  pending: Map<string, () => Promise<unknown> | void>
}>()
const emit = defineEmits<{
  stage: [id: string, fn: () => Promise<unknown> | void]
  commit: []
}>()

const control = props.item.control

const listeners: Record<string, (...args: never[]) => void> = {}
if (control.emits?.includes('stage')) {
  listeners.stage = (fn: () => Promise<unknown> | void) => emit('stage', props.item.id, fn)
}
if (control.emits?.includes('commit')) {
  listeners.commit = () => emit('commit')
}
</script>
