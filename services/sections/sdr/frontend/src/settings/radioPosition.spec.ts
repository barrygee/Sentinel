import { describe, expect, it } from 'vitest'
import { coordinateText, readRadioPosition } from './radioPosition'

describe('readRadioPosition', () => {
  it('is no position when both fields are blank', () => {
    expect(readRadioPosition(' ', '')).toEqual({ ok: true, latitude: null, longitude: null })
  })

  it('reads both coordinates, trimmed', () => {
    expect(readRadioPosition(' 54.95 ', '-1.53')).toEqual({
      ok: true,
      latitude: 54.95,
      longitude: -1.53,
    })
  })

  it.each([
    [
      '',
      '-1.5',
      { latitudeError: 'Give both latitude and longitude, or neither.', longitudeError: null },
    ],
    [
      '54.9',
      ' ',
      { latitudeError: null, longitudeError: 'Give both latitude and longitude, or neither.' },
    ],
  ])('names the missing half (%j, %j)', (latitude, longitude, errors) => {
    expect(readRadioPosition(latitude, longitude)).toEqual({ ok: false, ...errors })
  })

  it.each([
    ['90.1', '0', 'Latitude must be between -90 and 90.', null],
    ['-90.1', '0', 'Latitude must be between -90 and 90.', null],
    ['0', '180.5', null, 'Longitude must be between -180 and 180.'],
    ['north', 'east', 'Latitude must be a number.', 'Longitude must be a number.'],
  ])('refuses %j, %j', (latitude, longitude, latitudeError, longitudeError) => {
    expect(readRadioPosition(latitude, longitude)).toEqual({
      ok: false,
      latitudeError,
      longitudeError,
    })
  })

  it('accepts the limits themselves', () => {
    expect(readRadioPosition('-90', '180')).toEqual({ ok: true, latitude: -90, longitude: 180 })
  })
})

describe('coordinateText', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    [0, '0'],
    [-1.5358, '-1.5358'],
  ])('shows %j as %j', (value, text) => {
    expect(coordinateText(value)).toBe(text)
  })
})
