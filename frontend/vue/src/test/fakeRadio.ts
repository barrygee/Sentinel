import { reactive } from 'vue'
import { vi } from 'vitest'
import { provideCapability } from '@/shell/capabilities'
import type { RadioCapability } from '@/shell/radioCapability'

/**
 * A stand-in `radio` capability for specs of the sections that *use* the SDR
 * (Air/Sea/Land filters, the pass scheduler), so they no longer need the real
 * SDR store or engine. `connected` and `storedHz` are reactive, so a spec can
 * flip them after mount and see the UI follow.
 *
 * Call `provideFakeRadio()` before mounting; call the returned `withdraw()`
 * afterwards (an un-withdrawn provider makes the next `provide` throw).
 */
export function provideFakeRadio(initial: { connected?: boolean; storedHz?: number[] } = {}) {
  const state = reactive({
    connected: initial.connected ?? false,
    storedHz: [...(initial.storedHz ?? [])],
  })
  const tune = vi.fn<RadioCapability['tune']>()
  const restore = vi.fn<RadioCapability['restore']>()
  const frequencies = {
    ensureLoaded: vi.fn<RadioCapability['frequencies']['ensureLoaded']>(),
    has: vi.fn((frequencyHz: number) => state.storedHz.includes(frequencyHz)),
    save: vi.fn<RadioCapability['frequencies']['save']>().mockResolvedValue(undefined),
    remove: vi.fn<RadioCapability['frequencies']['remove']>().mockResolvedValue(undefined),
    ensureGroup: vi.fn<RadioCapability['frequencies']['ensureGroup']>().mockResolvedValue(1),
  }
  const capability: RadioCapability = {
    get connected() {
      return state.connected
    },
    tune,
    restore,
    frequencies,
  }
  const withdraw = provideCapability('radio', capability)
  return { state, tune, restore, frequencies, withdraw }
}
