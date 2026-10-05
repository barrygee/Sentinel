import { describe, it, expect, afterEach } from 'vitest'
import { useRadio } from './useRadio'
import { provideFakeRadio } from '../testing/fakeRadio'

let withdraw: (() => void) | null = null
afterEach(() => {
  withdraw?.()
  withdraw = null
})

describe('shell/useRadio', () => {
  it('reports no radio, and not connected, while no section provides one', () => {
    const { radio, available, connected } = useRadio()
    expect(radio.value).toBeUndefined()
    expect(available.value).toBe(false)
    expect(connected.value).toBe(false)
  })

  it('exposes the provided radio and follows its connection state', () => {
    const fake = provideFakeRadio({ connected: false })
    withdraw = fake.withdraw
    const { radio, available, connected } = useRadio()

    expect(available.value).toBe(true)
    expect(radio.value?.tune).toBe(fake.tune)
    expect(connected.value).toBe(false)

    fake.state.connected = true
    expect(connected.value).toBe(true)
  })

  it('follows a provider that arrives after the composable was set up', () => {
    const { available, connected } = useRadio()
    expect(available.value).toBe(false)

    const fake = provideFakeRadio({ connected: true })
    withdraw = fake.withdraw

    expect(available.value).toBe(true)
    expect(connected.value).toBe(true)
  })
})
