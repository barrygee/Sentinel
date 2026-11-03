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

  it.each(['', 'A0', 'B0', 'A9'])(
    'draws an unidentified aircraft (category %s, unknown type) as a light single',
    (category) => {
      expect(resolveAircraftShape('ZZZZ', category)).toEqual({
        shapeKey: 'family:lightSingleProp',
        familyId: 'lightSingleProp',
      })
    },
  )

  it('draws an aircraft with no type and no category as a light single', () => {
    expect(resolveAircraftShape('', '')?.shapeKey).toBe('family:lightSingleProp')
  })

  it.each(['TWR', 'twr', 'GND', 'SERV'])('never draws the non-aircraft designator %s', (type) => {
    expect(resolveAircraftShape(type, '')).toBeNull()
  })

  it.each(['B3', 'B7'])('never draws category %s (not an aircraft)', (category) => {
    expect(resolveAircraftShape('', category)).toBeNull()
  })
})
