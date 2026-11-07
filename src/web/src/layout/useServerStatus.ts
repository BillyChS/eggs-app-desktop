import { useEffect, useState } from 'react'
import { getHealth } from '../services/health'

export type ServerStatus = 'checking' | 'connected' | 'disconnected'

export const CHECK_INTERVAL_MS = 30_000

export interface ServerState {
  status: ServerStatus
  /** Null until the first answer. Kept while disconnected: the page and the app came from the same install. */
  version: string | null
}

export function useServerStatus(): ServerState {
  const [state, setState] = useState<ServerState>({ status: 'checking', version: null })

  useEffect(() => {
    let active = true

    const check = () => {
      getHealth().then(
        (health) => active && setState({ status: 'connected', version: health.version ?? null }),
        () => active && setState((previous) => ({ ...previous, status: 'disconnected' })),
      )
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return state
}
