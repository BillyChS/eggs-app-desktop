const longDate = new Intl.DateTimeFormat('es-CR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Today as local YYYY-MM-DD. Never toISOString(): at 6 pm in Costa Rica that's already tomorrow. */
export function todayLocal(now: Date = new Date()): string {
  const year = now.getFullYear().toString().padStart(4, '0')
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Yesterday as local YYYY-MM-DD. By calendar day, so it works across a month or year. */
export function yesterdayLocal(now: Date = new Date()): string {
  return todayLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
}

/**
 * "2026-11-04" → "miércoles, 4 de noviembre de 2026", or null if it isn't a real date.
 * Built from its parts because new Date("2026-11-04") means midnight UTC, which is Nov 3 in Costa Rica.
 */
export function formatDateLong(localDate: string): string | null {
  const date = toLocalDate(localDate)
  return date ? longDate.format(date) : null
}

// By hand, because Intl adds periods ("mié.") and writes September as "sept", where Costa Rica says "set".
const SHORT_WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

/** "2026-11-04" → "mié 4 nov 2026", for rows where the long form doesn't fit. Null if it isn't a real date. */
export function formatDateShort(localDate: string): string | null {
  const date = toLocalDate(localDate)

  return date
    ? `${SHORT_WEEKDAYS[date.getDay()]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : null
}

function toLocalDate(localDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!match) {
    return null
  }

  const [year, month, day] = match.slice(1).map(Number)

  // setFullYear, because the Date constructor reads years below 100 as 19xx.
  const date = new Date(2000, 0, 1)
  date.setFullYear(year, month - 1, day)

  return date.getMonth() === month - 1 ? date : null
}
