import { describe, expect, it } from 'vitest'
import { NEW_PASSWORD_FIELD_ID } from './consolePasswordField'

describe('consolePasswordField', () => {
  it('exposes the id the CONSOLE PASSWORD card gives its new-password input', () => {
    expect(NEW_PASSWORD_FIELD_ID).toBe('sdr-manager-local-new-password')
  })
})
