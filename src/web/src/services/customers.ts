import { request } from './http'

/** A row of a list. Only the fields a row shows, so the list stays light as customers gain more data. */
export interface CustomerSummary {
  id: string
  name: string
  phone: string | null
}

export interface Customer extends CustomerSummary {
  notes: string | null
}

export interface CustomerInput {
  name: string
  phone: string
  notes: string
}

interface CustomerList {
  items: CustomerSummary[]
}

const BASE = '/api/customers'

export async function listCustomers(search: string, signal?: AbortSignal): Promise<CustomerSummary[]> {
  const query = search ? `?${new URLSearchParams({ search })}` : ''
  return (await request<CustomerList>(`${BASE}${query}`, { signal })).items
}

/** Active customers whose name is close to this one. excludeId is the customer being edited. */
export async function findSimilarCustomers(name: string, excludeId?: string): Promise<CustomerSummary[]> {
  const query = new URLSearchParams({ name, ...(excludeId && { excludeId }) })
  return (await request<CustomerList>(`${BASE}/similar?${query}`)).items
}

export function getCustomer(id: string, signal?: AbortSignal): Promise<Customer> {
  return request<Customer>(`${BASE}/${id}`, { signal })
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
