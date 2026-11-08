import type { CustomerRef } from './customers'
import { request } from './http'

/** A holds 15 eggs and B holds 30. */
export type CartonType = 'A' | 'B'

export interface SaleItemInput {
  cartonType: CartonType
  quantity: number
  unitPrice: number
}

export interface SaleItem extends SaleItemInput {
  lineTotal: number
}

export interface Sale {
  id: string
  /** Local YYYY-MM-DD. */
  date: string
  total: number
  /** Fiado: owed by the customer instead of paid. */
  isCredit: boolean
  /** Who owes a credit sale, or who bought a cash sale, even if deleted since. Null for a cash sale with nobody. */
  customer: CustomerRef | null
  items: SaleItem[]
  /** Paid when a credit sale was made: an abono tied to the sale. 0 if none. */
  paidNow: number
  /**
   * What a credit sale still owes, once the customer's abonos are shared out: its own abono first, then the others to
   * the oldest sales first. Worked out by the API on every read. 0 for a cash sale.
   */
  owed: number
}

/** Someone new, saved together with the sale. */
export interface NewCustomerInput {
  name: string
  phone: string
}

export interface SaleInput {
  date: string
  items: SaleItemInput[]
  isCredit: boolean
  /** Required for a credit sale, unless newCustomer is given; optional for a cash sale, where it's who bought. */
  customerId: string | null
  /** Only for a credit sale: what was paid as it was made, less than the total. 0 for none. */
  paidNow: number
  /** In place of customerId: someone to add, in the same transaction as the sale. */
  newCustomer?: NewCustomerInput
}

export interface SaleList {
  sales: Sale[]
  /** Income: cash sales only. */
  cashTotal: number
  /** Sold on credit: owed, not income. */
  creditTotal: number
}

/** The price to start with per carton type. A type that has never been sold isn't there. */
export type LastPrices = Partial<Record<CartonType, number>>

const BASE = '/api/sales'

export function listSales(from: string, to: string, signal?: AbortSignal): Promise<SaleList> {
  return request<SaleList>(`${BASE}?${new URLSearchParams({ from, to })}`, { signal })
}

export function findLastPrices(signal?: AbortSignal): Promise<LastPrices> {
  return request<LastPrices>(`${BASE}/last-prices`, { signal })
}

export function getSale(id: string, signal?: AbortSignal): Promise<Sale> {
  return request<Sale>(`${BASE}/${id}`, { signal })
}

export function createSale(input: SaleInput): Promise<Sale> {
  return request<Sale>(BASE, { method: 'POST', body: input })
}

export function updateSale(id: string, input: SaleInput): Promise<Sale> {
  return request<Sale>(`${BASE}/${id}`, { method: 'PUT', body: input })
}

export function deleteSale(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
