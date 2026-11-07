import { request } from './http'

/** Times are local "YYYY-MM-DDTHH:mm:ss". */
export interface BackupStatus {
  /** False in the standalone API, which never makes backups. */
  enabled: boolean
  lastGoodAt: string | null
  warning: boolean
  /** Null when no second location is set up. */
  secondCopy: { isOneDrive: boolean; lastAt: string | null; warning: boolean } | null
}

export function getBackupStatus(): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backups/status')
}

/** Makes a backup now. Answers with the new status whether or not it worked. */
export function runBackup(): Promise<BackupStatus> {
  return request<BackupStatus>('/api/backups', { method: 'POST' })
}
