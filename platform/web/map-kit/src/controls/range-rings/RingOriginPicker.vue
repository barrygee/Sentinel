<template>
  <div class="ring-origin-picker">
    <p v-if="notice" class="ring-origin-picker-notice" role="status">{{ notice }}</p>

    <div
      class="ring-origin-picker-group"
      role="radiogroup"
      aria-label="Centre range rings on"
      @keydown="onGroupKey"
    >
      <RingOriginOption
        v-for="(option, index) in options"
        :key="option.key"
        :name="option.name"
        :detail="option.detail"
        :selected="option.selected"
        :disabled="option.disabled"
        :tabindex="index === focusedIndex ? 0 : -1"
        @select="pick(index)"
      />
    </div>

    <p class="sr-only" role="status">{{ announcement }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Choosing what the range rings are centred on: the Sentinel's own position or
 * one of the SDR host sites.
 *
 * The named places are a radio group — the operator is picking exactly one of
 * a listed set, and each row shows its coordinates so the choice can be made
 * without hunting on the map.
 *
 * Rendered by the Settings row (`RangeRingOriginControl`), the one place the
 * origin is chosen. It owns the choices and the announcement; its host adds the
 * heading and the resolved-coordinates line.
 */
import { computed, ref, watch } from 'vue'
import { useSdrManagerSitesStore } from '@sentinel/shell-api/stores/sdrManagerSites'
import { useUserLocation } from '@sentinel/map-kit/composables/useUserLocation'
import { useRangeRingOrigin } from '@sentinel/map-kit/composables/useRangeRingOrigin'
import { haversineNm } from '@sentinel/map-kit/utils/distanceUtils'
import { formatLatitude, formatLongitude } from '@sentinel/map-kit/utils/locationUtils'
import { siteLabel } from '@sentinel/map-kit/utils/sdrManagerSiteLabel'
import RingOriginOption from '@sentinel/map-kit/controls/range-rings/RingOriginOption.vue'

/** One place the rings can be centred on, as the group lists it. */
interface OriginOption {
  key: string
  name: string
  /** Coordinates, plus distance from the operator where that is known. */
  detail: string
  /** Which SDR host this is, or null for the Sentinel's own position. */
  sdrManagerHostId: number | null
  /** A place with no position: listed for context, but not choosable. */
  disabled: boolean
  selected: boolean
}

const sdrManagerSitesStore = useSdrManagerSitesStore()
const { location: userLocation } = useUserLocation()
const {
  setting,
  notice,
  clearNotice,
  persistOriginToConfig,
  selectUserOrigin,
  selectSdrManagerOrigin,
} = useRangeRingOrigin()

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const announcement = ref('')

/** Coordinates as the panel writes them, with the distance from you appended. */
function placeDetail(lat: number, lon: number, withDistance: boolean): string {
  const coords = `${formatLatitude(lat)} ${formatLongitude(lon)}`
  const own = userLocation.value
  if (!withDistance || !own) return coords
  return `${coords} - ${Math.round(haversineNm(own.lat, own.lon, lat, lon))} NM`
}

const options = computed<OriginOption[]>(() => {
  const own = userLocation.value
  const list: OriginOption[] = [
    {
      key: 'user',
      name: 'Sentinel location',
      detail: own ? placeDetail(own.lat, own.lon, false) : 'Set your location first',
      sdrManagerHostId: null,
      disabled: own === null,
      selected: setting.value.kind === 'user',
    },
  ]
  for (const site of sdrManagerSitesStore.sites) {
    list.push({
      key: `sdr-manager:${site.id}`,
      name: siteLabel(site),
      detail: placeDetail(site.latitude, site.longitude, true),
      sdrManagerHostId: site.id,
      disabled: false,
      selected: setting.value.kind === 'sdr-manager' && setting.value.sdrManagerHostId === site.id,
    })
  }
  return list
})

/**
 * Roving tabindex: the group is one tab stop, landing on the current choice.
 * A pinned host that has dropped out of the fleet leaves nothing selected for
 * the moment before the removed-host watcher resets it, so the first row takes
 * the stop rather than leaving the group unreachable by keyboard.
 */
const focusedIndex = ref(0)
watch(
  options,
  (current) => {
    const selected = current.findIndex((option) => option.selected)
    focusedIndex.value = selected === -1 ? 0 : selected
  },
  { immediate: true },
)

/** Queue the config-database write for APPLY CHANGES. */
function stageWrite(): void {
  emit('stage', () => persistOriginToConfig())
}

/** The non-visual equivalent of the label the rings gain on the map. */
function announce(what: string): void {
  announcement.value = `Range rings centred on ${what}.`
}

function pick(index: number): void {
  const option = options.value[index]
  /* v8 ignore start -- the index comes from the rendered list */
  if (!option) return
  /* v8 ignore stop */
  // Rings around a position that does not exist would be rings around nothing;
  // the row says so, and the choice is refused rather than made and undrawn.
  if (option.disabled) return
  clearNotice()
  if (option.sdrManagerHostId === null) {
    selectUserOrigin()
    announce('the Sentinel location')
  } else {
    selectSdrManagerOrigin(option.sdrManagerHostId)
    announce(option.name)
  }
  stageWrite()
}

/** Move focus to a row and, radio-group style, choose it as you arrive. */
function moveTo(index: number, group: HTMLElement): void {
  focusedIndex.value = index
  const rows = group.querySelectorAll<HTMLElement>('[role="radio"]')
  rows[index]?.focus()
  pick(index)
}

function onGroupKey(event: KeyboardEvent): void {
  const group = event.currentTarget as HTMLElement
  const count = options.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault()
    moveTo((focusedIndex.value + 1) % count, group)
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault()
    moveTo((focusedIndex.value - 1 + count) % count, group)
  } else if (event.key === 'Home') {
    event.preventDefault()
    moveTo(0, group)
  } else if (event.key === 'End') {
    event.preventDefault()
    moveTo(count - 1, group)
  }
}
</script>

<style scoped>
.ring-origin-picker {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.ring-origin-picker-notice {
  margin: 0 0 8px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.45;
  color: #8a5a00;
}

.ring-origin-picker-group {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 320px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
