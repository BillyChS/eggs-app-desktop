import { useEffect, useState } from 'react'
import { listPayments, type PaymentList } from '../../services/payments'
import { getSummary, type Summary } from '../../services/reports'
import { listSales, type SaleList } from '../../services/sales'

export interface SalesPage {
  sales: SaleList
  payments: PaymentList
  /** The cards' numbers, from the same handler as Resúmenes, so the two can never disagree. */
  summary: Summary
}

interface Result {
  /** The range these are from, which can lag behind the range asked for. */
  range: string
  page: SalesPage
}

/** Loads what Ventas shows for a range of days. An answer that comes late is dropped. */
export function useSalesPage(from: string, to: string) {
  const range = `${from}|${to}`
  const [result, setResult] = useState<Result | null>(null)
  const [failedRange, setFailedRange] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    Promise.all([listSales(from, to, signal), listPayments(from, to, signal), getSummary(from, to, signal)])
      .then(([sales, payments, summary]) => {
        if (!signal.aborted) {
          setResult({ range: `${from}|${to}`, page: { sales, payments, summary } })
          setFailedRange(null)
        }
      })
      .catch(() => {
        if (!signal.aborted) {
          setFailedRange(`${from}|${to}`)
        }
      })

    return () => controller.abort()
  }, [from, to, attempt])

  return {
    // Never another period's: a total under the wrong date would be worse than a moment of "Cargando…".
    page: result?.range === range ? result.page : null,
    failed: failedRange === range,
    /** Loads again, as after a delete. What's on screen stays until the new answer is in. */
    reload: () => {
      setFailedRange(null)
      setAttempt((current) => current + 1)
    },
  }
}
