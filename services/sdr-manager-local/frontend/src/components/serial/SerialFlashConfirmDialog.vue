<template>
  <dialog
    ref="dialogElement"
    class="serial-flash-dialog"
    :aria-labelledby="headingId"
    :aria-describedby="bodyId"
    @cancel.prevent="emit('cancel')"
    @keydown.stop
  >
    <h3 :id="headingId" class="serial-flash-dialog-heading">WRITE SERIAL {{ serial }}?</h3>
    <p :id="bodyId" class="serial-flash-dialog-body">
      This writes permanently to {{ deviceName }}’s EEPROM and cannot be undone. Don’t unplug it or
      close this page until it finishes.
    </p>
    <div class="sdr-devices-form-actions">
      <BaseButton
        ref="cancelButton"
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        @click="emit('cancel')"
      >
        CANCEL
      </BaseButton>
      <BaseButton type="button" variant="danger" class="sdr-devices-btn" @click="emit('confirm')">
        WRITE SERIAL
      </BaseButton>
    </div>
  </dialog>
</template>

<script setup lang="ts">
/**
 * `SerialFlashConfirmDialog` — the last check before an EEPROM write. A
 * native modal `<dialog>`: the browser traps focus inside it, makes the page
 * behind it inert and turns Escape into `cancel`. Keys stop at the dialog: the
 * Settings panel around it has its own Escape (close Settings) and Tab trap.
 * Focus starts on CANCEL, the safe choice, and returns to whatever opened it.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, type ComponentPublicInstance } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'

const props = defineProps<{ serial: string; deviceName: string; idPrefix: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const headingId = `${props.idPrefix}-confirm-heading`
const bodyId = `${props.idPrefix}-confirm-body`
const dialogElement = ref<HTMLDialogElement | null>(null)
const cancelButton = ref<ComponentPublicInstance | null>(null)
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

onMounted(async () => {
  dialogElement.value?.showModal()
  await nextTick()
  ;(cancelButton.value?.$el as HTMLElement | undefined)?.focus()
})

onBeforeUnmount(() => {
  dialogElement.value?.close()
  opener?.focus()
})
</script>

<style scoped>
.serial-flash-dialog {
  /* The danger button's default red is 3.6:1 on its own wash; the strong red passes AA. */
  --ba-danger-color: var(--danger-strong);
  max-width: min(440px, calc(100vw - 32px));
  padding: 20px;
  border: none;
  border-radius: 0;
  background: var(--canvas);
  color: var(--ink);
}
.serial-flash-dialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}
.serial-flash-dialog-heading {
  margin: 0 0 10px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-value);
  font-weight: 600;
  letter-spacing: 0.08em;
}
.serial-flash-dialog-body {
  margin: 0 0 16px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  line-height: 1.5;
}
</style>
