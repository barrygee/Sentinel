import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ConnectivityMode = 'auto' | 'online' | 'offgrid'

export const useAppStore = defineStore('app', () => {
  const connectivityMode = ref<ConnectivityMode>('auto')
  const isOnline = ref(true)
  const enabledDomains = ref<string[]>(['air', 'space', 'sea', 'land', 'sdr'])

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

  return { connectivityMode, isOnline, enabledDomains, setConnectivityMode, setOnline, setEnabledDomains, firstEnabledDomain }
})
