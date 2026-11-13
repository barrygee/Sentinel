import { describe, expect, it } from 'vitest'
import { pageLocation } from './pageLocation'

describe('pageLocation', () => {
  it('is the window’s own location', () => {
    expect(pageLocation()).toBe(window.location)
  })
})
