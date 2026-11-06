import { useSearchParams } from 'react-router'
import { statementOf } from '../customers/customerText'
import { canHaveSales, listOfDay } from '../sales/useSaleDay'

/**
 * Where an abono's screen goes back to: the customer's account, or the day in Ventas it was opened from, which the
 * address says with "?fecha=", so it still works after a reload.
 */
export function useReturnTo(customerId: string): string {
  const [params] = useSearchParams()
  const day = params.get('fecha')

  return day && canHaveSales(day) ? listOfDay(day) : statementOf(customerId)
}
