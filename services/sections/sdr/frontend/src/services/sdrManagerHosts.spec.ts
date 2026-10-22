import { describe, it, expect, afterEach } from 'vitest'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import { fakeSdrManagerHosts, hostRejection } from '../testing/fakeSdrManagerHosts'
import {
  SdrManagerUnavailableError,
  findSdrManagerHosts,
  hostErrorMessage,
  requireSdrManagerHosts,
} from './sdrManagerHosts'

describe('sdrManagerHosts', () => {
  let withdraw: () => void = () => {}
  afterEach(() => {
    withdraw()
    withdraw = () => {}
  })

  describe('findSdrManagerHosts', () => {
    it('is undefined while sdr-manager-remote provides no radioSites capability', () => {
      expect(findSdrManagerHosts()).toBeUndefined()
    })

    it('is the provided capability once sdr-manager-remote is deployed', () => {
      withdraw = provideCapability('radioSites', fakeSdrManagerHosts)
      expect(findSdrManagerHosts()).toBe(fakeSdrManagerHosts)
    })

    it('follows the capability being withdrawn again', () => {
      withdraw = provideCapability('radioSites', fakeSdrManagerHosts)
      withdraw()
      expect(findSdrManagerHosts()).toBeUndefined()
    })
  })

  describe('requireSdrManagerHosts', () => {
    it('returns the provided capability', () => {
      withdraw = provideCapability('radioSites', fakeSdrManagerHosts)
      expect(requireSdrManagerHosts()).toBe(fakeSdrManagerHosts)
    })

    it('throws SdrManagerUnavailableError while it is not deployed', () => {
      expect(() => requireSdrManagerHosts()).toThrow(SdrManagerUnavailableError)
    })
  })

  describe('SdrManagerUnavailableError', () => {
    it('is an Error with its own name, code and an operator-facing message', () => {
      const error = new SdrManagerUnavailableError()
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('SdrManagerUnavailableError')
      expect(error.code).toBe('sdr_manager_unavailable')
      expect(error.message).toBe(
        "SDR Manager isn't running, so this device's settings can't be reached.",
      )
    })
  })

  describe('hostErrorMessage', () => {
    it("shows a host's rejection as it is", () => {
      expect(
        hostErrorMessage(
          hostRejection(409, 'port_conflict', 'Port 1234 is held by rtl-2.'),
          'Save failed.',
        ),
      ).toBe('Port 1234 is held by rtl-2.')
    })

    it('shows the SDR-Manager-not-running message', () => {
      expect(hostErrorMessage(new SdrManagerUnavailableError(), 'Save failed.')).toBe(
        "SDR Manager isn't running, so this device's settings can't be reached.",
      )
    })

    it('falls back for an Error without a code, such as a failed fetch', () => {
      expect(hostErrorMessage(new TypeError('Failed to fetch'), 'Save failed.')).toBe(
        'Save failed.',
      )
    })

    it('falls back for an Error whose code is not a string', () => {
      const error = Object.assign(new Error('raw'), { code: 409 })
      expect(hostErrorMessage(error, 'Flash failed.')).toBe('Flash failed.')
    })

    it('falls back for something that is not an Error, even with a string code', () => {
      expect(hostErrorMessage({ code: 'x', message: 'not an error' }, 'Save failed.')).toBe(
        'Save failed.',
      )
      expect(hostErrorMessage(undefined, 'Save failed.')).toBe('Save failed.')
    })
  })
})
