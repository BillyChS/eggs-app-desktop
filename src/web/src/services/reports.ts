import { request } from './http'

export interface DaySummary {
  /** Local YYYY-MM-DD. */
  date: string
  cameIn: number
  spent: number
  net: number
}

export interface Summary {
  from: string
  to: string
  /** Cash-basis: cash sales and abonos, each on its own date. */
  cameIn: { cash: number; payments: number; total: number }
  spent: { total: number; byCategory: { name: string; total: number }[] }
  /** What came in minus what was spent. Below zero when more was spent. */
  net: number
  /** Sold on credit in the period: owed, not income. */
  creditSold: number
  /** What all customers owe today, whatever the period. */
  owedTotal: number
  /** Cartons sold, cash and credit both. "A" holds 15 eggs and "B" holds 30. */
  cartons: { cartonType: 'A' | 'B'; quantity: number }[]
  /** Days with anything in them, oldest first. */
  days: DaySummary[]
}

export function getSummary(from: string, to: string, signal?: AbortSignal): Promise<Summary> {
  return request<Summary>(`/api/reports/summary?${new URLSearchParams({ from, to })}`, { signal })
}
