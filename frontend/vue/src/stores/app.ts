import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ConnectivityMode = 'auto' | 'online' | 'offgrid'

export const useAppStore = defineStore('app', () => {
  const connectivityMode = ref<ConnectivityMode>('auto')
  const isOnline = ref(true)
  const enabledDomains = ref<string[]>(['air', 'space', 'sea', 'land', 'sdr'])

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

  function setOnline(online: boolean) {
    isOnline.value = online
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
    notificationSound,
    setNotificationSound,
    hydrateNotificationSoundFromDb,
    setConnectivityMode,
    setOnline,
    setEnabledDomains,
    firstEnabledDomain,
  }
})
