<template>
  <LocalAuthGate>
    <div class="sdr-devices-wrap hotspot">
      <p v-if="state === null && !errorMessage" class="sdr-devices-empty">Reading the hotspot…</p>
      <p v-else-if="state && !state.available" class="sdr-devices-empty">
        This machine can’t host a Wi-Fi hotspot: NetworkManager isn’t reachable (on a Mac, or a
        machine without Wi-Fi, there is none).
      </p>
      <template v-else-if="state">
        <div class="sdr-devices-form-row">
          <span id="sdr-manager-local-hotspot-control" class="sdr-devices-form-label">
            ALLOW CHANGES
          </span>
          <BaseToggleSwitch
            :model-value="state.control_enabled"
            accessible-name="Let SDR Manager change this machine’s Wi-Fi"
            :disabled="busy"
            @update:model-value="hotspot.setControl"
          />
        </div>
        <p v-if="!state.control_enabled" class="sdr-devices-empty">
          SDR Manager may not change this machine’s Wi-Fi. Turn this on to set up a hotspot.
        </p>
        <template v-else>
          <BaseWarningNotice
            v-if="!state.auth_token_configured"
            message="Set a console password before starting a hotspot, or anyone who joins it can change your SDRs."
          />
          <HotspotRollbackBanner
            v-if="state.pending_confirmation && state.confirm_deadline_ms"
            :deadline-ms="state.confirm_deadline_ms"
            :busy="busy"
            @keep="hotspot.confirm()"
            @undo="hotspot.stop(false)"
          />
          <HotspotStatusSummary :state="state" />
          <div v-if="state.configured" class="sdr-devices-form-actions hotspot-actions">
            <BaseButton
              v-if="confirmingForget"
              type="button"
              variant="danger"
              class="sdr-devices-btn"
              :disabled="busy"
              @click="forget"
            >
              DELETE HOTSPOT SETTINGS
            </BaseButton>
            <BaseButton
              v-else
              type="button"
              variant="ghost"
              class="sdr-devices-btn"
              :disabled="busy"
              @click="confirmingForget = true"
            >
              DELETE…
            </BaseButton>
            <BaseButton
              v-if="state.active"
              type="button"
              variant="ghost"
              class="sdr-devices-btn"
              :disabled="busy"
              @click="hotspot.stop(state.uplink_interface_is_hotspot_interface)"
            >
              STOP
            </BaseButton>
            <BaseButton
              v-else
              type="button"
              variant="ghost"
              class="sdr-devices-btn"
              :disabled="!canChange || busy"
              @click="hotspot.start(state.uplink_interface_is_hotspot_interface)"
            >
              START
            </BaseButton>
          </div>
          <HotspotSettingsForm
            :key="state.generated_at"
            :state="state"
            :interfaces="interfaces"
            :busy="busy"
            @save="hotspot.save"
          />
          <HotspotClientsTable
            v-if="state.active"
            :clients="clients"
            @release="hotspot.releaseLease"
          />
        </template>
      </template>
      <p v-if="rollbackMessage" class="sdr-devices-form-error" role="alert">
        {{ rollbackMessage }}
      </p>
      <div v-if="errorMessage" role="alert">
        <p class="sdr-devices-form-error hotspot-error">{{ errorMessage }}</p>
        <pre v-if="commandOutput" class="hotspot-command-output">{{ commandOutput }}</pre>
      </div>
    </div>
  </LocalAuthGate>
</template>

<script setup lang="ts">
/**
 * `HotspotControl` — the HOTSPOT card: a Wi-Fi network this machine can
 * offer, so a phone or laptop can reach Sentinel where there is no other
 * network (a field site, a car).
 *
 * Off until the operator lets SDR Manager change this machine's Wi-Fi (ALLOW
 * CHANGES), and refused by the API without a console password. Hidden behind
 * a short note on a machine that can't host one at all (no NetworkManager,
 * as on a Mac).
 */
import { onMounted, ref } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseToggleSwitch from '@sentinel/ui/base/BaseToggleSwitch.vue'
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'
import { useLocalHotspot } from '../../composables/useLocalHotspot'
import { useLocalSdrEvents } from '../../composables/useLocalSdrEvents'
import LocalAuthGate from '../auth/LocalAuthGate.vue'
import HotspotClientsTable from './HotspotClientsTable.vue'
import HotspotRollbackBanner from './HotspotRollbackBanner.vue'
import HotspotSettingsForm from './HotspotSettingsForm.vue'
import HotspotStatusSummary from './HotspotStatusSummary.vue'

const hotspot = useLocalHotspot()
const {
  state,
  interfaces,
  clients,
  busy,
  errorMessage,
  commandOutput,
  rollbackMessage,
  canChange,
} = hotspot
const confirmingForget = ref(false)

useLocalSdrEvents({ onHotspotRollback: (message) => void hotspot.onRollback(message) })

onMounted(() => void hotspot.refresh())

async function forget(): Promise<void> {
  confirmingForget.value = false
  await hotspot.forget()
}
</script>

<style scoped>
.hotspot {
  /* The danger button's default red is 3.6:1 on its own wash; the strong red passes AA. */
  --ba-danger-color: var(--danger-strong);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hotspot-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}
.hotspot-error {
  margin-left: 0;
}
.hotspot-command-output {
  margin: 4px 0 0;
  padding: 8px;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: var(--settings-text-small);
  background: rgba(var(--ink-rgb), 0.04);
  color: var(--ink);
}
</style>
