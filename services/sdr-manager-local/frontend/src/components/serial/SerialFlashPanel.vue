<template>
  <section class="sdr-devices-accordion serial-flash-panel" :aria-labelledby="headingId">
    <h3 :id="headingId" ref="heading" class="serial-flash-heading" tabindex="-1">
      FLASH A UNIQUE SERIAL — {{ label }}
    </h3>

    <template v-if="phase === 'form' || phase === 'submitting'">
      <p v-if="!idle" class="sdr-devices-form-error" role="alert">
        {{ label }} is {{ device.state }}. Switch it off and wait until it stops before flashing.
      </p>
      <LocalFormField
        v-slot="{ describedBy, invalid }"
        label="NEW SERIAL"
        :field-id="serialFieldId"
        hint="1-32 letters, numbers, hyphens or underscores."
        :error="serialError"
      >
        <input
          :id="serialFieldId"
          ref="serialInput"
          v-model="serial"
          type="text"
          class="sdr-devices-form-input"
          placeholder="e.g. ROOF-01"
          maxlength="32"
          autocomplete="off"
          spellcheck="false"
          :disabled="!idle || phase === 'submitting'"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </LocalFormField>
      <label class="serial-flash-acknowledge">
        <input v-model="acknowledged" type="checkbox" :disabled="!idle" />
        I understand this writes to the dongle permanently and cannot be undone.
      </label>
      <p v-if="requestError" class="sdr-devices-form-error" role="alert">{{ requestError }}</p>
      <div class="sdr-devices-form-actions">
        <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="close">
          CANCEL
        </BaseButton>
        <BaseButton
          type="button"
          variant="danger"
          class="sdr-devices-btn"
          :disabled="!idle || !acknowledged || phase === 'submitting'"
          @click="askToConfirm"
        >
          {{ phase === 'submitting' ? 'STARTING…' : 'FLASH SERIAL' }}
        </BaseButton>
      </div>
    </template>

    <p v-else-if="phase === 'awaiting-outcome'" class="serial-flash-progress" role="alert">
      Writing the serial — don’t unplug {{ label }}…
    </p>

    <template v-else>
      <p
        class="serial-flash-outcome"
        :class="{ 'sdr-devices-form-error': phase === 'failed' }"
        role="alert"
      >
        {{ outcomeMessage }}
      </p>
      <div class="sdr-devices-form-actions">
        <BaseButton type="button" variant="ghost" class="sdr-devices-btn" @click="close">
          CLOSE
        </BaseButton>
      </div>
    </template>

    <SerialFlashConfirmDialog
      v-if="confirming"
      :serial="serial"
      :device-name="label"
      :id-prefix="idPrefix"
      @confirm="flash"
      @cancel="confirming = false"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * `SerialFlashPanel` — give one dongle a unique serial by writing it to its
 * EEPROM, which is permanent and can corrupt the dongle if interrupted.
 * Guarded three times: the device must be idle, the operator ticks an
 * acknowledgement, then confirms in a modal dialog.
 *
 * The API answers 202 at once and reports the outcome later as a `notice`
 * event; it holds the device for the whole write, so the first notice for
 * this device after the request started is the outcome.
 *
 * Inline above the devices rather than a modal, so the operator can still see
 * which dongle is which while choosing.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { LocalDeviceStatus } from '../../api/types'
import { deviceLabel, isDeviceIdle, useLocalSdrStore } from '../../stores/localSdrStore'
import { serialFlashErrorMessage, serialFlashFailureMessage } from '../../utils/errorMessages'
import { validateSerial } from '../../utils/validation'
import LocalFormField from '../shared/LocalFormField.vue'
import SerialFlashConfirmDialog from './SerialFlashConfirmDialog.vue'

type FlashPhase = 'form' | 'submitting' | 'awaiting-outcome' | 'succeeded' | 'failed'

const props = defineProps<{ device: LocalDeviceStatus }>()

const store = useLocalSdrStore()
const idPrefix = `sdr-manager-local-flash-${props.device.device_id.replace(/[^a-zA-Z0-9]/g, '-')}`
const headingId = `${idPrefix}-heading`
const serialFieldId = `${idPrefix}-serial`

const phase = ref<FlashPhase>('form')
const serial = ref('')
const acknowledged = ref(false)
const confirming = ref(false)
const serialError = ref<string | null>(null)
const requestError = ref<string | null>(null)
const outcomeMessage = ref('')
const requiresReplug = ref(false)
const heading = ref<HTMLElement | null>(null)
const serialInput = ref<HTMLInputElement | null>(null)
let requestStartedAt = 0

const label = computed(() => deviceLabel(props.device))
const idle = computed(() => isDeviceIdle(props.device))

onMounted(() => heading.value?.focus())

async function askToConfirm(): Promise<void> {
  serial.value = serial.value.trim()
  serialError.value = validateSerial(serial.value)
  if (serialError.value) {
    await nextTick()
    serialInput.value?.focus()
    return
  }
  confirming.value = true
}

async function flash(): Promise<void> {
  confirming.value = false
  phase.value = 'submitting'
  requestError.value = null
  requestStartedAt = Date.now()
  try {
    const accepted = await store.flashSerial(props.device.device_id, serial.value)
    requiresReplug.value = accepted.requires_replug
    phase.value = 'awaiting-outcome'
  } catch (error) {
    requestError.value = serialFlashErrorMessage(error)
    phase.value = 'form'
  }
}

watch(
  () => store.notices,
  (notices) => {
    if (phase.value !== 'awaiting-outcome') return
    const outcome = notices.find(
      (notice) => notice.device_id === props.device.device_id && notice.ts >= requestStartedAt,
    )
    if (outcome === undefined) return
    if (outcome.level === 'info') {
      phase.value = 'succeeded'
      outcomeMessage.value = requiresReplug.value
        ? `Serial ${serial.value} written. Unplug ${label.value} and plug it back in to use it.`
        : `Serial ${serial.value} written.`
    } else {
      phase.value = 'failed'
      outcomeMessage.value = serialFlashFailureMessage(outcome.code)
    }
  },
)

function close(): void {
  store.closeSerialFlash()
}
</script>

<style scoped>
.serial-flash-panel {
  /* The danger button's default red is 3.6:1 on its own wash; the strong red passes AA. */
  --ba-danger-color: var(--danger-strong);
}
.serial-flash-heading {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink);
}
.serial-flash-acknowledge {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-height: 24px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
.serial-flash-progress,
.serial-flash-outcome {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
</style>
