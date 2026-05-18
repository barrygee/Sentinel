<template>
  <div id="air-playback-panel">

      <div class="sdr-group-body sdr-group-body-expanded">

        <!-- ── Setup: date + time fields ── -->
        <div class="sdr-radio-section apb-section--start-date" :class="{ 'apb-section--locked': isActive }">

          <!-- Start date picker -->
          <label class="sdr-field-label">START DATE</label>
          <div class="apb-cal-wrap" ref="calWrap">
            <button class="apb-date-btn" :class="{ 'apb-date-btn--chosen': !!pendingDate }" @click="!isActive && (calOpen = !calOpen)" type="button" :disabled="isActive">
              <span>{{ pendingDate ? formatDisplayDate(pendingDate) : 'DD / MM / YYYY' }}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="2" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1"/>
                <line x1="1" y1="4.5" x2="9" y2="4.5" stroke="currentColor" stroke-width="1"/>
                <line x1="3" y1="1" x2="3" y2="3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
                <line x1="7" y1="1" x2="7" y2="3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
              </svg>
            </button>
            <div v-if="calOpen && !isActive" class="apb-cal-popup" @mousedown.stop>
              <div class="apb-cal-header">
                <button class="apb-cal-nav" @click="calPrevMonth" type="button">&#8249;</button>
                <span class="apb-cal-month-label">{{ CAL_MONTHS[calViewMonth] }} {{ calViewYear }}</span>
                <button class="apb-cal-nav" @click="calNextMonth" type="button">&#8250;</button>
              </div>
              <div class="apb-cal-grid">
                <span class="apb-cal-dow" v-for="d in ['M','T','W','T','F','S','S']" :key="d + Math.random()">{{ d }}</span>
                <button
                  v-for="cell in calCells" :key="cell.key"
                  class="apb-cal-cell"
                  :class="{
                    'apb-cal-cell--other':    cell.other,
                    'apb-cal-cell--today':    cell.today,
                    'apb-cal-cell--sel':      cell.selected,
                    'apb-cal-cell--disabled': cell.disabled
                  }"
                  :disabled="cell.disabled"
                  @click="selectCalDate(cell)"
                  type="button"
                >{{ cell.day }}</button>
              </div>
            </div>
          </div>

        </div>

        <div class="sdr-radio-section sdr-radio-section--tight" :class="{ 'apb-section--locked': isActive }">
          <!-- Start time -->
          <label class="sdr-field-label">START TIME</label>
          <div class="apb-time-row">
            <div class="apb-dd-wrap" ref="startHHWrap">
              <button class="apb-time-select" :class="{ 'apb-time-select--chosen': startHH !== '' }" @click="!isActive && toggleDd('startHH')" type="button" :disabled="isActive">
                <span>{{ startHH !== '' ? String(startHH).padStart(2, '0') : 'hours' }}</span>
                <svg width="8" height="5" viewBox="0 0 8 5"><path d="M0 0l4 5 4-5z" fill="currentColor"/></svg>
              </button>
              <Teleport v-if="openDd === 'startHH' && ddRect" to="body">
                <div class="apb-dd-list apb-dd-list--fixed" :style="{ top: ddRect.top + 'px', left: ddRect.left + 'px', width: ddRect.width + 'px' }" @mousedown.stop>
                  <button v-for="h in 24" :key="h" class="apb-dd-item" :class="{ 'apb-dd-item--sel': startHH === h - 1, 'apb-dd-item--disabled': !isHourAvailable(h - 1) }" :disabled="!isHourAvailable(h - 1)" @click="startHH = h - 1; startMM = ''; closeDd()" type="button">{{ String(h - 1).padStart(2, '0') }}</button>
                </div>
              </Teleport>
            </div>
            <span class="apb-time-colon">:</span>
            <div class="apb-dd-wrap" ref="startMMWrap">
              <button class="apb-time-select" :class="{ 'apb-time-select--chosen': startMM !== '' }" @click="!isActive && toggleDd('startMM')" type="button" :disabled="isActive">
                <span>{{ startMM !== '' ? String(startMM).padStart(2, '0') : 'minutes' }}</span>
                <svg width="8" height="5" viewBox="0 0 8 5"><path d="M0 0l4 5 4-5z" fill="currentColor"/></svg>
              </button>
              <Teleport v-if="openDd === 'startMM' && ddRect" to="body">
                <div class="apb-dd-list apb-dd-list--fixed" :style="{ top: ddRect.top + 'px', left: ddRect.left + 'px', width: ddRect.width + 'px' }" @mousedown.stop>
                  <button v-for="m in 60" :key="m" class="apb-dd-item"
                    :class="{ 'apb-dd-item--sel': startMM === m - 1, 'apb-dd-item--disabled': typeof startHH === 'number' && !availableMinutesFor(startHH as number).has(m - 1) }"
                    :disabled="typeof startHH === 'number' && !availableMinutesFor(startHH as number).has(m - 1)"
                    @click="startMM = m - 1; closeDd()" type="button">{{ String(m - 1).padStart(2, '0') }}</button>
                </div>
              </Teleport>
            </div>
          </div>
        </div>

        <div class="sdr-radio-section" :class="{ 'apb-section--locked': isActive }">

          <!-- End date picker -->
          <label class="sdr-field-label">END DATE</label>
          <div class="apb-cal-wrap" ref="endCalWrap">
            <button class="apb-date-btn" :class="{ 'apb-date-btn--chosen': !!pendingEndDate }" @click="!isActive && (endCalOpen = !endCalOpen)" type="button" :disabled="isActive">
              <span>{{ pendingEndDate ? formatDisplayDate(pendingEndDate) : 'DD / MM / YYYY' }}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="2" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1"/>
                <line x1="1" y1="4.5" x2="9" y2="4.5" stroke="currentColor" stroke-width="1"/>
                <line x1="3" y1="1" x2="3" y2="3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
                <line x1="7" y1="1" x2="7" y2="3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
              </svg>
            </button>
            <div v-if="endCalOpen && !isActive" class="apb-cal-popup" @mousedown.stop>
              <div class="apb-cal-header">
                <button class="apb-cal-nav" @click="endCalPrevMonth" type="button">&#8249;</button>
                <span class="apb-cal-month-label">{{ CAL_MONTHS[endCalViewMonth] }} {{ endCalViewYear }}</span>
                <button class="apb-cal-nav" @click="endCalNextMonth" type="button">&#8250;</button>
              </div>
              <div class="apb-cal-grid">
                <span class="apb-cal-dow" v-for="d in ['M','T','W','T','F','S','S']" :key="d + Math.random()">{{ d }}</span>
                <button
                  v-for="cell in endCalCells" :key="cell.key"
                  class="apb-cal-cell"
                  :class="{
                    'apb-cal-cell--other':    cell.other,
                    'apb-cal-cell--today':    cell.today,
                    'apb-cal-cell--sel':      cell.selected,
                    'apb-cal-cell--disabled': cell.disabled
                  }"
                  :disabled="cell.disabled"
                  @click="selectEndCalDate(cell)"
                  type="button"
                >{{ cell.day }}</button>
              </div>
            </div>
          </div>

        </div>

        <div class="sdr-radio-section sdr-radio-section--tight" :class="{ 'apb-section--locked': isActive }">
          <!-- End time -->
          <label class="sdr-field-label">END TIME</label>
          <span v-if="endTimeError" class="apb-time-error">{{ endTimeError }}</span>
          <div class="apb-time-row">
            <div class="apb-dd-wrap" ref="endHHWrap">
              <button class="apb-time-select" :class="{ 'apb-time-select--chosen': endHH !== '' }" @click="!isActive && toggleDd('endHH')" type="button" :disabled="isActive">
                <span>{{ endHH !== '' ? String(endHH).padStart(2, '0') : 'hours' }}</span>
                <svg width="8" height="5" viewBox="0 0 8 5"><path d="M0 0l4 5 4-5z" fill="currentColor"/></svg>
              </button>
              <Teleport v-if="openDd === 'endHH' && ddRect" to="body">
                <div class="apb-dd-list apb-dd-list--fixed" :style="{ top: ddRect.top + 'px', left: ddRect.left + 'px', width: ddRect.width + 'px' }" @mousedown.stop>
                  <button v-for="h in 24" :key="h" class="apb-dd-item" :class="{ 'apb-dd-item--sel': endHH === h - 1, 'apb-dd-item--disabled': !isHourAvailable(h - 1) || (pendingEndDate === pendingDate && typeof startHH === 'number' && h - 1 < startHH) }" :disabled="!isHourAvailable(h - 1) || (pendingEndDate === pendingDate && typeof startHH === 'number' && h - 1 < startHH)" @click="endHH = h - 1; endMM = ''; closeDd()" type="button">{{ String(h - 1).padStart(2, '0') }}</button>
                </div>
              </Teleport>
            </div>
            <span class="apb-time-colon">:</span>
            <div class="apb-dd-wrap" ref="endMMWrap">
              <button class="apb-time-select" :class="{ 'apb-time-select--chosen': endMM !== '' }" @click="!isActive && toggleDd('endMM')" type="button" :disabled="isActive">
                <span>{{ endMM !== '' ? String(endMM).padStart(2, '0') : 'minutes' }}</span>
                <svg width="8" height="5" viewBox="0 0 8 5"><path d="M0 0l4 5 4-5z" fill="currentColor"/></svg>
              </button>
              <Teleport v-if="openDd === 'endMM' && ddRect" to="body">
                <div class="apb-dd-list apb-dd-list--fixed" :style="{ top: ddRect.top + 'px', left: ddRect.left + 'px', width: ddRect.width + 'px' }" @mousedown.stop>
                  <button v-for="m in 60" :key="m" class="apb-dd-item"
                    :class="{ 'apb-dd-item--sel': endMM === m - 1, 'apb-dd-item--disabled': (typeof endHH === 'number' && !availableMinutesFor(endHH as number).has(m - 1)) || (pendingEndDate === pendingDate && typeof endHH === 'number' && typeof startHH === 'number' && endHH === startHH && typeof startMM === 'number' && m - 1 <= startMM) }"
                    :disabled="(typeof endHH === 'number' && !availableMinutesFor(endHH as number).has(m - 1)) || (pendingEndDate === pendingDate && typeof endHH === 'number' && typeof startHH === 'number' && endHH === startHH && typeof startMM === 'number' && m - 1 <= startMM)"
                    @click="endMM = m - 1; closeDd()" type="button">{{ String(m - 1).padStart(2, '0') }}</button>
                </div>
              </Teleport>
            </div>
          </div>
        </div>

        <!-- ── Transport + speed inline ── -->
        <div class="sdr-radio-section sdr-radio-section--tight apb-section--transport">
          <label class="sdr-field-label">PLAYBACK</label>
          <div class="apb-transport-row">
            <!-- Play button (start replay) -->
            <button
              class="apb-transport-btn apb-transport-btn--play"
              :disabled="isActive || !canLoad || isLoading"
              @click="loadPlayback"
              title="Start replay"
            >
              <svg v-if="isLoading" class="apb-spin" width="11" height="11" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="20 12" stroke-linecap="round"/>
              </svg>
              <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
            </button>
            <!-- Stop button (exit replay) -->
            <button
              class="apb-transport-btn apb-transport-btn--stop"
              :disabled="!isActive"
              @click="playbackStore.exit()"
              title="Stop replay"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>
            </button>
            <!-- Speed buttons right-aligned -->
            <div class="apb-speed-group apb-speed-group--right">
              <button
                v-for="(s, i) in PLAYBACK_SPEEDS" :key="i"
                class="apb-speed-btn"
                :class="{ 'apb-speed-btn--active': i === playbackStore.speedIdx }"
                :disabled="!isActive"
                @click="playbackStore.speedIdx = i"
              >{{ s }}×</button>
            </div>
          </div>
        </div>

        <!-- ── Timeline canvas ── -->
        <div class="sdr-radio-section sdr-radio-section--tight apb-section--timeline" :class="{ 'apb-section--locked': !isActive }">
          <div class="apb-timeline-wrap" ref="timelineWrap">
            <canvas ref="timelineCanvas" class="apb-timeline-canvas"
              @mousedown="isActive && onTimelineMousedown($event)"
              @mousemove="isActive && onTimelineMousemove($event)"
              @mouseleave="isActive && onTimelineMouseleave()"
            />
          </div>
        </div>

      </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { usePlaybackStore, PLAYBACK_SPEEDS } from '@/stores/playback'
