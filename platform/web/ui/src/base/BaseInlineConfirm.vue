<template>
  <span class="base-inline-confirm">
    <span class="base-inline-confirm-label">{{ label }}</span>
    <button
      ref="confirmButton"
      type="button"
      class="base-inline-confirm-btn base-inline-confirm-btn--confirm"
      :aria-label="confirmAccessibleName"
      @click="emit('confirm')"
    >
      {{ confirmText }}
    </button>
    <button
      ref="cancelButton"
      type="button"
      class="base-inline-confirm-btn"
      :aria-label="cancelAccessibleName"
      @click="emit('cancel')"
    >
      {{ cancelText }}
    </button>
  </span>
</template>

<script setup lang="ts">
/**
 * `BaseInlineConfirm` — the "DELETE?  YES  NO" row a list row swaps in for its
 * delete/remove/forget button, so a destructive action takes a second,
 * deliberate click without opening a dialog. Replaces the `sdr-device-confirm`
 * copies in the SDR radio rows, the SDR Manager rows and the offline-map
 * regions.
 *
 * The caller decides when to show it (render it in place of the trigger while
 * confirming) and what each answer does (`confirm` / `cancel`). Focus can move
 * to a button as it appears, via `initialFocus`: `cancel` is the safe default
 * for a destructive action, since a stray Enter then can't confirm it.
 */
import { nextTick, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** The question, e.g. `DELETE?`. */
    label: string
    /** Text of the confirming button. */
    confirmText?: string
    /** Text of the cancelling button. */
    cancelText?: string
    /** Accessible name for the confirming button when its text isn't enough. */
    confirmAccessibleName?: string
    /** Accessible name for the cancelling button when its text isn't enough. */
    cancelAccessibleName?: string
    /** Which button takes keyboard focus when the row appears; none by default. */
    initialFocus?: 'confirm' | 'cancel'
  }>(),
  {
    confirmText: 'YES',
    cancelText: 'NO',
    confirmAccessibleName: undefined,
    cancelAccessibleName: undefined,
    initialFocus: undefined,
  },
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()

const confirmButton = ref<HTMLButtonElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

onMounted(async () => {
  if (!props.initialFocus) return
  // Wait a tick so a row that just swapped in is attached before focusing.
  await nextTick()
  const target = props.initialFocus === 'confirm' ? confirmButton : cancelButton
  target.value?.focus()
})
</script>

<style>
.base-inline-confirm {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.base-inline-confirm-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--danger);
  text-transform: uppercase;
}

.base-inline-confirm-btn {
  background: var(--hover-surface);
  border: none;
  border-radius: 0;
  padding: 3px 9px;
  color: var(--ink-secondary);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.base-inline-confirm-btn:hover {
  background: rgba(var(--ink-rgb), 0.12);
  color: rgba(var(--ink-rgb), 0.85);
}

.base-inline-confirm-btn--confirm {
  background: var(--danger-soft);
  color: var(--danger);
}

.base-inline-confirm-btn--confirm:hover {
  background: rgba(var(--danger-wash-rgb), 0.2);
  color: var(--danger-hover);
}

@media (prefers-reduced-motion: reduce) {
  .base-inline-confirm-btn {
    transition: none;
  }
}
</style>
