import { describe, expect, it } from 'vitest'
import { describePeriod, isCurrent, periodOf, rangeOf, readPeriod, step } from './periods'

describe('periods', () => {
  it.each([
    ['2026-11-02', '2026-11-02'], // Monday
    ['2026-11-05', '2026-11-02'], // Thursday
    ['2026-11-08', '2026-11-02'], // Sunday belongs to the week that started on Monday
    ['2026-11-09', '2026-11-09'], // next Monday
    ['2027-01-01', '2026-12-28'], // a week across the year
    ['2024-03-03', '2024-02-26'], // a week across a leap February
  ])('the week of %s starts on Monday %s', (day, monday) => {
    expect(periodOf('week', day)).toEqual({ kind: 'week', start: monday })
  })

  it('a month starts on its first day', () => {
    expect(periodOf('month', '2026-11-30')).toEqual({ kind: 'month', start: '2026-11-01' })
  })

  it.each([
    [{ kind: 'week', start: '2026-10-26' }, '2026-10-26', '2026-11-01'],
    [{ kind: 'month', start: '2024-02-01' }, '2024-02-01', '2024-02-29'],
    [{ kind: 'month', start: '2023-02-01' }, '2023-02-01', '2023-02-28'],
    [{ kind: 'month', start: '2026-10-01' }, '2026-10-01', '2026-10-31'],
    [{ kind: 'day', start: '2026-11-03' }, '2026-11-03', '2026-11-03'],
  ] as const)('a past %o runs from %s to %s', (period, from, to) => {
    expect(rangeOf(period, '2026-11-06')).toEqual({ from, to })
  })

  it('the current week and month stop at today', () => {
    expect(rangeOf({ kind: 'week', start: '2026-11-02' }, '2026-11-06')).toEqual({ from: '2026-11-02', to: '2026-11-06' })
    expect(rangeOf({ kind: 'month', start: '2026-11-01' }, '2026-11-06')).toEqual({ from: '2026-11-01', to: '2026-11-06' })
  })

  it('steps back and forward by its own kind, across years', () => {
    expect(step({ kind: 'month', start: '2026-01-01' }, -1)).toEqual({ kind: 'month', start: '2025-12-01' })
    expect(step({ kind: 'month', start: '2026-12-01' }, 1)).toEqual({ kind: 'month', start: '2027-01-01' })
    expect(step({ kind: 'week', start: '2026-12-28' }, 1)).toEqual({ kind: 'week', start: '2027-01-04' })
    expect(step({ kind: 'day', start: '2026-03-01' }, -1)).toEqual({ kind: 'day', start: '2026-02-28' })
  })

  it('knows the current period', () => {
    expect(isCurrent({ kind: 'week', start: '2026-11-02' }, '2026-11-08')).toBe(true)
    expect(isCurrent({ kind: 'week', start: '2026-10-26' }, '2026-11-08')).toBe(false)
    expect(isCurrent({ kind: 'month', start: '2026-11-01' }, '2026-11-30')).toBe(true)
  })

  it.each([
    [{ kind: 'month', start: '2026-09-01' }, 'setiembre de 2026'],
    [{ kind: 'week', start: '2026-11-02' }, '2 al 8 de noviembre de 2026'],
    [{ kind: 'week', start: '2026-10-26' }, '26 de octubre al 1 de noviembre de 2026'],
    [{ kind: 'week', start: '2026-12-28' }, '28 de diciembre de 2026 al 3 de enero de 2027'],
    [{ kind: 'day', start: '2026-11-06' }, 'viernes, 6 de noviembre de 2026'],
  ] as const)('writes %o as "%s"', (period, text) => {
    expect(describePeriod(period)).toBe(text)
  })

  it('reads the period from the address, lined up with its kind, and falls back to this month', () => {
    const read = (query: string) => readPeriod(new URLSearchParams(query), '2026-11-06')

    expect(read('periodo=semana&desde=2026-11-04')).toEqual({ kind: 'week', start: '2026-11-02' })
    expect(read('periodo=dia&desde=2026-11-04')).toEqual({ kind: 'day', start: '2026-11-04' })
    expect(read('')).toEqual({ kind: 'month', start: '2026-11-01' })
    expect(read('periodo=mes&desde=2026-12-01')).toEqual({ kind: 'month', start: '2026-11-01' })
    expect(read('periodo=año&desde=2026-11-01')).toEqual({ kind: 'month', start: '2026-11-01' })
    expect(read('periodo=dia&desde=2026-02-30')).toEqual({ kind: 'month', start: '2026-11-01' })
  })
})