import {
  CAL_MONTHS,
  toIso,
  formatDisplayDate,
  buildCalCells,
  prevMonth,
  nextMonth,
  type CalCell,
} from './airReplayCalendar'
import './AirReplayPanel.css'

const playbackStore = usePlaybackStore()

// ---- Setup form refs (declared first — referenced by computed below) ----
const pendingDate    = ref('')
const pendingEndDate = ref('')
const startHH     = ref<number | ''>('')
const startMM     = ref<number | ''>('')
const endHH       = ref<number | ''>('')
const endMM       = ref<number | ''>('')
const isLoading   = ref(false)

// ---- Available recorded periods ----
interface AvailableDate { date: string; start_ms: number; end_ms: number }
const availableDates = ref<AvailableDate[]>([])
const availableDateSet = computed(() => new Set(availableDates.value.map(d => d.date)))

async function fetchAvailableDates(): Promise<void> {
  try {
    const res = await fetch('/api/air/recordings/available-dates')
    if (res.ok) availableDates.value = await res.json()
  } catch { /* silent */ }
}

// For a selected date, the recorded start/end times in UTC minutes-of-day
const selectedDateExtent = computed<{ startMin: number; endMin: number } | null>(() => {
  if (!pendingDate.value) return null
  const entry = availableDates.value.find(d => d.date === pendingDate.value)
  if (!entry) return null
  const s = new Date(entry.start_ms)
  const e = new Date(entry.end_ms)
  return {
    startMin: s.getUTCHours() * 60 + s.getUTCMinutes(),
    endMin:   e.getUTCHours() * 60 + e.getUTCMinutes(),
  }
})

