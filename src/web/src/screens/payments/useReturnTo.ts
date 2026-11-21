import { useSearchParams } from 'react-router'
import { statementOf } from '../customers/customerText'
import { hasListPeriod } from '../periodView'
import { readView, viewAddress } from '../sales/salesView'

/**
 * Where an abono's screen goes back to: the customer's account, or the view of Ventas it was opened from, which the
 * address carries ("?fecha=", "?semana=" or "?mes=", and the tab), so it still works after a reload.
 */
export function useReturnTo(customerId: string): string {
  const [params] = useSearchParams()

  return hasListPeriod(params) ? viewAddress(readView(params)) : statementOf(customerId)
}
