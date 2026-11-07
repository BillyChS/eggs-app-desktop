import type { CustomerRef } from './customers'
import { request } from './http'

/** An abono: money a customer paid toward what they owe, not toward any one sale. */
export interface Payment {
  id: string
  customer: CustomerRef
  /** Local YYYY-MM-DD. */
  date: string
  amount: number
  note: string | null
  /** The credit sale it was paid with, as the sale was made. It's changed and deleted from that sale only. */
  saleId: string | null
}

export interface PaymentInput {
  date: string
  amount: number
  note: string
}

export interface PaymentList {
  payments: Payment[]
  /** Income from abonos, on the days they were paid. */
  total: number
}

const BASE = '/api/payments'

export function listPayments(from: string, to: string, signal?: AbortSignal): Promise<PaymentList> {
  return request<PaymentList>(`${BASE}?${new URLSearchParams({ from, to })}`, { signal })
}

export function getPayment(id: string, signal?: AbortSignal): Promise<Payment> {
  return request<Payment>(`${BASE}/${id}`, { signal })
}

export function createPayment(customerId: string, input: PaymentInput): Promise<Payment> {
  return request<Payment>(`/api/customers/${customerId}/payments`, { method: 'POST', body: input })
}

export function updatePayment(id: string, input: PaymentInput): Promise<Payment> {
  return request<Payment>(`${BASE}/${id}`, { method: 'PUT', body: input })
}

export function deletePayment(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
