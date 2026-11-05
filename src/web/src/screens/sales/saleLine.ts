import type { CartonType, LastPrices, SaleItemInput } from '../../services/sales'

// Must match the limits in Sale.cs. The API checks them too.
export const MAX_LINES = 20
const MAX_QUANTITY = 10_000
const MAX_UNIT_PRICE = 1_000_000

/** The line being filled in. */
export interface OpenLine {
  cartonType: CartonType | null
  /** As typed, so "2,5" can be refused instead of quietly becoming 25. */
  quantity: string
  /** Only counts once it's been typed: until then the field shows the last price of the carton type. */
  price: number | null
  priceTyped: boolean
}

export const BLANK_LINE: OpenLine = { cartonType: null, quantity: '1', price: null, priceTyped: false }

export function shownPrice(line: OpenLine, lastPrices: LastPrices): number | null {
  if (line.priceTyped) {
    return line.price
  }

  return line.cartonType ? (lastPrices[line.cartonType] ?? null) : null
}

/** Only the quantity it starts with, so it's fine to save a sale with earlier lines and leave this one out. */
export function isUntouched(line: OpenLine): boolean {
  return line.cartonType === null && line.quantity.trim() === BLANK_LINE.quantity && !line.priceTyped
}

export function parseQuantity(text: string): number | null {
  const trimmed = text.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

export function quantityProblem(text: string): string | undefined {
  const trimmed = text.trim()

  if (trimmed && !/^\d+$/.test(trimmed)) {
    return 'Escriba un número entero, sin comas ni puntos.'
  }

  return undefined
}

export function subtotal(line: OpenLine, lastPrices: LastPrices): number {
  return (parseQuantity(line.quantity) ?? 0) * (shownPrice(line, lastPrices) ?? 0)
}

export type LineProblems = Partial<Record<'cartonType' | 'quantity' | 'unitPrice', string>>

export function findProblems(line: OpenLine, lastPrices: LastPrices): LineProblems {
  const problems: LineProblems = {}
  const quantity = parseQuantity(line.quantity)
  const price = shownPrice(line, lastPrices)

  if (!line.cartonType) {
    problems.cartonType = 'Escoja el tipo de cartón.'
  }

  if (quantity === null || quantity < 1) {
    problems.quantity = quantityProblem(line.quantity) ?? 'Escriba la cantidad de cartones.'
  } else if (quantity > MAX_QUANTITY) {
    problems.quantity = 'La cantidad no puede ser mayor que 10.000.'
  }

  if (price === null || price < 1) {
    problems.unitPrice = 'Escriba el precio por cartón.'
  } else if (price > MAX_UNIT_PRICE) {
    problems.unitPrice = 'El precio no puede ser mayor que ₡1.000.000.'
  }

  return problems
}

/** Only for a line that has no problems. */
export function toItem(line: OpenLine, lastPrices: LastPrices): SaleItemInput {
  return {
    cartonType: line.cartonType!,
    quantity: parseQuantity(line.quantity)!,
    unitPrice: shownPrice(line, lastPrices)!,
  }
}
