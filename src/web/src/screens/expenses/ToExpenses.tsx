import { Navigate, useSearchParams } from 'react-router'
import { readListPeriod } from '../periodView'
import { expensesAddress } from './expensesView'

/**
 * Where the old Nuevo gasto and Editar gasto pages were: they're popups over Gastos now, so these addresses go to
 * Gastos, on the period they carried, and nothing that still points at them breaks.
 */
export function ToExpenses() {
  const [params] = useSearchParams()
  return <Navigate to={expensesAddress(readListPeriod(params))} replace />
}
