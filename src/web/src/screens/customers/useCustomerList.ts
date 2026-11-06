import { useEffect, useRef, useState } from 'react'
import { listCustomers, type CustomerSummary } from '../../services/customers'

const SEARCH_DELAY_MS = 300

interface Result {
  customers: CustomerSummary[]
  /** What everyone owes together, whatever the search. */
  owedTotal: number
  /** The search these customers answer, which can lag behind what's typed. */
  search: string
}

/** Loads the list right away, then again shortly after typing stops. An answer that comes late is dropped. */
export function useCustomerList(search: string) {
  const [result, setResult] = useState<Result | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const delay = useRef(0)

  useEffect(() => {
    const controller = new AbortController()

    const timer = setTimeout(async () => {
      try {
        const { items, owedTotal } = await listCustomers(search, controller.signal)

        if (controller.signal.aborted) {
          return
        }

        setResult({ customers: items, owedTotal, search })
        setFailed(false)
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true)
        }
      }
    }, delay.current)

    delay.current = SEARCH_DELAY_MS

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, attempt])

  return {
    result,
    failed,
    retry: () => {
      setFailed(false)
      setAttempt((current) => current + 1)
    },
  }
}