// Hours that contain at least some recorded data for the selected date
const availableHours = computed<Set<number>>(() => {
  const ext = selectedDateExtent.value
  if (!ext) return new Set()
  const hours = new Set<number>()
  for (let h = Math.floor(ext.startMin / 60); h <= Math.floor(ext.endMin / 60); h++) hours.add(h)
  return hours
})

function isHourAvailable(h: number): boolean { return availableHours.value.has(h) }

function availableMinutesFor(h: number): Set<number> {
  const ext = selectedDateExtent.value
  if (!ext) return new Set()
  const mins = new Set<number>()
  const hStart = h * 60
  const hEnd   = h * 60 + 59
  if (hEnd < ext.startMin || hStart > ext.endMin) return mins
  const from = Math.max(0,  ext.startMin - hStart)
  const to   = Math.min(59, ext.endMin   - hStart)
  for (let m = from; m <= to; m++) mins.add(m)
  return mins
}

// For the selected end date, the recorded end time in UTC minutes-of-day
const selectedEndDateExtent = computed<{ startMin: number; endMin: number } | null>(() => {
  if (!pendingEndDate.value) return null
  const entry = availableDates.value.find(d => d.date === pendingEndDate.value)
  if (!entry) return null
  const s = new Date(entry.start_ms)
  const e = new Date(entry.end_ms)
  return {
    startMin: s.getUTCHours() * 60 + s.getUTCMinutes(),
    endMin:   e.getUTCHours() * 60 + e.getUTCMinutes(),
  }
})

