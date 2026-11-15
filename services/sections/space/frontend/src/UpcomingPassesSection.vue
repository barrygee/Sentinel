<template>
  <div class="sat-acc-section sat-acc-section--passes">
    <div class="sat-acc-section-title sat-acc-passes-title">
      <span>UPCOMING PASSES</span>
      <span class="sat-acc-status" :class="{ 'sat-acc-status-loading': loading }">{{
        status
      }}</span>
    </div>
    <div class="sat-acc-pass-list">
      <div
        v-if="passes.length === 0 && !loading && status.startsWith('NEXT')"
        class="sat-acc-no-passes"
      >
        No passes in the next 24 hours.
      </div>
      <div v-for="(pass, passIndex) in passes" :key="passIndex" class="sat-acc-pass-card">
        <div class="sat-acc-pass-times">
          <div class="sat-acc-pass-aos-row">
            <span class="sat-acc-pass-date">{{ formatPassDate(pass.aos_utc) }}</span>
            <span class="sat-acc-pass-time">{{ formatPassTime(pass.aos_utc) }}</span>
          </div>
          <div class="sat-acc-pass-los">
            LOS {{ formatPassTime(pass.los_utc) }} ·
            {{ formatPassDuration(pass.duration_s) }}
          </div>
        </div>
        <div class="sat-acc-pass-meta">
          <div
            class="sat-acc-pass-countdown"
            :class="{ 'sat-acc-pass-countdown--live': accPassIsNow(pass, now) }"
          >
            {{ accPassIsNow(pass, now) ? 'NOW' : formatPassCountdown(pass.aos_unix_ms - now) }}
          </div>
          <div class="sat-acc-pass-maxel">MAX {{ pass.max_elevation_deg.toFixed(1) }}°</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * UPCOMING PASSES — the next-24h pass list inside an expanded satellite's
 * accordion. Rendered by both the satellite list (SpaceFilter) and the PASSES
 * pane (SpacePasses), which used to carry a copy of this markup each.
 *
 * The section shell (`sat-acc-section`, `sat-acc-section-title`) comes from
 * SatelliteAccordion.css like every other accordion section; the pass-list
 * rules are scoped here. The left/right inset reads
 * --ba-grid-section-padding-x, so the list lines up with whichever accordion
 * hosts it (24px in the satellite list, 28px in the PASSES pane).
 */
import { accPassIsNow, type AccPass } from './spacePassesUtils'
import {
  formatPassCountdown,
  formatPassDate,
  formatPassDuration,
  formatPassTime,
} from './utils/satelliteUtils'

defineProps<{
  /** The satellite's passes in the next 24 hours, soonest first. */
  passes: AccPass[]
  /** True while the passes are being computed. */
  loading: boolean
  /** Status line beside the title ("NEXT 24H · UPDATED …", an error, …). */
  status: string
  /** Current time (ms), ticked by the host so countdowns and NOW stay live. */
  now: number
}>()
</script>

<style scoped>
.sat-acc-section--passes {
  padding-top: 6px;
  padding-bottom: 4px;
  gap: 6px;
}

.sat-acc-passes-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.sat-acc-status {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(var(--ink-rgb), 0.28);
  text-transform: uppercase;
}

.sat-acc-status.sat-acc-status-loading {
  color: var(--accent-text);
}

.sat-acc-no-passes {
  padding: 4px var(--ba-grid-section-padding-x, 24px) 8px var(--ba-grid-section-padding-x, 24px);
  font-family: var(--font-primary);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.1em;
  color: rgba(var(--ink-rgb), 0.28);
  text-transform: uppercase;
}

.sat-acc-pass-list {
  display: flex;
  flex-direction: column;
  margin: 0 calc(-1 * var(--ba-grid-section-padding-x, 24px));
}

.sat-acc-pass-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px var(--ba-grid-section-padding-x, 24px);
}

.sat-acc-pass-card:last-child {
  padding-bottom: 16px;
}

.sat-acc-pass-times {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sat-acc-pass-aos-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.sat-acc-pass-date {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(var(--ink-rgb), 0.28);
  text-transform: uppercase;
  flex-shrink: 0;
}

.sat-acc-pass-time {
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--ink-strong);
}

.sat-acc-pass-los {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.07em;
  color: rgba(var(--ink-rgb), 0.28);
  text-transform: uppercase;
}

.sat-acc-pass-meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.sat-acc-pass-countdown {
  font-family: var(--font-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--accent-text);
  white-space: nowrap;
  text-transform: uppercase;
}

.sat-acc-pass-countdown.sat-acc-pass-countdown--live {
  color: var(--sev-live);
}

.sat-acc-pass-maxel {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.07em;
  color: rgba(var(--ink-rgb), 0.32);
  white-space: nowrap;
  text-transform: uppercase;
}
</style>
