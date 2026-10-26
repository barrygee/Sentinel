import { describe, it, expect } from 'vitest'
import { APP_MODES } from './appMode'

describe('APP_MODES', () => {
  it("lists every mode core reports, in core's order (backend/core/app_mode.py)", () => {
    expect(APP_MODES).toEqual(['full', 'sdr-manager-local-only'])
  })
})
