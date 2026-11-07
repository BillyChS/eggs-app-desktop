import { describe, expect, it } from 'vitest'
import { formatDateLong, formatMoment, todayLocal, yesterdayLocal } from './dates'

describe('todayLocal', () => {
  it('is still today in the evening, when UTC is already tomorrow', () => {
    const evening = new Date('2026-11-04T20:00:00-06:00')

    expect(evening.toISOString().slice(0, 10)).toBe('2026-11-05')
    expect(todayLocal(evening)).toBe('2026-11-04')
  })

  it('pads month and day', () => {
    expect(todayLocal(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('yesterdayLocal', () => {
  it('is the day before in local time, in the evening too', () => {
    expect(yesterdayLocal(new Date('2026-11-04T20:00:00-06:00'))).toBe('2026-11-03')
  })

  it.each([
    [new Date(2026, 2, 1), '2026-02-28'],
    [new Date(2028, 2, 1), '2028-02-29'],
    [new Date(2027, 0, 1), '2026-12-31'],
  ])('crosses months and years: %s', (now, expected) => {
    expect(yesterdayLocal(now)).toBe(expected)
  })
})

describe('formatDateLong', () => {
  it('writes out the same day it was given', () => {
    expect(formatDateLong('2026-11-04')).toBe('miércoles, 4 de noviembre de 2026')
  })

  it.each(['', '2026-13-01', '2026-02-30', 'hoy'])('returns null for %j', (text) => {
    expect(formatDateLong(text)).toBeNull()
  })
})

describe('formatMoment', () => {
  const now = new Date(2026, 10, 7, 9, 0)

  it.each([
    ['2026-11-07T08:15:00', 'hoy 8:15 a. m.'],
    ['2026-11-07T00:05:00', 'hoy 12:05 a. m.'],
    ['2026-11-07T12:30:00', 'hoy 12:30 p. m.'],
    ['2026-11-06T17:40:59', 'ayer 5:40 p. m.'],
    ['2026-11-05T17:40:00', 'jueves 5 de noviembre'],
    ['2026-09-01T10:00:00', 'martes 1 de setiembre'],
    ['2025-12-31T10:00:00', 'miércoles 31 de diciembre de 2025'],
  ])('%s → %s', (text, expected) => {
    expect(formatMoment(text, now)).toBe(expected)
  })

  it('says ayer across a month', () => {
    expect(formatMoment('2026-10-31T18:00:00', new Date(2026, 10, 1, 8, 0))).toBe('ayer 6:00 p. m.')
  })

  it.each(['', '2026-11-07', '2026-11-07T24:00:00', '2026-02-30T08:00:00', '2026-11-07T08:15:00-06:00'])(
    'returns null for %j',
    (text) => {
      expect(formatMoment(text, now)).toBeNull()
    },
  )
})
