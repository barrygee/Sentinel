import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { SourceMode } from '../utils/sourceMode'

/** The app-wide data-source mode (Settings › Connectivity Mode). */
export type ConnectivityMode = SourceMode

export const useAppStore = defineStore('app', () => {
  const connectivityMode = ref<ConnectivityMode>('online')
  /** True in ONLINE mode — which basemap/feeds the app-wide views use. */
  const isOnline = computed(() => connectivityMode.value === 'online')
  const enabledDomains = ref<string[]>(['air', 'space', 'sea', 'land', 'sdr'])

  // Visibility of the map's right-edge controls rail (#side-menu on Air,
  // #space-side-menu on Space). Toggled from the footer's side-menu button on
  // those views, mirroring how the left footer button shows/hides the map
  // sidebar. Shared here because the rail lives in per-domain components while
  // the toggle lives in the app-level footer. Visible by default.
  const sideMenuOpen = ref(true)
  function toggleSideMenu() {
    sideMenuOpen.value = !sideMenuOpen.value
  }

  // Play a subtle blip when a new notification arrives. localStorage for instant
  // restore, DB hydrate on config upload. Default OFF.
  function _readNotificationSound(): boolean {
    try {
      return localStorage.getItem('appNotificationSound') === '1'
    } catch {
      return false
    }
  }
  const notificationSound = ref<boolean>(_readNotificationSound())
  function setNotificationSound(on: boolean) {
    notificationSound.value = on
    try {
      localStorage.setItem('appNotificationSound', on ? '1' : '0')
    } catch {}
  }
  async function hydrateNotificationSoundFromDb(): Promise<void> {
    try {
      const res = await fetch('/api/settings/app')
      if (!res.ok) return
      const data = await res.json()
      const v = data?.notificationSound
      if (typeof v === 'boolean' && v !== notificationSound.value) setNotificationSound(v)
    } catch {
      /* offline / transient */
    }
  }

  function setConnectivityMode(mode: ConnectivityMode) {
    if (connectivityMode.value === mode) return
    connectivityMode.value = mode
    window.dispatchEvent(new CustomEvent('sentinel:connectivityModeChanged', { detail: { mode } }))
  }

  function setEnabledDomains(domains: string[]) {
    enabledDomains.value = domains
  }

  function firstEnabledDomain(): string {
    return enabledDomains.value[0] ?? 'air'
  }

  return {
    connectivityMode,
    isOnline,
    enabledDomains,
    sideMenuOpen,
    toggleSideMenu,
    notificationSound,
    setNotificationSound,
    hydrateNotificationSoundFromDb,
    setConnectivityMode,
    setEnabledDomains,
    firstEnabledDomain,
  }
})
