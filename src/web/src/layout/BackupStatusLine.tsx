import { Button } from '../components/Button'
import { formatMoment } from '../lib/dates'
import type { BackupStatus } from '../services/backups'
import styles from './Sidebar.module.css'
import { useOneAtATime } from './useOneAtATime'

interface Props {
  status: BackupStatus
  onRetry: () => Promise<void>
}

/**
 * The sidebar's backup line: calm when all is well, a plain warning with one way to retry when it isn't.
 * The backups themselves are automatic, so there is nothing to press in the normal state.
 */
export function BackupStatusLine({ status, onRetry }: Props) {
  const { run } = useOneAtATime()
  const lastGood = status.lastGoodAt ? formatMoment(status.lastGoodAt) : null
  const warning = warningText(status, lastGood)

  if (warning) {
    return (
      <div className={styles.backupWarning}>
        <p role="alert">{warning}</p>
        <Button variant="secondary" onClick={() => run(onRetry)}>
          Intentar de nuevo
        </Button>
      </div>
    )
  }

  return lastGood ? <p>Último respaldo: {lastGood}</p> : null
}

function warningText(status: BackupStatus, lastGood: string | null): string | null {
  if (status.warning) {
    // "8:15 a. m." already ends in a period, which then ends the sentence too.
    const last = lastGood ? ` El último es de ${lastGood}${lastGood.endsWith('.') ? '' : '.'}` : ''
    return `No se pudo guardar el respaldo.${last} Por favor llame a Billy.`
  }

  if (status.secondCopy?.warning) {
    const where = status.secondCopy.isOneDrive ? 'La copia en OneDrive' : 'La segunda copia del respaldo'
    return `${where} no se está haciendo. Por favor llame a Billy.`
  }

  return null
}
