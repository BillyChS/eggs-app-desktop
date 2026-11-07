import { useCallback, useEffect, useState } from 'react'
import { getBackupStatus, runBackup, type BackupStatus } from '../services/backups'
import { CHECK_INTERVAL_MS } from './useServerStatus'

/** The backup status, checked as often as the connection. Null until known, or while the API can't be reached. */
export function useBackupStatus() {
  const [status, setStatus] = useState<BackupStatus | null>(null)

  useEffect(() => {
    let active = true

    const check = () => {
      getBackupStatus().then(
        (next) => active && setStatus(next),
        () => active && setStatus(null),
      )
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // A failed request changes nothing: the warning stays, which is what it should say.
  const retry = useCallback(async () => {
    try {
      setStatus(await runBackup())
    } catch {
      // The next check reports whatever happened.
    }
  }, [])

  return { status, retry }
}