// Reset time fields when selected date changes; pre-fill start time from recorded data
watch(() => pendingDate.value, (iso) => {
  endHH.value = ''
  endMM.value = ''
  pendingEndDate.value = iso  // default end date to same day as start date
  if (iso) {
    const d = new Date(iso)
    endCalViewMonth.value = d.getMonth()
    endCalViewYear.value  = d.getFullYear()
  }
  const ext = selectedDateExtent.value
  if (ext) {
    startHH.value = Math.floor(ext.startMin / 60)
    startMM.value = ext.startMin % 60
  } else {
    startHH.value = ''
    startMM.value = ''
  }
})

// Pre-fill end time to latest available time on the selected end date
watch(() => pendingEndDate.value, () => {
  const ext = selectedEndDateExtent.value
  if (ext) {
    endHH.value = Math.floor(ext.endMin / 60)
    endMM.value = ext.endMin % 60
  } else {
    endHH.value = ''
    endMM.value = ''
  }
})

// ---- Custom dropdowns ----
type DdKey = 'startHH' | 'startMM' | 'endHH' | 'endMM'
const openDd     = ref<DdKey | null>(null)
const startHHWrap = ref<HTMLDivElement | null>(null)
const startMMWrap = ref<HTMLDivElement | null>(null)
const endHHWrap   = ref<HTMLDivElement | null>(null)
const endMMWrap   = ref<HTMLDivElement | null>(null)

