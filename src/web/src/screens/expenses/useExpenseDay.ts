import { useSearchParams } from 'react-router'
import { todayLocal } from '../../lib/dates'
// Expenses happen on the same days as sales: real ones, from 2000 to today.
import { canHaveSales as canHaveExpenses } from '../sales/useSaleDay'

const LIST = '/gastos'
const PARAM = 'fecha'

export { canHaveExpenses }

export function listOfExpenseDay(day: string): string {
  return `${LIST}?${new URLSearchParams({ [PARAM]: day })}`
}

/** The day being looked at in Gastos. It lives in the address, so it survives a reload. */
export function useExpenseDay() {
  const [params, setParams] = useSearchParams()
  const requested = params.get(PARAM)
  const day = requested && canHaveExpenses(requested) ? requested : todayLocal()

  return {
    day,
    /** Replaces the address, so that going through several days doesn't pile up in the history. */
    setDay: (next: string) => setParams({ [PARAM]: next }, { replace: true }),
  }
}
