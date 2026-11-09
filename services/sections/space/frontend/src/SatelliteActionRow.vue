<template>
  <div class="sat-acc-section sat-acc-section--track">
    <div class="sat-acc-track-row">
      <BaseIconAction
        class="sat-acc-track-btn"
        :active="following"
        active-class="sat-acc-track-btn--active"
        :accessible-name="trackLabel"
        :tooltip="trackLabel"
        @click.stop="emit('track')"
      >
        <LocationPinIcon />
      </BaseIconAction>
      <BaseIconAction
        class="sat-acc-notif-btn"
        :active="notifying"
        active-class="sat-acc-notif-btn--active"
        :accessible-name="notifLabel"
        :tooltip="notifLabel"
        @click.stop="emit('toggle-pass-notif')"
      >
        <BellIcon :size="14" />
      </BaseIconAction>
      <template v-if="hasDownlink">
        <BaseIconAction
          class="sat-acc-autotune-btn"
          :active="autoTuneArmed"
          active-class="sat-acc-autotune-btn--active"
          accessible-name="Auto-tune SDR"
          tooltip="Auto-tune SDR"
          @click.stop="emit('toggle-auto-tune')"
        >
          <RadioIcon :size="16" />
        </BaseIconAction>
        <BaseIconAction
          class="sat-acc-record-btn"
          :active="recordArmed"
          active-class="sat-acc-record-btn--active"
          :disabled="!autoTuneArmed"
          accessible-name="Record pass"
          tooltip="Record pass"
          @click.stop="emit('toggle-record')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="6" fill="currentColor" />
          </svg>
        </BaseIconAction>
      </template>
    </div>
    <div v-if="autoTuneArmed && conflictText" class="sat-acc-autotune-warn">
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 3 2 20h20L12 3Z"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
          fill="none"
        />
        <line
          x1="12"
          y1="9"
          x2="12"
          y2="14"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="currentColor" />
      </svg>
      <span>{{ conflictText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The row of satellite actions in an expanded Space accordion — track, pass
 * alerts, and (for a satellite with a downlink) auto-tune and record — plus the
 * warning shown when an armed auto-tune overlaps another armed satellite's pass.
 * Purely presentational: the pane owns the state (see useSatelliteActions) and
 * handles the events.
 */
import { computed } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import LocationPinIcon from '@sentinel/ui/icons/LocationPinIcon.vue'
import BellIcon from '@sentinel/ui/icons/BellIcon.vue'
import RadioIcon from '@sentinel/ui/icons/RadioIcon.vue'

const props = defineProps<{
  /** The map camera is following this satellite. */
  following: boolean
  /** Pass alerts are on for this satellite. */
  notifying: boolean
  /** The satellite has a downlink, so it can be auto-tuned and recorded. */
  hasDownlink: boolean
  autoTuneArmed: boolean
  recordArmed: boolean
  /** Overlap warning for an armed auto-tune; empty when there is none. */
  conflictText: string
}>()

const emit = defineEmits<{
  track: []
  'toggle-pass-notif': []
  'toggle-auto-tune': []
  'toggle-record': []
}>()

const trackLabel = computed(() => (props.following ? 'Untrack satellite' : 'Track satellite'))
const notifLabel = computed(() => (props.notifying ? 'Disable pass alerts' : 'Enable pass alerts'))
</script>