interface DdRect { top: number; left: number; width: number }
const ddRect = ref<DdRect | null>(null)

const ddWrapMap: Record<DdKey, () => HTMLDivElement | null> = {
  startHH: () => startHHWrap.value,
  startMM: () => startMMWrap.value,
  endHH:   () => endHHWrap.value,
  endMM:   () => endMMWrap.value,
}

function toggleDd(key: DdKey): void {
  if (openDd.value === key) { openDd.value = null; ddRect.value = null; return }
  const el = ddWrapMap[key]()
  if (el) {
    const r = el.getBoundingClientRect()
    ddRect.value = { top: r.bottom, left: r.left, width: r.width }
  }
  openDd.value = key
}
function closeDd(): void { openDd.value = null; ddRect.value = null }

function _onDocClickDd(e: MouseEvent): void {
  const wraps = [startHHWrap.value, startMMWrap.value, endHHWrap.value, endMMWrap.value]
  if (wraps.every(w => !w || !w.contains(e.target as Node))) closeDd()
}

// ---- Calendar (start date) ----
const calWrap      = ref<HTMLDivElement | null>(null)
const calOpen      = ref(false)
const now          = new Date()
const calViewMonth = ref(now.getMonth())
const calViewYear  = ref(now.getFullYear())

// ---- Calendar (end date) ----
const endCalWrap      = ref<HTMLDivElement | null>(null)
const endCalOpen      = ref(false)
const endCalViewMonth = ref(now.getMonth())
const endCalViewYear  = ref(now.getFullYear())

const calCells = computed<CalCell[]>(() => buildCalCells({
  year: calViewYear.value,
  month: calViewMonth.value,
  selectedIso: pendingDate.value,
  availableSet: availableDateSet.value,
}))

function calPrevMonth(): void {
  const next = prevMonth(calViewMonth.value, calViewYear.value)
  calViewMonth.value = next.month; calViewYear.value = next.year
}
function calNextMonth(): void {
  const next = nextMonth(calViewMonth.value, calViewYear.value)
  calViewMonth.value = next.month; calViewYear.value = next.year
}
function selectCalDate(cell: CalCell): void {
  if (cell.disabled) return
  pendingDate.value = cell.iso
  if (pendingEndDate.value && pendingEndDate.value < cell.iso) pendingEndDate.value = cell.iso
  if (cell.other) {
    const d = new Date(cell.iso)
    calViewMonth.value = d.getMonth()
    calViewYear.value  = d.getFullYear()
  }
  calOpen.value = false
}

