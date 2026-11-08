import { useSearchParams } from 'react-router'
import { statementOf } from '../customers/customerText'
import { readView, viewAddress } from '../sales/salesView'

/**
 * Where an abono's screen goes back to: the customer's account, or the view of Ventas it was opened from, which the
 * address carries ("?fecha=" or "?mes=", and the tab), so it still works after a reload.
 */
export function useReturnTo(customerId: string): string {
  const [params] = useSearchParams()

  return params.has('fecha') || params.has('mes') ? viewAddress(readView(params)) : statementOf(customerId)
}
