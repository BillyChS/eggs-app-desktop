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
  /** Who owes a credit sale, even if they were deleted since. Null for a cash sale. */
  customer: CustomerRef | null
  items: SaleItem[]
}

export interface SaleInput {
  date: string
  items: SaleItemInput[]
  isCredit: boolean
  /** Only for a credit sale. */
  customerId: string | null
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
