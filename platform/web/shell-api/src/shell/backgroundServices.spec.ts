import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerBackgroundService,
  resetBackgroundServicesForTests,
  startBackgroundServices,
} from './backgroundServices'

beforeEach(() => {
  resetBackgroundServicesForTests()
})

describe('shell/backgroundServices', () => {
  it('starts every registered service, in registration order', () => {
    const started: string[] = []
    registerBackgroundService({ id: 'air-alerts', start: () => void started.push('air') })
    registerBackgroundService({ id: 'space-alerts', start: () => void started.push('space') })

    startBackgroundServices()

    expect(started).toEqual(['air', 'space'])
  })

  it('starts nothing when no section registered a service', () => {
    expect(() => startBackgroundServices()).not.toThrow()
  })

  it('refuses a second service with the same id', () => {
    registerBackgroundService({ id: 'air-alerts', start: () => undefined })
    expect(() => registerBackgroundService({ id: 'air-alerts', start: () => undefined })).toThrow(
      'Background service "air-alerts" is already registered',
    )
  })
})
