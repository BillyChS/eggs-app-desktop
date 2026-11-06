import { useEffect, useState } from 'react'
import { listPayments, type PaymentList } from '../../services/payments'
import { listSales, type SaleList } from '../../services/sales'

export interface DayList extends SaleList {
  /** The abonos paid that day, which are income of the day too. */
  payments: PaymentList
}

interface Result extends DayList {
  /** The day these are from, which can lag behind the day asked for. */
  day: string
}

/** Loads the sales and abonos of a day. An answer that comes late is dropped. */
export function useSaleList(day: string) {
  const [result, setResult] = useState<Result | null>(null)
  const [failedDay, setFailedDay] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([listSales(day, day, controller.signal), listPayments(day, day, controller.signal)])
      .then(([sales, payments]) => {
        if (!controller.signal.aborted) {
          setResult({ ...sales, payments, day })
          setFailedDay(null)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedDay(day)
        }
      })

    return () => controller.abort()
  }, [day, attempt])

  return {
    // Never another day's: a total under the wrong date would be worse than a moment of "Cargando…".
    list: result?.day === day ? result : null,
    failed: failedDay === day,
    retry: () => {
      setFailedDay(null)
      setAttempt((current) => current + 1)
    },
  }
}
