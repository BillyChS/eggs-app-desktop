import { formatColones } from '../../lib/money'
import type { CartonType, Sale, SaleItemInput } from '../../services/sales'

/** Must match SaleValidator.PaidInFullMessage, which the API sends for the same case. */
export const PAID_IN_FULL = 'Si pagó todo, es una venta al contado.'

export const CARTONS: { type: CartonType; eggs: number; label: string }[] = [
  { type: 'A', eggs: 15, label: 'Cartón de 15 huevos' },
  { type: 'B', eggs: 30, label: 'Cartón de 30 huevos' },
]

const eggsIn = (type: CartonType) => CARTONS.find((carton) => carton.type === type)!.eggs

/** "3 de 15 huevos × ₡1.000 = ₡3.000" */
export function describeLine({ cartonType, quantity, unitPrice }: SaleItemInput): string {
  const total = formatColones(quantity * unitPrice)
  return `${quantity} de ${eggsIn(cartonType)} huevos × ${formatColones(unitPrice)} = ${total}`
}

/** Quantities added up per carton type, so a row stays short however many lines the sale has. */
function countCartons(items: Pick<SaleItemInput, 'cartonType' | 'quantity'>[]) {
  return CARTONS.map(({ type, eggs }) => ({
    eggs,
    quantity: items.filter((item) => item.cartonType === type).reduce((sum, item) => sum + item.quantity, 0),
  })).filter(({ quantity }) => quantity > 0)
}

/** "3 de 15 · 1 de 30" */
export function summarizeSale(items: Pick<SaleItemInput, 'cartonType' | 'quantity'>[]): string {
  return countCartons(items)
    .map(({ eggs, quantity }) => `${quantity} de ${eggs}`)
    .join(' · ')
}

/** "3 cartones de 15 · 1 cartón de 30", under the name in Ventas. */
export function describeCartons(items: Pick<SaleItemInput, 'cartonType' | 'quantity'>[]): string {
  return countCartons(items)
    .map(({ eggs, quantity }) => `${quantity} ${quantity === 1 ? 'cartón' : 'cartones'} de ${eggs}`)
    .join(' · ')
}

/** A cash sale with nobody named. It's a choice in the form too, so it's said the same way in both. */
export const NO_NAME = 'Cliente sin nombre'

export type SaleStatus = { text: string; tone: 'paid' | 'abonos' | 'owed' }

/** "Pagado", "Pagado con abonos" or "Debe ₡X", from what the API worked out the sale still owes. */
export function statusOf(sale: Pick<Sale, 'isCredit' | 'owed'>): SaleStatus {
  if (!sale.isCredit) {
    return { text: 'Pagado', tone: 'paid' }
  }

  return sale.owed > 0
    ? { text: `Debe ${formatColones(sale.owed)}`, tone: 'owed' }
    : { text: 'Pagado con abonos', tone: 'abonos' }
}

/**
 * The question before deleting a sale: what it was, and for a fiado what happens to the abono paid with it and to the
 * balance. Without owedNow (not loaded, or it failed), it just leaves the balance out.
 */
export function deleteQuestion(sale: Sale, owedNow: number | null): string {
  const total = formatColones(sale.total)

  if (!sale.isCredit || !sale.customer) {
    const to = sale.customer ? ` a ${sale.customer.name}` : ''
    return `¿Borrar la venta de ${total}${to} (${summarizeSale(sale.items)})? Ya no contará en el total del día.`
  }

  const question = `¿Borrar la venta fiada de ${total} a ${sale.customer.name}?`
  const withAbono =
    sale.paidNow > 0
      ? `${question} También se borra el abono de ${formatColones(sale.paidNow)} que dio al hacerla.`
      : question

  if (owedNow === null) {
    return withAbono
  }

  // Without this sale and its abono, they owe what's left of it less.
  const after = owedNow - (sale.total - sale.paidNow)
  return `${withAbono} Su saldo bajará de ${formatColones(owedNow)} a ${formatColones(after)}.`
}

/** "1 cartón de 15 a ₡1.500", "3 cartones de 30 a ₡2.800": one line of the Ventana de confirmación. */
export function describeItem({ cartonType, quantity, unitPrice }: SaleItemInput): string {
  return `${quantity} ${quantity === 1 ? 'cartón' : 'cartones'} de ${eggsIn(cartonType)} a ${formatColones(unitPrice)}`
}

/**
 * How it was paid, in the Ventana de confirmación. A fiado with something paid now is "Mixto" there only: in the form
 * it's still "Fiado" with "¿Pagó algo ahora?".
 */
export function describePaidWith(isCredit: boolean, paidNow: number, total: number): string {
  if (!isCredit) {
    return 'Al contado'
  }

  return paidNow > 0
    ? `Mixto: pagó ${formatColones(paidNow)} ahora y quedan ${formatColones(total - paidNow)} fiados`
    : 'Fiado'
}

/** "₡500", or "₡500 (de un abono de ₡2.000)" when only part of that abono went to this sale. */
/** "(de un abono de ₡2.000)", under the part of it that paid this sale; nothing when all of it did. */
export function describeShareOf({ applied, amount }: { applied: number; amount: number }): string | null {
  return applied < amount ? `(de un abono de ${formatColones(amount)})` : null
}

/** Must match CreateSalePayment.TooMuchMessage, which the API sends for the same case. */
export const tooMuch = (owed: number) => `El abono no puede ser mayor a lo que debe (${formatColones(owed)}).`
