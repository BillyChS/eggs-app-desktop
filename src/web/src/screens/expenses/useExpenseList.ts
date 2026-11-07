import { useEffect, useState } from 'react'
import { listExpenses, type ExpenseList } from '../../services/expenses'

/** Loads the expenses of a day. An answer that comes late is dropped. */
export function useExpenseList(day: string) {
  const [result, setResult] = useState<(ExpenseList & { day: string }) | null>(null)
  const [failedDay, setFailedDay] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listExpenses(day, day, controller.signal)
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
