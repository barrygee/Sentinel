// SDR audio composable — app-level singleton, instantiated in App.vue.
// AudioContext, AudioWorkletNode, and WebSockets are kept as plain module-level
// variables — never stored in Vue reactive state (proxy wrapping breaks audio APIs).

import { useSdrStore } from '@/stores/sdr'

let _audioCtx: AudioContext | null = null
let _workletNode: AudioWorkletNode | null = null
let _iqSocket: WebSocket | null = null
let _ctrlSocket: WebSocket | null = null
let _radioId: number | null = null

export function useSdrAudio() {
  const sdrStore = useSdrStore()

  function getAudioContext(): AudioContext {
    if (!_audioCtx) {
      // Re-use early context created in index.html if available
      _audioCtx = (window as Window & { _sdrEarlyCtx?: AudioContext })._sdrEarlyCtx
        ?? new AudioContext({ sampleRate: 48000 })
    }
    return _audioCtx
  }

  function connectCtrl(radioId: number) {
    if (_ctrlSocket && _ctrlSocket.readyState < 2) _ctrlSocket.close()
    _radioId = radioId
    const url = `ws://${location.host}/ws/sdr/${radioId}`
    _ctrlSocket = new WebSocket(url)
    _ctrlSocket.addEventListener('open', () => { sdrStore.connected = true })
    _ctrlSocket.addEventListener('close', () => { sdrStore.connected = false })
    _ctrlSocket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        if (msg.type === 'status') sdrStore.connected = true
      } catch {}
    })
  }

  function disconnectCtrl() {
    _ctrlSocket?.close()
    _ctrlSocket = null
    sdrStore.connected = false
  }

  function sendCmd(cmd: Record<string, unknown>) {
    if (_ctrlSocket?.readyState === WebSocket.OPEN) {
      _ctrlSocket.send(JSON.stringify(cmd))
    }
  }

  function tune(freqHz: number) {
    sdrStore.setFrequency(freqHz)
    sendCmd({ cmd: 'tune', frequency_hz: freqHz })
  }

  function setMode(mode: string) {
    sendCmd({ cmd: 'mode', mode })
  }

  function stop() {
    _iqSocket?.close(); _iqSocket = null
    _workletNode?.disconnect(); _workletNode = null
    sdrStore.setPlaying(false)
  }

  return { getAudioContext, connectCtrl, disconnectCtrl, tune, setMode, stop, sendCmd }
}
