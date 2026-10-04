import { describe, it, expect, afterEach } from 'vitest'
import { computed } from 'vue'
import { getCapability, provideCapability } from './capabilities'
import type { RadioCapability } from './radioCapability'

function fakeRadio(): RadioCapability {
  return {
    connected: false,
    tune: () => undefined,
    restore: () => undefined,
    frequencies: {
      ensureLoaded: () => undefined,
      has: () => false,
      save: async () => undefined,
      remove: async () => undefined,
      ensureGroup: async () => 1,
    },
    decoders: {
      activeRadioId: () => null,
      refresh: async () => undefined,
      start: async () => true,
      stop: async () => true,
    },
    listRadios: async () => [],
  }
}

const withdrawals: Array<() => void> = []
afterEach(() => {
  while (withdrawals.length) withdrawals.pop()!()
})

describe('shell/capabilities', () => {
  it('has no provider until a section offers one', () => {
    expect(getCapability('radio')).toBeUndefined()
  })

  it('returns the provided implementation', () => {
    const radio = fakeRadio()
    withdrawals.push(provideCapability('radio', radio))
    expect(getCapability('radio')).toBe(radio)
  })

  it('withdrawing removes the provider', () => {
    const withdraw = provideCapability('radio', fakeRadio())
    withdraw()
    expect(getCapability('radio')).toBeUndefined()
  })

  it('refuses a second provider for the same capability', () => {
    withdrawals.push(provideCapability('radio', fakeRadio()))
    expect(() => provideCapability('radio', fakeRadio())).toThrow(
      'Capability "radio" is already provided',
    )
  })

  it('a stale withdraw does not remove a newer provider', () => {
    const withdrawFirst = provideCapability('radio', fakeRadio())
    withdrawFirst()
    const second = fakeRadio()
    withdrawals.push(provideCapability('radio', second))

    withdrawFirst()

    expect(getCapability('radio')).toBe(second)
  })

  it('lookups are reactive, so the UI follows a provider arriving and leaving', () => {
    const available = computed(() => getCapability('radio') !== undefined)
    expect(available.value).toBe(false)

    const withdraw = provideCapability('radio', fakeRadio())
    expect(available.value).toBe(true)

    withdraw()
    expect(available.value).toBe(false)
  })

  it('keeps each capability separate: radioSites is provided on its own', () => {
    const radioSites = {
      listSites: async () => [],
      listDevices: async () => ({ hostCount: 0, hosts: [] }),
    }
    withdrawals.push(provideCapability('radioSites', radioSites))

    expect(getCapability('radioSites')).toBe(radioSites)
    expect(getCapability('radio')).toBeUndefined()
  })
})
