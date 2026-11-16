import { useSearchParams } from 'react-router'
import { listPeriodParams, readListPeriod } from '../periodView'
import type { Period } from '../summaries/periods'

const LIST = '/gastos'

/** "?fecha=…", "?semana=…" or "?mes=…", to carry the period to a screen opened from Gastos and back. */
export const expensesQuery = (period: Period) => `?${new URLSearchParams(listPeriodParams(period))}`

export const expensesAddress = (period: Period) => `${LIST}${expensesQuery(period)}`

/** The period Gastos shows. It lives in the address, so it survives a reload. */
export function useExpensesPeriod() {
  const [params, setParams] = useSearchParams()

  return {
    period: readListPeriod(params),
    /** Replaces the address, so that going through several days doesn't pile up in the history. */
    setPeriod: (next: Period) => setParams(listPeriodParams(next), { replace: true }),
  }
}
