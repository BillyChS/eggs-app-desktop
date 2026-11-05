import { useEffect, useState } from 'react'
import { listSales, type SaleList } from '../../services/sales'

interface Result extends SaleList {
  /** The day these sales are from, which can lag behind the day asked for. */
  day: string
}

/** Loads the sales of a day. An answer that comes late is dropped. */
export function useSaleList(day: string) {
  const [result, setResult] = useState<Result | null>(null)
  const [failedDay, setFailedDay] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listSales(day, day, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setResult({ ...list, day })
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
