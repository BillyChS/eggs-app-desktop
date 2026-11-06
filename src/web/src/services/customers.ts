import { request } from './http'
import type { SaleItem } from './sales'

/** A row of a list. Only the fields a row shows, so the list stays light as customers gain more data. */
export interface CustomerSummary {
  id: string
  name: string
  phone: string | null
  /** What they owe now; 0 when they're up to date. */
  balance: number
}

export interface Customer extends CustomerSummary {
  notes: string | null
}

/** Who a sale or an abono belongs to. A deleted customer still has a name. */
export interface CustomerRef {
  id: string
  name: string
  isDeleted: boolean
}

export interface CustomerInput {
  name: string
  phone: string
  notes: string
}

export interface CustomerList {
  items: CustomerSummary[]
  /** What everyone owes together, whatever the search. */
  owedTotal: number
}

export interface StatementEntry {
  kind: 'sale' | 'payment'
  id: string
  /** Local YYYY-MM-DD. */
  date: string
  /** Always positive: the kind says which way it moves the balance. */
  amount: number
  /** What the customer owed right after this entry. */
  balance: number
  note: string | null
  items: SaleItem[] | null
}

export interface CustomerStatement {
  id: string
  name: string
  phone: string | null
  balance: number
  /** Newest first. */
  entries: StatementEntry[]
}

const BASE = '/api/customers'

export function listCustomers(search: string, signal?: AbortSignal): Promise<CustomerList> {
  const query = search ? `?${new URLSearchParams({ search })}` : ''
  return request<CustomerList>(`${BASE}${query}`, { signal })
}

/** Active customers whose name is close to this one. excludeId is the customer being edited. */
export async function findSimilarCustomers(name: string, excludeId?: string): Promise<CustomerSummary[]> {
  const query = new URLSearchParams({ name, ...(excludeId && { excludeId }) })
  return (await request<CustomerList>(`${BASE}/similar?${query}`)).items
}

export function getCustomer(id: string, signal?: AbortSignal): Promise<Customer> {
  return request<Customer>(`${BASE}/${id}`, { signal })
}

export function getStatement(id: string, signal?: AbortSignal): Promise<CustomerStatement> {
  return request<CustomerStatement>(`${BASE}/${id}/statement`, { signal })
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  return request<Customer>(BASE, { method: 'POST', body: input })
}

export function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  return request<Customer>(`${BASE}/${id}`, { method: 'PUT', body: input })
}

export function deleteCustomer(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
