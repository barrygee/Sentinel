import { describe, it, expect, vi, afterEach } from 'vitest'
import { announceHostsChanged, onHostsChanged } from './hostsChanged'

describe('hostsChanged', () => {
  const stops: Array<() => void> = []
  afterEach(() => {
    // The listener set is module-wide: leave it empty for the next case.
    for (const stop of stops.splice(0)) stop()
  })

  it('calls every listener on each announcement', () => {
    const first = vi.fn()
    const second = vi.fn()
    stops.push(onHostsChanged(first), onHostsChanged(second))

    announceHostsChanged()
    announceHostsChanged()

    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('stops calling a listener once it unsubscribes, and keeps calling the others', () => {
    const leaving = vi.fn()
    const staying = vi.fn()
    const stopLeaving = onHostsChanged(leaving)
    stops.push(onHostsChanged(staying))

    stopLeaving()
    announceHostsChanged()

    expect(leaving).not.toHaveBeenCalled()
    expect(staying).toHaveBeenCalledOnce()
  })

  it('unsubscribing twice is harmless', () => {
    const listener = vi.fn()
    const stop = onHostsChanged(listener)
    stop()
    expect(() => stop()).not.toThrow()
    announceHostsChanged()
    expect(listener).not.toHaveBeenCalled()
  })

  it('announcing with no listeners does nothing', () => {
    expect(() => announceHostsChanged()).not.toThrow()
  })

  it('a listener that throws is logged and does not stop the ones after it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('listener broke')
    const after = vi.fn()
    stops.push(
      onHostsChanged(() => {
        throw failure
      }),
      onHostsChanged(after),
    )

    expect(() => announceHostsChanged()).not.toThrow()

    expect(after).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      '[sdr-manager-remote] a hosts-changed listener failed:',
      failure,
    )
  })

  it('a listener that unsubscribes while being called does not disturb the round', () => {
    const later = vi.fn()
    let stopSelf: () => void = () => {}
    const selfRemoving = vi.fn(() => stopSelf())
    stopSelf = onHostsChanged(selfRemoving)
    stops.push(onHostsChanged(later))

    announceHostsChanged()
    announceHostsChanged()

    expect(selfRemoving).toHaveBeenCalledOnce()
    expect(later).toHaveBeenCalledTimes(2)
  })

  it('a listener subscribed during an announcement is first called on the next one', () => {
    const latecomer = vi.fn()
    let subscribed = false
    stops.push(
      onHostsChanged(() => {
        if (subscribed) return
        subscribed = true
        stops.push(onHostsChanged(latecomer))
      }),
    )

    announceHostsChanged()
    expect(latecomer).not.toHaveBeenCalled()

    announceHostsChanged()
    expect(latecomer).toHaveBeenCalledOnce()
  })
})
