import { formatColones } from '../../lib/money'
import type { CustomerSummary } from '../../services/customers'

/** "María Rodríguez (8888-8888). ¿Es otra persona?", to ask before saving a name like one that exists. */
export function describeSimilar(customers: CustomerSummary[]): string {
  const names = customers.map(({ name, phone }) => (phone ? `${name} (${phone})` : name)).join(', ')
  return `${names}. ¿Es otra persona?`
}

/** "Debe ₡8.000", or "Al día" when they owe nothing. */
export function describeBalance(balance: number): string {
  return balance > 0 ? `Debe ${formatColones(balance)}` : 'Al día'
}

/** "Ahora debe ₡5.000." or "Ahora está al día.", to end a success message. */
export function describeBalanceNow(balance: number): string {
  return balance > 0 ? `Ahora debe ${formatColones(balance)}.` : 'Ahora está al día.'
}

/** Where a customer's account statement is. */
export const statementOf = (customerId: string) => `/clientes/${customerId}`
