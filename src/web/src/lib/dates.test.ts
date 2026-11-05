import { describe, expect, it } from 'vitest'
import { formatDateLong, todayLocal, yesterdayLocal } from './dates'

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
