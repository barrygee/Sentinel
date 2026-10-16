import { describe, it, expect } from 'vitest'
import { DOC_GROUP_KEYS } from './docsTypes'

describe('DOC_GROUP_KEYS', () => {
  it('lists the fixed groups in reading order', () => {
    expect(DOC_GROUP_KEYS).toEqual([
      'get-started',
      'app',
      'air',
      'space',
      'sea',
      'land',
      'sdr',
      'set-up-and-run',
      'develop',
    ])
  })

  it('has no duplicate keys', () => {
    expect(new Set(DOC_GROUP_KEYS).size).toBe(DOC_GROUP_KEYS.length)
  })
})
