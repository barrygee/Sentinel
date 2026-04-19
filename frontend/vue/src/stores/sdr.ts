import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface SdrRadio {
  id: number
  name: string
  host: string
  port: number
  enabled: boolean
  description?: string
}

export interface SdrFrequencyGroup {
  id: number
  name: string
  sort_order: number
}

export interface SdrStoredFrequency {
  id: number
  group_id: number | null
  label: string
  frequency_hz: number
  mode: string
}

export type SdrMode = 'NFM' | 'WFM' | 'AM' | 'USB' | 'LSB' | 'CW'

export const useSdrStore = defineStore('sdr', () => {
  const radios = ref<SdrRadio[]>([])
  const groups = ref<SdrFrequencyGroup[]>([])
  const frequencies = ref<SdrStoredFrequency[]>([])
  const currentRadioId = ref<number | null>(null)
  const playing = ref(false)
  const connected = ref(false)
  const currentFreqHz = ref(100_000_000)
  const currentMode = ref<SdrMode>('WFM')
  const currentGain = ref(30)
  const currentSquelch = ref(-60)
  const panelOpen = ref(false)
  const sampleRate = ref(2_048_000)

  function _restoreSession() {
    try {
      const id = sessionStorage.getItem('sdrLastRadioId')
      if (id) currentRadioId.value = parseInt(id)
      const freq = sessionStorage.getItem('sdrLastFreqHz')
      if (freq) currentFreqHz.value = parseInt(freq)
      const mode = sessionStorage.getItem('sdrLastMode') as SdrMode | null
      if (mode) currentMode.value = mode
      playing.value = sessionStorage.getItem('sdrPlaying') === '1'
    } catch {}
  }

  function _persistSession() {
    try {
      if (currentRadioId.value !== null) sessionStorage.setItem('sdrLastRadioId', String(currentRadioId.value))
      sessionStorage.setItem('sdrLastFreqHz', String(currentFreqHz.value))
      sessionStorage.setItem('sdrLastMode', currentMode.value)
      sessionStorage.setItem('sdrPlaying', playing.value ? '1' : '0')
    } catch {}
  }

  function setRadio(id: number) {
    currentRadioId.value = id
    _persistSession()
  }

  function setFrequency(hz: number) {
    currentFreqHz.value = hz
    _persistSession()
  }

  function setMode(mode: SdrMode) {
    currentMode.value = mode
    _persistSession()
  }

  function setPlaying(val: boolean) {
    playing.value = val
    _persistSession()
  }

  async function loadRadios() {
    try {
      const res = await fetch('/api/sdr/radios')
      if (res.ok) radios.value = await res.json()
    } catch {}
  }

  async function loadGroups() {
    try {
      const res = await fetch('/api/sdr/groups')
      if (res.ok) groups.value = await res.json()
    } catch {}
  }

  async function loadFrequencies() {
    try {
      const res = await fetch('/api/sdr/frequencies')
      if (res.ok) frequencies.value = await res.json()
    } catch {}
  }

  _restoreSession()

  return {
    radios, groups, frequencies, currentRadioId, playing, connected,
    currentFreqHz, currentMode, currentGain, currentSquelch, panelOpen, sampleRate,
    setRadio, setFrequency, setMode, setPlaying,
    loadRadios, loadGroups, loadFrequencies,
  }
})
