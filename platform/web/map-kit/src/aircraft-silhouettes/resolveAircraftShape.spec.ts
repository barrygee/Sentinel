import { describe, expect, it } from 'vitest'
import { resolveAircraftShape } from './resolveAircraftShape'

describe('resolveAircraftShape', () => {
  it('draws a known type from its own entry, at its real size', () => {
    expect(resolveAircraftShape('A320', 'A3')).toEqual({
      shapeKey: 'type:A320',
      familyId: 'narrowbodyTwin',
      dimensions: { length: 37.6, span: 35.8 },
    })
  })

  it('prefers the type over the category it was broadcast with', () => {
    expect(resolveAircraftShape('C172', 'A5')?.shapeKey).toBe('type:C172')
  })

  it('normalises the designator’s case and surrounding space', () => {
    expect(resolveAircraftShape('  a320 ', '')?.shapeKey).toBe('type:A320')
  })

  it('falls back to the category’s family for an unknown type, with no size', () => {
    expect(resolveAircraftShape('ZZZZ', 'A7')).toEqual({
      shapeKey: 'family:helicopter',
      familyId: 'helicopter',
    })
  })

  it('normalises the category’s case and surrounding space', () => {
    expect(resolveAircraftShape('', ' b1 ')?.shapeKey).toBe('family:glider')
  })

  it.each([
    ['A1', 'lightSingleProp'],
    ['A2', 'businessJet'],
    ['A3', 'narrowbodyTwin'],
    ['A4', 'narrowbodyTwin'],
    ['A5', 'widebodyTwin'],
    ['A6', 'fighterSingleFin'],
    ['A7', 'helicopter'],
    ['B1', 'glider'],
    ['B2', 'balloon'],
    ['B4', 'microlight'],
    ['B6', 'uav'],
  ])('draws category %s as %s', (category, familyId) => {
    expect(resolveAircraftShape('', category)?.familyId).toBe(familyId)
  })

  it.each(['C1', 'C2', 'C3', 'C7', 'c1'])(
    'never draws surface category %s as an aircraft, even with an aircraft type',
    (category) => {
      expect(resolveAircraftShape('A320', category)).toBeNull()
    },
  )

  it.each(['A0', 'B0', 'B3', 'B7', ''])(
    'leaves category %s with no known type on its default symbol',
    (category) => {
      expect(resolveAircraftShape('', category)).toBeNull()
    },
  )
})
