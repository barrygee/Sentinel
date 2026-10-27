import { describe, expect, it } from 'vitest'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import {
  authErrorMessage,
  configErrorMessage,
  deviceErrorMessage,
  hotspotCommandOutput,
  hotspotErrorMessage,
  serialFlashErrorMessage,
  serialFlashFailureMessage,
} from './errorMessages'

function apiError(code: string, message = 'API words', status = 409, context = {}) {
  return new SdrManagerApiError(status, code, message, context)
}

const UNREACHABLE = 'Could not reach SDR Manager. Check the connection and try again.'

describe('deviceErrorMessage', () => {
  it('translates a known code to operator wording instead of the API message', () => {
    expect(deviceErrorMessage(apiError('name_conflict'))).toBe(
      'That name is already used by another device.',
    )
  })

  it('falls back to the API message for an unknown code', () => {
    expect(deviceErrorMessage(apiError('something_new', 'Specific words'))).toBe('Specific words')
  })

  it('says the machine is unreachable on a status-0 error whatever its code', () => {
    expect(deviceErrorMessage(apiError('name_conflict', 'x', 0))).toBe(UNREACHABLE)
  })

  it('uses the generic sentence for a non-API error', () => {
    expect(deviceErrorMessage(new Error('boom'))).toBe('The device could not be updated.')
  })
})

describe('serialFlashErrorMessage / serialFlashFailureMessage', () => {
  it('translates a refused flash', () => {
    expect(serialFlashErrorMessage(apiError('serial_in_use'))).toContain('already used')
  })

  it('uses the generic sentence for a non-API error', () => {
    expect(serialFlashErrorMessage('nope')).toBe('The serial could not be written.')
  })

  it('translates a failure code from a notice', () => {
    expect(serialFlashFailureMessage('flash_failed')).toContain('failed partway')
  })

  it('uses the generic sentence for an unknown failure code', () => {
    expect(serialFlashFailureMessage('mystery')).toBe('The serial could not be written.')
  })
})

describe('hotspotErrorMessage', () => {
  it('translates a known code', () => {
    expect(hotspotErrorMessage(apiError('hotspot_busy'), 'fallback')).toContain('still running')
  })

  it('points command failures at the log', () => {
    expect(hotspotErrorMessage(apiError('hotspot_command_failed'), 'fallback')).toContain(
      'docker compose logs sdr-manager-local',
    )
  })

  it('uses the caller fallback for a non-API error', () => {
    expect(hotspotErrorMessage(new Error('x'), 'Could not save.')).toBe('Could not save.')
  })

  it('uses the API message for an unknown code', () => {
    expect(hotspotErrorMessage(apiError('odd', 'Odd thing'), 'fallback')).toBe('Odd thing')
  })
})

describe('hotspotCommandOutput', () => {
  it('returns the stderr tail when the API sent one', () => {
    expect(hotspotCommandOutput(apiError('x', 'm', 500, { stderr_tail: 'nmcli: failed' }))).toBe(
      'nmcli: failed',
    )
  })

  it('returns null for an empty stderr tail', () => {
    expect(hotspotCommandOutput(apiError('x', 'm', 500, { stderr_tail: '' }))).toBeNull()
  })

  it('returns null for a non-string stderr tail', () => {
    expect(hotspotCommandOutput(apiError('x', 'm', 500, { stderr_tail: 5 }))).toBeNull()
  })

  it('returns null when there is no stderr tail', () => {
    expect(hotspotCommandOutput(apiError('x'))).toBeNull()
  })

  it('returns null for a non-API error', () => {
    expect(hotspotCommandOutput(new Error('x'))).toBeNull()
  })
})

describe('configErrorMessage', () => {
  it('translates the unsupported-version code', () => {
    expect(configErrorMessage(apiError('unsupported_config_version'), 'fb')).toContain('newer')
  })

  it('uses the fallback for a non-API error', () => {
    expect(configErrorMessage(null, 'Could not import.')).toBe('Could not import.')
  })
})

describe('authErrorMessage', () => {
  it('shows the API message verbatim', () => {
    expect(authErrorMessage(apiError('invalid_credentials', 'Wrong password', 401), 'fb')).toBe(
      'Wrong password',
    )
  })

  it('uses the fallback for a non-API error', () => {
    expect(authErrorMessage(new Error('x'), 'That password is not correct.')).toBe(
      'That password is not correct.',
    )
  })

  it('says the machine is unreachable on a status-0 error', () => {
    expect(authErrorMessage(apiError('network_error', 'x', 0), 'fb')).toBe(UNREACHABLE)
  })
})
