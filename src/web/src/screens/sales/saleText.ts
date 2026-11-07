import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import type { CartonType, Sale, SaleItemInput } from '../../services/sales'

/** Must match SaleValidator.PaidInFullMessage, which the API sends for the same case. */
export const PAID_IN_FULL = 'Si pagó todo, es una venta al contado.'

/** The success message: the total, who, the day, and for a fiado with a payment, what's still owed for it. */
export function describeSaved(sale: Sale): string {
  const total = formatColones(sale.total)
  const when = formatDateLong(sale.date)

  if (!sale.isCredit) {
    return sale.customer
      ? `Venta guardada: ${total} a ${sale.customer.name}, ${when}.`
      : `Venta guardada: ${total}, ${when}.`
  }

  const saved = `Venta fiada guardada: ${total} a ${sale.customer!.name}, ${when}.`
  const left = formatColones(sale.total - sale.paidNow)

  return sale.paidNow > 0 ? `${saved} Pagó ${formatColones(sale.paidNow)} y queda debiendo ${left} de esta venta.` : saved
}

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

/** "3 de 15 · 1 de 30": quantities added up per carton type, so a row stays short however many lines the sale has. */
export function summarizeSale(items: Pick<SaleItemInput, 'cartonType' | 'quantity'>[]): string {
  return CARTONS.map(({ type, eggs }) => ({
    eggs,
    quantity: items.filter((item) => item.cartonType === type).reduce((sum, item) => sum + item.quantity, 0),
  }))
    .filter(({ quantity }) => quantity > 0)
    .map(({ eggs, quantity }) => `${quantity} de ${eggs}`)
    .join(' · ')
}
