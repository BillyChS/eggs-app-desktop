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
  items: SaleItem[]
}

export interface SaleInput {
  date: string
  items: SaleItemInput[]
}

export interface SaleList {
  sales: Sale[]
  cashTotal: number
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
