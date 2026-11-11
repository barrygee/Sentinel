<template>
  <div class="sdr-serial-flash">
    <p class="sdr-serial-flash-note">
      This dongle needs a unique serial before its SDR Manager can identify it reliably.
    </p>
    <BaseButton
      v-if="!confirming"
      type="button"
      variant="ghost"
      class="sdr-devices-btn"
      :style="GHOST_BUTTON_STYLE"
      @click="confirming = true"
    >
      FLASH SERIAL
    </BaseButton>
    <div v-else class="sdr-serial-flash-confirm">
      <!-- The warning is the field's hint, so a screen reader reads it with the input. -->
      <BaseTextField
        v-model="serial"
        density="settings"
        label="NEW SERIAL"
        :input-id="serialInputId"
        hint="This writes permanently to the dongle's EEPROM. An interrupted write can corrupt the device. Do not unplug the dongle or close this page while flashing."
        placeholder="e.g. AIS-01"
        autocomplete="off"
        spellcheck="false"
      />
      <div v-if="errorMsg" class="sdr-devices-form-error">{{ errorMsg }}</div>
      <div class="sdr-devices-form-actions">
        <BaseButton
          type="button"
          variant="ghost"
          class="sdr-devices-btn"
          :disabled="flashing"
          @click="cancel"
        >
          CANCEL
        </BaseButton>
        <BaseButton
          type="button"
          variant="danger"
          class="sdr-devices-btn"
          :disabled="flashing || !serial.trim()"
          @click="confirmFlash"
        >
          {{ flashing ? 'FLASHING…' : 'CONFIRM PERMANENT WRITE' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `SdrSerialFlashControl` — the guarded EEPROM-serial-flash action shown on a
 * device that needs identification (`needs_identification: true`). Writing a
 * serial to an RTL-SDR's EEPROM is permanent and an interrupted write can
 * corrupt the dongle, so this requires an explicit two-step confirmation
 * (reveal the serial input + warning, then a distinctly-labelled destructive
 * button) rather than a single click — the same shape as the delete-radio
 * confirm row elsewhere in this settings surface, but with the serial value
 * itself and a stronger written warning given the higher stakes.
 */
import { ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
import { hostErrorMessage, requireSdrManagerHosts } from '../services/sdrManagerHosts'
import '@sentinel/shell-api/settings/styles/deviceList.css'

const GHOST_BUTTON_STYLE =
  '--ba-ghost-height: auto; --ba-ghost-padding: 8px 18px; --ba-ghost-font-size: var(--settings-text-caption); ' +
  '--ba-ghost-color: rgba(16, 19, 29, 0.6); --ba-ghost-hover-color: rgba(16, 19, 29, 0.9)'

const props = defineProps<{ hostId: number; deviceId: string }>()
const emit = defineEmits<{ flashed: [] }>()

const confirming = ref(false)
const serial = ref('')
const flashing = ref(false)
const errorMsg = ref('')
const idSafeDeviceId = props.deviceId.replace(/[^a-zA-Z0-9]/g, '-')
const serialInputId = `sdr-serial-flash-${idSafeDeviceId}`

function cancel(): void {
  confirming.value = false
  serial.value = ''
  errorMsg.value = ''
}

async function confirmFlash(): Promise<void> {
  const trimmed = serial.value.trim()
  if (!trimmed) return
  flashing.value = true
  errorMsg.value = ''
  try {
    await requireSdrManagerHosts().flashHostDeviceSerial(props.hostId, props.deviceId, trimmed)
    confirming.value = false
    serial.value = ''
    emit('flashed')
  } catch (error) {
    errorMsg.value = hostErrorMessage(error, 'Flash failed.')
  } finally {
    flashing.value = false
  }
}
</script>

<style scoped>
.sdr-serial-flash {
  padding: 10px 0;
  border-top: 1px solid rgba(16, 19, 29, 0.08);
}
.sdr-serial-flash-note {
  margin: 0 0 8px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: #d94436;
}
.sdr-serial-flash-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
