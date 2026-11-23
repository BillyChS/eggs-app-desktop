import { formatDateLong, formatDateShort, todayLocal, yesterdayLocal } from '../lib/dates'
import { periodOf, type Period } from './summaries/periods'

/**
 * The period a list page shows (Ventas, Gastos), in its address: "?fecha=2026-11-07", "?semana=2026-11-02" (its
 * Monday) or "?mes=2026-11". Resúmenes has its own way of saying it (`readPeriod`).
 */

const EARLIEST_DAY = '2000-01-01'

/** A real date that can have sales, abonos or expenses. Comparing as text works because they're all YYYY-MM-DD. */
export function canHaveActivity(day: string): boolean {
  return formatDateLong(day) !== null && day >= EARLIEST_DAY && day <= todayLocal()
}

/** The period in an address. Anything that can't be shown means today. */
export function readListPeriod(params: URLSearchParams, today = todayLocal()): Period {
  const month = params.get('mes')
  const week = params.get('semana')
  const day = params.get('fecha')

  if (month && /^\d{4}-\d{2}$/.test(month) && canHaveActivity(`${month}-01`)) {
    return { kind: 'month', start: `${month}-01` }
  }

  // Lined up on its Monday, so a hand-typed day inside a week still shows that whole week.
  if (week && canHaveActivity(week)) {
    return periodOf('week', week)
  }

  if (day && canHaveActivity(day)) {
    return { kind: 'day', start: day }
  }

  return { kind: 'day', start: today }
}

/** Whether an address says which period it's on, as opposed to falling back to today. */
export const hasListPeriod = (params: URLSearchParams) =>
  params.has('fecha') || params.has('semana') || params.has('mes')

export function listPeriodParams(period: Period): Record<string, string> {
  switch (period.kind) {
    case 'month':
      return { mes: period.start.slice(0, 7) }
    case 'week':
      return { semana: period.start }
    default:
      return { fecha: period.start }
  }
}

/** The day a new sale or expense starts on: the day being looked at, or today when it's a week or a month. */
export const startDayOf = (period: Period) => (period.kind === 'day' ? period.start : todayLocal())

/**
 * Where a list goes once something on a date is saved: the week or month it was opened from if the date is in it,
 * otherwise that date, so what was just saved is there to see.
 */
export function periodAfterSave(from: Period, date: string): Period {
  return from.kind !== 'day' && periodOf(from.kind, date).start === from.start ? from : { kind: 'day', start: date }
}

/** "hoy", "ayer", "ese día", "esta semana", "en la semana", "este mes" or "en el mes". */
export function periodWord(period: Period, today = todayLocal()): string {
  if (period.kind === 'day') {
    return period.start === today ? 'hoy' : period.start === yesterdayLocal() ? 'ayer' : 'ese día'
  }

  const current = periodOf(period.kind, today).start === period.start

  if (period.kind === 'week') {
    return current ? 'esta semana' : 'en la semana'
  }

  return current ? 'este mes' : 'en el mes'
}

/** "dom 8 nov", in a week's or month's rows: the month and year are in the subtitle already. */
export const dayInPeriod = (day: string) => formatDateShort(day)?.split(' ').slice(0, 3).join(' ') ?? day
