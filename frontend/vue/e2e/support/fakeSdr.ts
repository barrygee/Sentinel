import type { Page, WebSocketRoute } from '@playwright/test'

/**
 * A reusable fake SDR backend for e2e specs that need the radio actually
 * "playing" — the control socket (`/ws/sdr/{id}`) and IQ socket
 * (`/ws/sdr/{id}/iq`) that `useSdrControlSocket`/`useSdrAudio` open, stood up
 * entirely in the Playwright process via `page.routeWebSocket`. No real
 * dongle, no backend.
 *
 * Protocol notes (see `backend/services/sdr.py` `_broadcast_iq` and
 * `backend/routers/sdr.py`, and `frontend/vue/src/components/sdr/SdrPanel.vue`
 * `onCtrlSocketMessage`):
 *  - Control socket: JSON frames both ways. The panel sends `{cmd: ...}`
 *    objects (tune/mode/gain/squelch/sample_rate/fft_size/demod/claim/release/
 *    ping); the server replies with `{type: 'status'|'spectrum'|'control'|
 *    'error'|'pong', ...}`.
 *  - IQ socket: binary frames only. Each frame is an 8-byte little-endian
 *    header — `<II` (uint32 sample_rate, uint32 center_hz) — followed by
 *    interleaved unsigned-byte I/Q samples (offset-binary, centred on 127.5).
 */

/** Everything the fake backend observed, so a spec can assert on it directly. */
export interface FakeSdrRecorder {
  /** Number of times the control socket (`/ws/sdr/{id}`) was opened. */
  controlOpens: number
  /** Number of times the control socket was closed (either side). */
  controlCloses: number
  /** Number of times the IQ socket (`/ws/sdr/{id}/iq`) was opened. */
  iqOpens: number
  /** Number of times the IQ socket was closed (either side). */
  iqCloses: number
  /** Total IQ frames sent across every IQ socket connection. */
  iqFramesSent: number
  /** Every JSON command the panel sent over the control socket, in order. */
  controlCommands: Array<Record<string, unknown>>
}

export interface FakeSdrOptions {
  /** Radio id the fake backend answers for. Defaults to 1. */
  radioId?: number
  /** IQ sample rate reported in every frame header. Defaults to 2.048 Msps. */
  sampleRate?: number
  /** Hardware centre frequency reported in status/IQ frames. Defaults to 145.8 MHz. */
  centerHz?: number
  /** How often an IQ frame is pushed, in ms. Defaults to 40ms (~25fps, matching the real backend). */
  iqIntervalMs?: number
}

/**
 * Builds one IQ sample block: `sampleCount` interleaved (I, Q) unsigned bytes
 * around the 127.5 offset-binary midpoint, varied deterministically so the
 * frame is not literally all-identical bytes (closer to a real signal without
 * needing any actual DSP).
 */
function buildIqFrame(sampleRate: number, centerHz: number, sampleCount: number): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32LE(sampleRate >>> 0, 0)
  header.writeUInt32LE(centerHz >>> 0, 4)
  const body = Buffer.alloc(sampleCount * 2)
  for (let index = 0; index < sampleCount; index++) {
    body[index * 2] = 128 + (index % 16)
    body[index * 2 + 1] = 128 - (index % 16)
  }
  return Buffer.concat([header, body])
}

/**
 * Install the fake SDR WebSocket backend on `/ws/sdr/**`. Call once per test,
 * before `page.goto()`. Combine with a `page.route('/api/sdr/radios', ...)`
 * override (and the other REST stubs `installDefaultMocks` already supplies)
 * to make the radio selectable.
 */
export async function installFakeSdr(
  page: Page,
  options: FakeSdrOptions = {},
): Promise<FakeSdrRecorder> {
  const radioId = options.radioId ?? 1
  const sampleRate = options.sampleRate ?? 2_048_000
  const centerHz = options.centerHz ?? 145_800_000
  const iqIntervalMs = options.iqIntervalMs ?? 40

  const recorder: FakeSdrRecorder = {
    controlOpens: 0,
    controlCloses: 0,
    iqOpens: 0,
    iqCloses: 0,
    iqFramesSent: 0,
    controlCommands: [],
  }

  await page.routeWebSocket(/\/ws\/sdr\/\d+(\/iq)?$/, (webSocket: WebSocketRoute) => {
    const isIqSocket = webSocket.url().endsWith('/iq')

    if (isIqSocket) {
      recorder.iqOpens++
      const timer = setInterval(() => {
        webSocket.send(buildIqFrame(sampleRate, centerHz, 1024))
        recorder.iqFramesSent++
      }, iqIntervalMs)
      webSocket.onClose(() => {
        clearInterval(timer)
        recorder.iqCloses++
      })
      // The IQ socket never receives commands from the page — nothing to wire
      // up in onMessage.
      return
    }

    recorder.controlOpens++
    // Initial status, mirroring what a freshly (re)connected backend sends:
    // not yet "connected" (streaming) until a tune has been issued.
    webSocket.send(
      JSON.stringify({
        type: 'status',
        connected: false,
        center_hz: centerHz,
        mode: 'AM',
        gain_db: 30,
        gain_auto: true,
        sample_rate: sampleRate,
      }),
    )

    webSocket.onMessage((rawMessage) => {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(rawMessage.toString()) as Record<string, unknown>
      } catch {
        return
      }
      recorder.controlCommands.push(parsed)

      if (parsed.cmd === 'tune') {
        const frequencyHz = Number(parsed.frequency_hz) || centerHz
        webSocket.send(
          JSON.stringify({
            type: 'status',
            connected: true,
            center_hz: frequencyHz,
            mode: 'AM',
            gain_db: 30,
            gain_auto: true,
            sample_rate: sampleRate,
          }),
        )
        webSocket.send(
          JSON.stringify({
            type: 'spectrum',
            bins: new Array(64).fill(-90),
            center_hz: frequencyHz,
            sample_rate: sampleRate,
            timestamp_ms: Date.now(),
          }),
        )
      } else if (parsed.cmd === 'ping') {
        webSocket.send(JSON.stringify({ type: 'pong' }))
      }
    })

    webSocket.onClose(() => {
      recorder.controlCloses++
    })
  })

  // Keep the fixture radio id in sync with the fake backend's, so a spec that
  // only calls installFakeSdr (without its own /api/sdr/radios override)
  // still gets a usable, matching radio.
  await page.route('/api/sdr/radios', (route) => {
    void route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: radioId,
          name: 'RTL-SDR v3',
          host: '192.168.1.100',
          port: 1234,
          enabled: true,
          description: 'Primary receiver',
        },
      ]),
    })
  })

  return recorder
}
