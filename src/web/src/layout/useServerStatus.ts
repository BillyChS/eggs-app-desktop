import { useEffect, useState } from 'react'
import { getHealth } from '../services/health'

export type ServerStatus = 'checking' | 'connected' | 'disconnected'

export const CHECK_INTERVAL_MS = 30_000

export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    let active = true

    const check = () => {
      getHealth().then(
        () => active && setStatus('connected'),
        () => active && setStatus('disconnected'),
      )
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return status
}
