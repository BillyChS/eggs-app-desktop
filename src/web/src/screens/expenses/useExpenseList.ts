import { useEffect, useState } from 'react'
import { listExpenses, type ExpenseList } from '../../services/expenses'

/** Loads the expenses of a range of days, with their totals. An answer that comes late is dropped. */
export function useExpenseList(from: string, to: string) {
  const range = `${from}|${to}`
  const [result, setResult] = useState<(ExpenseList & { range: string }) | null>(null)
  const [failedRange, setFailedRange] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listExpenses(from, to, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) {
          setResult({ ...list, range: `${from}|${to}` })
          setFailedRange(null)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedRange(`${from}|${to}`)
        }
      })

    return () => controller.abort()
  }, [from, to, attempt])

  return {
    // Never another period's: a total under the wrong date would be worse than a moment of "Cargando…".
    list: result?.range === range ? result : null,
    failed: failedRange === range,
    /** Loads again, as after a delete. What's on screen stays until the new answer is in. */
    reload: () => {
      setFailedRange(null)
      setAttempt((current) => current + 1)
    },
  }
}
