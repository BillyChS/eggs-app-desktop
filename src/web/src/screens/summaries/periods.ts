import { formatDateLong, todayLocal } from '../../lib/dates'

export type PeriodKind = 'day' | 'week' | 'month'

/** A day, a week from Monday, or a month, named by its first day as local YYYY-MM-DD. */
export interface Period {
  kind: PeriodKind
  start: string
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** From its parts, never new Date("YYYY-MM-DD"), which is midnight UTC: the day before in Costa Rica. */
function toDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  const result = new Date(2000, 0, 1)
  result.setFullYear(year, month - 1, date)
  return result
}

const toDay = (date: Date) => todayLocal(date)

function addDays(day: string, days: number): string {
  const date = toDate(day)
  return toDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** The period of a kind that a day falls in. Weeks start on Monday. */
export function periodOf(kind: PeriodKind, day: string): Period {
  const date = toDate(day)

  if (kind === 'week') {
    // getDay() is 0 on Sunday, which belongs to the week that started six days before.
    return { kind, start: addDays(day, -((date.getDay() + 6) % 7)) }
  }

  if (kind === 'month') {
    return { kind, start: toDay(new Date(date.getFullYear(), date.getMonth(), 1)) }
  }

  return { kind, start: day }
}

function lastDayOf({ kind, start }: Period): string {
  if (kind === 'week') {
    return addDays(start, 6)
  }

  if (kind === 'month') {
    const date = toDate(start)
    return toDay(new Date(date.getFullYear(), date.getMonth() + 1, 0))
  }

  return start
}

/** The dates to ask for. The current week or month stops at today: the rest hasn't happened. */
export function rangeOf(period: Period, today = todayLocal()): { from: string; to: string } {
  const last = lastDayOf(period)
  return { from: period.start, to: last < today ? last : today }
}

/** The period just before (-1) or after (+1) this one. */
export function step(period: Period, direction: -1 | 1): Period {
  if (period.kind === 'month') {
    const date = toDate(period.start)
    return { kind: 'month', start: toDay(new Date(date.getFullYear(), date.getMonth() + direction, 1)) }
  }

  return { kind: period.kind, start: addDays(period.start, direction * (period.kind === 'week' ? 7 : 1)) }
}

export function isCurrent(period: Period, today = todayLocal()): boolean {
  return periodOf(period.kind, today).start === period.start
}

/** "jueves, 6 de noviembre de 2026", "3 al 9 de noviembre de 2026" or "noviembre de 2026". */
export function describePeriod(period: Period): string {
  if (period.kind === 'day') {
    return formatDateLong(period.start) ?? period.start
  }

  const first = toDate(period.start)

  if (period.kind === 'month') {
    return `${MONTHS[first.getMonth()]} de ${first.getFullYear()}`
  }

  const last = toDate(lastDayOf(period))
  const end = `${last.getDate()} de ${MONTHS[last.getMonth()]} de ${last.getFullYear()}`

  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getDate()} de ${MONTHS[first.getMonth()]} de ${first.getFullYear()} al ${end}`
  }

  return first.getMonth() !== last.getMonth()
    ? `${first.getDate()} de ${MONTHS[first.getMonth()]} al ${end}`
    : `${first.getDate()} al ${end}`
}

const KINDS: Record<string, PeriodKind> = { dia: 'day', semana: 'week', mes: 'month' }
const NAMES: Record<PeriodKind, string> = { day: 'dia', week: 'semana', month: 'mes' }

/** The period in an address like ?periodo=semana&desde=2026-11-02. Anything not usable means this month. */
export function readPeriod(params: URLSearchParams, today = todayLocal()): Period {
  const kind = KINDS[params.get('periodo') ?? '']
  const start = params.get('desde') ?? ''

  if (!kind || formatDateLong(start) === null || start < '2000-01-01' || start > today) {
    return periodOf('month', today)
  }

  // Lined up with the kind, so a hand-typed date inside a week still shows that whole week.
  return periodOf(kind, start)
}

export function periodParams(period: Period): Record<string, string> {
  return { periodo: NAMES[period.kind], desde: period.start }
}