const endCalCells = computed<CalCell[]>(() => buildCalCells({
  year: endCalViewYear.value,
  month: endCalViewMonth.value,
  selectedIso: pendingEndDate.value,
  availableSet: availableDateSet.value,
  minIso: pendingDate.value || undefined,
}))

function endCalPrevMonth(): void {
  const next = prevMonth(endCalViewMonth.value, endCalViewYear.value)
  endCalViewMonth.value = next.month; endCalViewYear.value = next.year
}
function endCalNextMonth(): void {
  const next = nextMonth(endCalViewMonth.value, endCalViewYear.value)
  endCalViewMonth.value = next.month; endCalViewYear.value = next.year
}
function selectEndCalDate(cell: CalCell): void {
  if (cell.disabled) return
  pendingEndDate.value = cell.iso
  if (cell.other) {
    const d = new Date(cell.iso)
    endCalViewMonth.value = d.getMonth()
    endCalViewYear.value  = d.getFullYear()
  }
  endCalOpen.value = false
}

function _onDocClick(e: MouseEvent): void {
  if (calWrap.value && !calWrap.value.contains(e.target as Node)) calOpen.value = false
  if (endCalWrap.value && !endCalWrap.value.contains(e.target as Node)) endCalOpen.value = false
}

const startTotalMin = computed(() =>
  typeof startHH.value === 'number' && typeof startMM.value === 'number'
    ? startHH.value * 60 + startMM.value : null
)
const endTotalMin = computed(() =>
  typeof endHH.value === 'number' && typeof endMM.value === 'number'
    ? endHH.value * 60 + endMM.value : null
)

const isActive = computed(() => !!playbackStore.windowStartMs)

const startEpochMin = computed(() => {
  if (!pendingDate.value || startTotalMin.value === null) return null
  const base = new Date(pendingDate.value + 'T00:00:00Z').getTime()
  return base + startTotalMin.value * 60 * 1000
})

const endEpochMin = computed(() => {
  if (!pendingEndDate.value || endTotalMin.value === null) return null
  const base = new Date(pendingEndDate.value + 'T00:00:00Z').getTime()
  return base + endTotalMin.value * 60 * 1000
})

const canLoad = computed(() =>
  !!pendingDate.value &&
  !!pendingEndDate.value &&
  startEpochMin.value !== null &&
  endEpochMin.value   !== null &&
  endEpochMin.value > startEpochMin.value
)

const endTimeError = computed(() => {
  if (startEpochMin.value === null || endEpochMin.value === null) return null
  if (endEpochMin.value <= startEpochMin.value) return 'END must be after START'
  return null
})

watch(() => playbackStore.status, (s) => {
  if (s === 'idle') {
    isLoading.value = false
    calOpen.value = false
    fetchAvailableDates()
  }
  if (s !== 'loading') isLoading.value = false
})

function loadPlayback(): void {
  if (!canLoad.value) return
  isLoading.value = true
  const sh = startHH.value as number, sm = startMM.value as number
  const eh = endHH.value   as number, em = endMM.value   as number
  const startMs = new Date(`${pendingDate.value}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00Z`).getTime()
  const endMs   = new Date(`${pendingEndDate.value}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00Z`).getTime()
  playbackStore.pendingStartMs = startMs
  playbackStore.pendingEndMs   = endMs
  playbackStore.activate()
}

// ---- Timeline canvas ----
const timelineWrap   = ref<HTMLDivElement | null>(null)
const timelineCanvas = ref<HTMLCanvasElement | null>(null)
let   _hoverMs: number | null = null
let   _isDragging = false
let   _wasPlaying = false
let   _ro: ResizeObserver | null = null

