import { useSearchParams } from 'react-router'
import { formatDateLong, todayLocal } from '../../lib/dates'

const LIST = '/ventas'
const PARAM = 'fecha'
const EARLIEST_DAY = '2000-01-01'

/** A real date that can have sales. Comparing as text works because they're all YYYY-MM-DD. */
export function canHaveSales(day: string): boolean {
  return formatDateLong(day) !== null && day >= EARLIEST_DAY && day <= todayLocal()
}

export function listOfDay(day: string): string {
  return `${LIST}?${new URLSearchParams({ [PARAM]: day })}`
}

/**
 * The day being looked at. It lives in the address, so it survives a reload, and the app itself opens on today.
 */
export function useSaleDay() {
  const [params, setParams] = useSearchParams()
  const requested = params.get(PARAM)
  const day = requested && canHaveSales(requested) ? requested : todayLocal()

  return {
    day,
    /** Replaces the address, so that going through several days doesn't pile up in the history. */
    setDay: (next: string) => setParams({ [PARAM]: next }, { replace: true }),
  }
}
