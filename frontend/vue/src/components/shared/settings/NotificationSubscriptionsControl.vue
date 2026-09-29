<template>
  <div class="notification-subscriptions">
    <p v-if="subscriptions.length === 0" class="notification-subscriptions-empty">
      No alerts enabled
    </p>
    <template v-else>
      <!-- The description lives here rather than on the settings row so it can
           go away with the list when there is nothing to uncheck. -->
      <p class="settings-item-desc notification-subscriptions-desc">
        Uncheck the alerts you no longer need, or click cancel all alerts
      </p>
      <LabelFieldsTable
        :columns="COLUMNS"
        :rows="rows"
        :is-checked="(_columnKey, rowKey) => !pendingOff.has(rowKey)"
        :show-header="false"
        @toggle="(_columnKey, rowKey) => toggle(rowKey)"
      />
      <div class="settings-config-action-row">
        <BaseButton
          variant="ghost"
          class="settings-config-btn"
          style="--ba-ghost-hover-color: rgba(16, 19, 29, 0.95)"
          @click="toggleAll"
          >{{ noneDeselected ? 'DESELECT ALL' : 'SELECT ALL' }}</BaseButton
        >
        <BaseButton
          variant="ghost"
          class="settings-config-btn"
          :disabled="notificationsStore.total === 0"
          style="--ba-ghost-hover-color: rgba(16, 19, 29, 0.95)"
          @click="notificationsStore.clearAll()"
          >CANCEL ALL ALERTS ({{ notificationsStore.total }})</BaseButton
        >
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › App Settings › Notifications — everything currently set to notify
 * the operator, in one list, with a tick per entry.
 *
 * Unticking stages the change; APPLY CHANGES switches those notifications off
 * (like every other setting in the panel). SELECT ALL / DESELECT ALL ticks or
 * unticks the lot. CANCEL ALL ALERTS is different: it empties the alerts
 * already received, at once — the same as the notifications panel's own CLEAR.
 */
import { computed, onMounted, ref, watch } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import LabelFieldsTable, { type LabelFieldColumn, type LabelFieldRow } from './LabelFieldsTable.vue'
import { useNotificationSubscriptions } from '@/composables/useNotificationSubscriptions'
import { useNotificationsStore } from '@/stores/notifications'
import { useSettingsStore } from '@/stores/settings'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const COLUMNS: LabelFieldColumn[] = [{ key: 'on', label: 'On' }]

const notificationsStore = useNotificationsStore()
const settingsStore = useSettingsStore()
const { subscriptions, refresh, turnOff } = useNotificationSubscriptions()

/** Keys the operator has unticked and not yet applied. */
const pendingOff = ref<Set<string>>(new Set())

const rows = computed<LabelFieldRow[]>(() =>
  subscriptions.value.map((subscription) => ({ key: subscription.key, label: subscription.label })),
)

/** True while every listed notification is still ticked. */
const noneDeselected = computed(() =>
  subscriptions.value.every((subscription) => !pendingOff.value.has(subscription.key)),
)

function stagePendingOff(): void {
  const keys = [...pendingOff.value]
  emit('stage', () => turnOff(keys))
}

function toggle(key: string): void {
  const next = new Set(pendingOff.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  pendingOff.value = next
  stagePendingOff()
}

/** Untick everything when all are ticked; otherwise tick everything again. */
function toggleAll(): void {
  pendingOff.value = noneDeselected.value
    ? new Set(subscriptions.value.map((subscription) => subscription.key))
    : new Set()
  stagePendingOff()
}

onMounted(refresh)

// The panel stays mounted while closed, and bells are switched on from the
// maps — re-read the list each time it opens, and drop any unapplied ticks.
watch(
  () => settingsStore.open,
  (isOpen) => {
    if (!isOpen) return
    refresh()
    pendingOff.value = new Set()
  },
)
</script>

<style scoped>
.notification-subscriptions {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.notification-subscriptions-desc {
  margin: 0;
}

.notification-subscriptions-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--ink-muted);
}
</style>