const pad = (n: number) => String(n).padStart(2, '0')

function _fmtHHMM(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function _fmtDateTime(ms: number): string {
  const d = new Date(ms)
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
  return `${d.getUTCDate()} ${mo} ${d.getUTCFullYear()}`
}

function _fmtHMS(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function _drawTimeline(): void {
  const canvas = timelineCanvas.value
  const wrap   = timelineWrap.value
  if (!canvas || !wrap) return

  const dpr = window.devicePixelRatio || 1
  const W   = wrap.clientWidth
  const H   = wrap.clientHeight
  if (W === 0 || H === 0) return

  canvas.width  = W * dpr
  canvas.height = H * dpr
  canvas.style.width  = W + 'px'
  canvas.style.height = H + 'px'

  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  const start  = playbackStore.windowStartMs!
  const end    = playbackStore.windowEndMs!
  const cursor = playbackStore.cursorMs ?? start
  const span   = end - start
  if (span <= 0) return

  const PAD_L  = 8
  const PAD_R  = 8
  const trackW = W - PAD_L - PAD_R
  const trackY = Math.round(H * 0.65)
  const tickBaseH  = 7
  const tickMinorH = 4

  const msToX = (ms: number) => PAD_L + ((ms - start) / span) * trackW
  const cursorX = msToX(cursor)

  // Track line — played
  ctx.beginPath()
  ctx.moveTo(PAD_L, trackY)
  ctx.lineTo(cursorX, trackY)
  ctx.strokeStyle = '#c8ff00'
  ctx.lineWidth = 2
  ctx.stroke()

  // Track line — future
  ctx.beginPath()
  ctx.moveTo(cursorX, trackY)
  ctx.lineTo(PAD_L + trackW, trackY)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Ticks — dynamic step based on visible span so labels never collide.
  // Pick the smallest "nice" major step (in ms) such that pixels-per-major >= ~70.
  const MIN_LABEL_PX = 70
  const NICE_STEPS_MS = [
    1*60_000, 2*60_000, 5*60_000, 10*60_000, 15*60_000, 30*60_000,
    60*60_000, 2*60*60_000, 3*60*60_000, 6*60*60_000, 12*60*60_000, 24*60*60_000,
  ]
  const pxPerMs = trackW / span
  let majorStep = NICE_STEPS_MS[NICE_STEPS_MS.length - 1]
  for (const s of NICE_STEPS_MS) {
    if (s * pxPerMs >= MIN_LABEL_PX) { majorStep = s; break }
  }
  const minorStep = majorStep / 5
  const tickStart = Math.ceil(start / minorStep) * minorStep
  const labelFont = "600 10px 'Barlow Condensed', 'Barlow', sans-serif"

  ctx.font = labelFont
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  for (let ts = tickStart; ts <= end; ts += minorStep) {
    const x = msToX(ts)
    const isMajor = ts % majorStep === 0
    const h       = isMajor ? tickBaseH : tickMinorH
    const isPast  = ts <= cursor

    ctx.strokeStyle = isPast
      ? (isMajor ? 'rgba(200,255,0,0.7)' : 'rgba(200,255,0,0.4)')
      : (isMajor ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)')
    ctx.lineWidth = isMajor ? 1.5 : 1

    ctx.beginPath()
    ctx.moveTo(x, trackY - h)
    ctx.lineTo(x, trackY)
    ctx.stroke()

    if (isMajor) {
      ctx.fillStyle = isPast ? 'rgba(200,255,0,0.55)' : 'rgba(255,255,255,0.35)'
      ctx.fillText(_fmtHHMM(ts), x, trackY + 5)
    }
  }

  // Hover ghost
  if (_hoverMs !== null && !_isDragging) {
    const hx = msToX(_hoverMs)
    ctx.beginPath()
    ctx.moveTo(hx, trackY - 10)
    ctx.lineTo(hx, trackY + 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Cursor dot
  ctx.beginPath()
  ctx.arc(cursorX, trackY, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 4
  ctx.fill()
  ctx.shadowBlur = 0

  // Date + time labels: side by side with separator
  const labelY = trackY - 28
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = "600 12px 'Barlow Condensed', 'Barlow', sans-serif"
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText(_fmtDateTime(cursor), PAD_L, labelY)
  const dateW = ctx.measureText(_fmtDateTime(cursor)).width
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillText('   |   ', PAD_L + dateW, labelY)
  const sepW = ctx.measureText('   |   ').width
  ctx.font = "300 12px 'Barlow Condensed', 'Barlow', sans-serif"
  ctx.fillStyle = 'rgba(200,255,0,0.95)'
  ctx.fillText(_fmtHMS(cursor) + ' UTC', PAD_L + dateW + sepW, labelY)
}

function _xToMs(x: number): number {
  const canvas = timelineCanvas.value!
  const W      = canvas.clientWidth
  const start  = playbackStore.windowStartMs!
  const end    = playbackStore.windowEndMs!
  const PAD_L  = 8
  const PAD_R  = 8
  const trackW = W - PAD_L - PAD_R
  const frac   = Math.max(0, Math.min(1, (x - PAD_L) / trackW))
  return Math.round(start + frac * (end - start))
}

function onTimelineMousedown(e: MouseEvent): void {
  _isDragging = true
  _wasPlaying = playbackStore.status === 'playing'
  if (_wasPlaying) playbackStore.pause()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  playbackStore.seek(_xToMs(e.clientX - rect.left))
}

function onTimelineMousemove(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ms   = _xToMs(e.clientX - rect.left)
  if (_isDragging) { playbackStore.seek(ms) }
  else { _hoverMs = ms }
  _drawTimeline()
}

function onTimelineMouseleave(): void {
  _hoverMs = null
  _drawTimeline()
}

function _onMouseup(): void {
  if (_isDragging) {
    _isDragging = false
    if (_wasPlaying) playbackStore.play()
    _wasPlaying = false
  }
}

watch([() => playbackStore.cursorMs, () => playbackStore.status, () => playbackStore.windowStartMs], () => {
  nextTick(_drawTimeline)
})

function _initResizeObserver(): void {
  if (!timelineWrap.value) return
  _ro = new ResizeObserver(() => _drawTimeline())
  _ro.observe(timelineWrap.value)
}

watch(() => playbackStore.windowStartMs, (v) => {
  if (v !== null) nextTick(() => { _initResizeObserver(); _drawTimeline() })
  else { _ro?.disconnect(); _ro = null }
})

let _dateRefreshTimer: ReturnType<typeof setInterval> | null = null
let _paneObserver: MutationObserver | null = null

onMounted(() => {
  window.addEventListener('mouseup', _onMouseup)
  document.addEventListener('click', _onDocClick)
  document.addEventListener('click', _onDocClickDd)
  fetchAvailableDates()
  _dateRefreshTimer = setInterval(() => {
    if (!playbackStore.isActive) fetchAvailableDates()
  }, 5 * 60 * 1000)
  // Refresh available dates whenever the playback pane becomes active
  const pane = document.getElementById('msb-pane-playback')
  if (pane) {
    _paneObserver = new MutationObserver(() => {
      if (pane.classList.contains('msb-pane-active') && !playbackStore.isActive) {
        fetchAvailableDates()
      }
    })
    _paneObserver.observe(pane, { attributes: true, attributeFilter: ['class'] })
  }
  if (playbackStore.windowStartMs !== null) {
    nextTick(() => { _initResizeObserver(); _drawTimeline() })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mouseup', _onMouseup)
  document.removeEventListener('click', _onDocClick)
  document.removeEventListener('click', _onDocClickDd)
  if (_dateRefreshTimer !== null) clearInterval(_dateRefreshTimer)
  _paneObserver?.disconnect()
  _ro?.disconnect()
})
</script>

