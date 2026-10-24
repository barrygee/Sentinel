<template>
  <form class="sdr-devices-accordion" novalidate @submit.prevent>
    <LocalDeviceNotices :device="device" />

    <LocalFormField
      v-slot="{ describedBy, invalid }"
      label="NAME"
      :field-id="fieldIds.name"
      :error="errors.name"
    >
      <input
        :id="fieldIds.name"
        ref="nameInput"
        v-model="draft.name"
        type="text"
        class="sdr-devices-form-input"
        placeholder="e.g. Roof RTL-SDR"
        :maxlength="DEVICE_NAME_MAX_LENGTH"
        autocomplete="off"
        spellcheck="false"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </LocalFormField>

    <LocalFormField
      v-slot="{ describedBy, invalid }"
      label="OUTPUT PORT"
      :field-id="fieldIds.port"
      :hint="`Its control port is ${controlPortHint}.`"
      :error="errors.port"
    >
      <input
        :id="fieldIds.port"
        ref="portInput"
        v-model.number="draft.port"
        type="number"
        inputmode="numeric"
        class="sdr-devices-form-input"
        :min="store.constraints?.port_min"
        :max="store.constraints?.port_max"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </LocalFormField>

    <LocalFormField label="ANTENNA" :field-id="fieldIds.antenna">
      <input
        :id="fieldIds.antenna"
        v-model="draft.antenna"
        type="text"
        class="sdr-devices-form-input"
        placeholder="e.g. Discone"
        :maxlength="ANTENNA_MAX_LENGTH"
        autocomplete="off"
        spellcheck="false"
      />
    </LocalFormField>

    <LocalFormField label="NOTES" :field-id="fieldIds.notes">
      <textarea
        :id="fieldIds.notes"
        v-model="draft.notes"
        class="sdr-devices-form-input local-device-notes"
        :maxlength="NOTES_MAX_LENGTH"
        rows="2"
      ></textarea>
    </LocalFormField>

    <div class="sdr-devices-form-row local-device-visibility-row">
      <span :id="fieldIds.visibility" class="sdr-devices-form-label">VISIBILITY</span>
      <LocalVisibilityToggle v-model="draft.visibility" :labelled-by="fieldIds.visibility" />
    </div>
    <p class="local-device-visibility-note">
      {{
        draft.visibility === 'public'
          ? 'Listed for other Sentinels on the network to use.'
          : 'Not listed for other Sentinels.'
      }}
    </p>

    <LocalDeviceDetails :device="device" />

    <p v-if="errors.form" class="sdr-devices-form-error" role="alert">{{ errors.form }}</p>
    <div class="sdr-devices-form-actions">
      <BaseButton
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        @click="deviceEdits.cancel(device.device_id)"
      >
        CANCEL
      </BaseButton>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * `LocalDeviceForm` — edit one dongle plugged into this machine: its name,
 * the output port it streams on (and P + 2 for control), antenna, notes and
 * whether other Sentinels see it.
 *
 * Edits are staged for APPLY CHANGES (`useLocalDeviceEdits`), which checks
 * and saves them; a collapsed form keeps its draft and CANCEL drops it. A
 * device seen for the first time needs a name and a port before it can
 * stream. When APPLY CHANGES refuses this device, its messages show under the
 * fields they name, or under the form, and focus moves to the first field in
 * error.
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import type { LocalDeviceStatus } from '../../api/types'
import {
  useLocalDeviceEdits,
  type LocalDeviceFormErrors,
} from '../../composables/useLocalDeviceEdits'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import {
  ANTENNA_MAX_LENGTH,
  DEVICE_NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
} from '../../utils/validation'
import LocalFormField from '../shared/LocalFormField.vue'
import LocalDeviceDetails from './LocalDeviceDetails.vue'
import LocalDeviceNotices from './LocalDeviceNotices.vue'
import LocalVisibilityToggle from './LocalVisibilityToggle.vue'

const props = defineProps<{ device: LocalDeviceStatus }>()

const store = useLocalSdrStore()
const deviceEdits = useLocalDeviceEdits()

const idPrefix = `sdr-manager-local-${props.device.device_id.replace(/[^a-zA-Z0-9]/g, '-')}`
const fieldIds = {
  name: `${idPrefix}-name`,
  port: `${idPrefix}-port`,
  antenna: `${idPrefix}-antenna`,
  notes: `${idPrefix}-notes`,
  visibility: `${idPrefix}-visibility`,
}

const draft = reactive({ ...deviceEdits.draftFor(props.device) })
const NO_ERRORS: LocalDeviceFormErrors = { name: null, port: null, form: null }
const errors = computed(() => deviceEdits.errors[props.device.device_id] ?? NO_ERRORS)
const nameInput = ref<HTMLInputElement | null>(null)
const portInput = ref<HTMLInputElement | null>(null)

const controlPortHint = computed(() =>
  typeof draft.port === 'number' && Number.isInteger(draft.port) ? draft.port + 2 : 'the port + 2',
)

watch(draft, () =>
  deviceEdits.updateDraft(props.device, {
    ...draft,
    // The row's stream switch owns this one; it may have moved since the form opened.
    enabled: deviceEdits.draftFor(props.device).enabled,
    // `v-model.number` leaves an empty or unparsable field as a string.
    port: typeof draft.port === 'number' ? draft.port : null,
  }),
)

async function focusFirstError(): Promise<void> {
  await nextTick()
  if (errors.value.name) nameInput.value?.focus()
  else if (errors.value.port) portInput.value?.focus()
}

// A refused APPLY opens this form (or finds it open): show where the problem is.
watch(deviceEdits.focusRequest, () => void focusFirstError())
onMounted(() => {
  if (errors.value.name || errors.value.port) void focusFirstError()
})
</script>

<style scoped>
.local-device-notes {
  resize: vertical;
  min-height: 44px;
}
.local-device-visibility-row {
  /* The two pills don't fit beside the label on a phone. */
  flex-wrap: wrap;
}
.local-device-visibility-note {
  margin: -4px 0 4px 124px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  color: var(--ink-secondary);
}
@media (max-width: 600px) {
  .local-device-visibility-row {
    /* The two pills don't fit beside the label on a phone. */
    flex-wrap: wrap;
  }
  .local-device-visibility-note {
    margin-left: 0;
  }
}
</style>
