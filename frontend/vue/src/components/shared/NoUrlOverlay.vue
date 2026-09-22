<template>
  <NoDataOverlay
    v-if="visible"
    :domain="domain"
    :title="title"
    :message="message"
    @open-settings="openSettings"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { onlineKey, offgridKey } from '@/utils/domainKeys'
import NoDataOverlay from './NoDataOverlay.vue'

const props = defineProps<{ domain: string }>()

const appStore = useAppStore()
const settingsStore = useSettingsStore()

const hasUrl = ref(true)

function _readSourceOverride(): string {
  try {
    return localStorage.getItem(`sentinel_${props.domain}_sourceOverride`) || 'auto'
  } catch {
    return 'auto'
  }
}

const _sourceOverride = ref(_readSourceOverride())

function _effectiveMode(): string {
  const override = _sourceOverride.value
  if (override !== 'auto') return override
  return appStore.connectivityMode
}

// The space domain has no remote data source — satellite positions are
// propagated locally from TLE data stored in the SQLite database. So the gate
// is "does the DB hold TLE data?" rather than "is a URL configured?".
const _isSpace = props.domain === 'space'

// The land domain is also URL-less: its data is the local APRS decoder (a
// sidecar that plots stations directly), not a configured feed URL. So the map
// base always shows and APRS markers populate it as packets arrive — the
// URL gate does not apply.
const _isLand = props.domain === 'land'

// Sea is URL-less in ONE direction only, which is why it can't be exempted
// outright like land. Online it reads AISStream over a configured wss:// URL,
// but off grid it has two possible sources: such a URL (a local AISStream-
// compatible aggregator) OR the SDR AIS decoder, which has no URL at all. So
// an off-grid Sea with a receiver designated is properly configured, and
// gating it on a URL would blank the section for exactly the setup the
// off-grid decoder exists to serve.
const _isSea = props.domain === 'sea'

/** True when SEA has an SDR designated as its off-grid AIS receiver. */
function _hasAisReceiver(settings: Record<string, unknown>): boolean {
  return typeof settings.aisSdrRadioId === 'number'
}

const title = computed(() =>
  _isSpace ? 'No satellite data available.' : 'No data source configured.',
)

const message = computed(() => {
  if (_isSpace) {
    return 'No satellite TLE data is stored in the local database. Import TLE data — or set an Online Data Source URL and fetch it — in settings to continue.'
  }
  const isOffgrid = _effectiveMode() === 'offgrid'
  if (isOffgrid && _isSea) {
    return 'Off Grid mode is active but SEA has no off-grid source. Either choose an AIS receiver under Settings › SEA › AIS › AIS SDR, or set an Off Grid Data Source URL — or switch connectivity mode to continue.'
  }
  const mode = isOffgrid ? 'Off Grid' : 'Online'
  const setting = isOffgrid ? 'Off Grid Data Source' : 'Online Data Source'
  return `${mode} mode is active but no ${setting} URL has been set for ${props.domain.toUpperCase()}. Configure a URL in settings or switch connectivity mode to continue.`
})
const visible = computed(() => !hasUrl.value)

// While the overlay is up the section has no usable content, so NoDataOverlay
// suppresses the surrounding map chrome for as long as it is mounted.

function _isPlaceholder(url: string): boolean {
  const t = url.trim()
  return !t || /^https?:\/\/?$/.test(t) || /^http:\/\/localhost\/?$/.test(t)
}

function _lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function check() {
  const ns = props.domain
  const mode = _effectiveMode()
  const _oKey = offgridKey(ns)
  const _nKey = onlineKey(ns)

  // Space data is served from the local TLE database, not a configured URL.
  // Without backend access we can't know if the DB has data, so assume it does
  // and let checkWithBackend() correct it — never block on a missing URL.
  /* v8 ignore start -- check() is only invoked for URL-based domains;
     checkWithBackend() handles the URL-less space/land domains entirely and never
     falls through to here, so this guard is defensive and unreachable in practice */
  if (_isSpace || _isLand) {
    hasUrl.value = true
    return
  }
  /* v8 ignore stop */

  if (mode === 'offgrid') {
    const raw = _lsGet(`sentinel_${ns}_${_oKey}`)
    if (!raw) {
      hasUrl.value = false
      return
    }
    try {
      const src = JSON.parse(raw)
      hasUrl.value = !!(src?.url && !_isPlaceholder(src.url))
    } catch {
      hasUrl.value = false
    }
  } else {
    const url = _lsGet(`sentinel_${ns}_${_nKey}`)
    hasUrl.value = url.length > 0 && !_isPlaceholder(url)
  }
}

async function checkWithBackend() {
  // Land is served entirely by the local APRS decoder — never gate its map on a
  // configured URL.
  if (_isLand) {
    hasUrl.value = true
    return
  }
  const ns = props.domain
  const mode = _effectiveMode()
  const _oKey = offgridKey(ns)
  const _nKey = onlineKey(ns)

  // Space has no remote data source: gate purely on whether the local TLE
  // database holds any satellites, in both online and offgrid modes.
  if (_isSpace) {
    try {
      const res = await fetch('/api/space/tle/status')
      if (!res.ok) {
        hasUrl.value = true
        return
      }
      const data = (await res.json()) as { total?: number }
      hasUrl.value = (data.total ?? 0) > 0
    } catch {
      // Backend unreachable — don't block the section on a transient failure.
      hasUrl.value = true
    }
    return
  }

  try {
    const res = await fetch(`/api/settings/${ns}`)
    if (!res.ok) {
      check()
      return
    }
    const data = (await res.json()) as Record<string, unknown>
    let backendUrl = ''
    if (mode === 'offgrid') {
      const src = data[_oKey] as { url?: string } | undefined
      backendUrl = src?.url ?? ''
    } else {
      backendUrl = (data[_nKey] as string) ?? ''
    }
    if (mode === 'offgrid' && _isSea && _hasAisReceiver(data)) {
      // An AIS receiver is a source in its own right — no URL needed.
      hasUrl.value = true
      return
    }
    if (backendUrl && !_isPlaceholder(backendUrl)) {
      hasUrl.value = true
      const lsKey = mode === 'offgrid' ? `sentinel_${ns}_${_oKey}` : `sentinel_${ns}_${_nKey}`
      try {
        localStorage.setItem(lsKey, mode === 'offgrid' ? JSON.stringify(data[_oKey]) : backendUrl)
      } catch {}
    } else {
      hasUrl.value = false
    }
  } catch {
    check()
  }
}

function openSettings() {
  settingsStore.openPanel(props.domain)
}

function onSettingsClosed() {
  _sourceOverride.value = _readSourceOverride()
  checkWithBackend()
}

watch(
  () => appStore.connectivityMode,
  () => {
    checkWithBackend()
  },
)
watch(_sourceOverride, () => {
  checkWithBackend()
})

onMounted(() => {
  checkWithBackend()
  window.addEventListener('sentinel:sourceOverrideChanged', onSettingsClosed)
})
onUnmounted(() => {
  window.removeEventListener('sentinel:sourceOverrideChanged', onSettingsClosed)
})

useDocumentEvent('settings-panel-closed', onSettingsClosed)
</script>
