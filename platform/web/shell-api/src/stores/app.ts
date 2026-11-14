import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getNamespace } from '@sentinel/shell-api/services/settingsApi'
import type { SourceMode } from '@sentinel/shell-api/utils/sourceMode'
import {
  MACHINE_NAME_MAX_LENGTH,
  thisMachineLabel as formatThisMachineLabel,
} from '@sentinel/shell-api/utils/thisMachineLabel'

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
    const data = await getNamespace('app')
    if (!data) return
    const storedValue = data.notificationSound
    if (typeof storedValue === 'boolean' && storedValue !== notificationSound.value) {
      setNotificationSound(storedValue)
    }
  }

  /**
   * The operator's name for this machine (`app.machineName`, Settings › App
   * Settings › Machine Name); blank while unnamed. Applied from the settings
   * payload at boot and on every in-place refresh (`applySettingsPayload`).
   */
  const machineName = ref('')
  /** This machine as its own screens name it: `<name> (This machine)`, or `This machine`. */
  const thisMachineLabel = computed(() => formatThisMachineLabel(machineName.value))
  /** Adopt a stored machine name; anything but text counts as unnamed. */
  function setMachineName(name: unknown) {
    machineName.value =
      typeof name === 'string' ? name.trim().slice(0, MACHINE_NAME_MAX_LENGTH) : ''
  }
  /** Re-read the machine name from the settings API (the Machine Name control's hydrate). */
  async function hydrateMachineNameFromDb(): Promise<void> {
    const data = await getNamespace('app')
    if (data) setMachineName(data.machineName)
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
    machineName,
    thisMachineLabel,
    setMachineName,
    hydrateMachineNameFromDb,
    setConnectivityMode,
    setEnabledDomains,
    firstEnabledDomain,
  }
})
