import { useEffect, useRef, useState } from 'react'
import { useMessages } from '../components/messages'
import { hasStatus } from '../services/http'

export type Load<T> = { state: 'loading' } | { state: 'failed' } | { state: 'gone' } | { state: 'ready'; value: T }

const LOADING = { state: 'loading' } as const

/**
 * Loads what a screen shows, once per key, and drops an answer that comes late. A 404 shows the message and ends as
 * gone, for the screen to leave; anything else ends as failed, for the screen to offer retry.
 */
export function useLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>, goneMessage: string) {
  const { showError } = useMessages()
  const [result, setResult] = useState<{ key: string; attempt: number; load: Load<T> } | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Only the key decides when to load again, so callers can pass a new function on every render.
  const latest = useRef({ load, goneMessage, showError })
  useEffect(() => {
    latest.current = { load, goneMessage, showError }
  })

  useEffect(() => {
    const controller = new AbortController()

    latest.current
      .load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult({ key, attempt, load: { state: 'ready', value } })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        if (hasStatus(error, 404)) {
          latest.current.showError(latest.current.goneMessage)
          setResult({ key, attempt, load: { state: 'gone' } })
        } else {
          setResult({ key, attempt, load: { state: 'failed' } })
        }
      })

    return () => controller.abort()
  }, [key, attempt])

  return {
    load: result && result.key === key && result.attempt === attempt ? result.load : LOADING,
    retry: () => setAttempt((current) => current + 1),
  }
}
