import type { CustomerRef } from './customers'
import { request } from './http'
import type { Sale } from './sales'

/** An abono: money a customer paid toward what they owe. One that points at a sale pays that sale first. */
export interface Payment {
  id: string
  customer: CustomerRef
  /** Local YYYY-MM-DD. */
  date: string
  amount: number
  note: string | null
  /** The credit sale it was paid with, as the sale was made. It's changed and deleted from that sale only. */
  saleId: string | null
  /** The credit sale it was paid toward from its Abonar button. */
  forSaleId?: string | null
  /** That sale's date (local YYYY-MM-DD), while the sale is still there. Only in lists. */
  forSaleDate?: string | null
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

/** One abono, or the part of one, that went to a credit sale. */
export interface SalePaymentShare {
  id: string
  /** Local YYYY-MM-DD: the day the abono was paid. */
  date: string
  /** What of it went to this sale. */
  applied: number
  /** The whole abono: more than applied when the rest went to the customer's other fiados. */
  amount: number
  /** Paid as the sale was made ("¿Pagó algo ahora?"). */
  paidWithSale: boolean
}

/** A credit sale and the abonos that paid it, newest first. Their applied amounts add up to paid. */
export interface SalePayments {
  sale: Sale
  paid: number
  payments: SalePaymentShare[]
}

export function getSalePayments(saleId: string, signal?: AbortSignal): Promise<SalePayments> {
  return request<SalePayments>(`/api/sales/${saleId}/payments`, { signal })
}

/** An abono from the sale's Abonar button: paid today, toward that sale first. */
export function createSalePayment(saleId: string, amount: number): Promise<Payment> {
  return request<Payment>(`/api/sales/${saleId}/payments`, { method: 'POST', body: { amount } })
}
