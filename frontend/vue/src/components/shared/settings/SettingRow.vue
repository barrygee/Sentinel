<template>
  <div
    class="settings-item"
    :class="{
      'settings-item--half': control.layout === 'half',
      'settings-item--half-stacked': control.layout === 'half-stacked',
      'settings-item--full': control.layout === 'full',
      'settings-item--natural-height': control.naturalHeight,
      'settings-item--headless': item.hideLabel && !item.desc,
    }"
  >
    <div class="settings-item-info">
      <SettingItemToggle
        v-if="collapsible"
        :label="item.label"
        :expanded="expanded"
        :controls-id="bodyId"
        @toggle="toggle"
      />
      <div v-else class="settings-item-label" :class="{ 'sr-only': item.hideLabel }">
        {{ item.label }}
      </div>
      <div v-if="item.desc" class="settings-item-desc">{{ item.desc }}</div>
      <DocLink v-if="item.docPath" :doc-path="item.docPath" :setting-label="item.label" />
    </div>
    <!-- The control the owning section registered for this item (F3). Only the
         panel events it declares are listened for: `stage` hands APPLY CHANGES
         a closure, `commit` applies now. A collapsible card hides it with
         v-show, so it stays mounted and keeps loading what it shows. -->
    <div v-if="collapsible" v-show="expanded" :id="bodyId" class="settings-item-body">
      <component :is="control.component" v-bind="control.props" v-on="listeners" />
    </div>
    <component :is="control.component" v-else v-bind="control.props" v-on="listeners" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SettingItem } from '@sentinel/shell-api/types/settings'
import DocLink from '@sentinel/shell-api/settings/DocLink.vue'
import SettingItemToggle from './SettingItemToggle.vue'

const props = defineProps<{
  item: SettingItem
  pending: Map<string, () => Promise<unknown> | void>
  /** Open a collapsible card to begin with (search results show what matched). */
  startOpen?: boolean
}>()
const emit = defineEmits<{
  stage: [id: string, fn: () => Promise<unknown> | void]
  commit: []
}>()

const control = props.item.control

const collapsible = control.collapsible
const bodyId = `settings-item-body-${props.item.id}`
// The user's own open/fold, once they have used the toggle; until then the
// card is open while its control says it is needed (or a search found it).
const toggledOpen = ref<boolean | null>(null)
const expanded = computed(
  () => toggledOpen.value ?? (props.startOpen || (collapsible?.openWhen?.() ?? false)),
)
function toggle(): void {
  toggledOpen.value = !expanded.value
}

const listeners: Record<string, (...args: never[]) => void> = {}
if (control.emits?.includes('stage')) {
  listeners.stage = (fn: () => Promise<unknown> | void) => emit('stage', props.item.id, fn)
}
if (control.emits?.includes('commit')) {
  listeners.commit = () => emit('commit')
}
</script>
