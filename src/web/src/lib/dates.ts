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

/**
 * "2026-11-04" → "martes, 4 de noviembre de 2026", or null if it isn't a real date.
 * Built from its parts because new Date("2026-11-04") means midnight UTC, which is Nov 3 in Costa Rica.
 */
export function formatDateLong(localDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!match) {
    return null
  }

  const [year, month, day] = match.slice(1).map(Number)

  // setFullYear, because the Date constructor reads years below 100 as 19xx.
  const date = new Date(2000, 0, 1)
  date.setFullYear(year, month - 1, day)

  return date.getMonth() === month - 1 ? longDate.format(date) : null
}
