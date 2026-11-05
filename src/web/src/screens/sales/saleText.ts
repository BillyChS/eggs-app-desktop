import { formatColones } from '../../lib/money'
import type { CartonType, SaleItemInput } from '../../services/sales'

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
