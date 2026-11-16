import { useRef, type ReactNode } from 'react'
import { formatColones } from '../lib/money'
import { Button } from './Button'
import styles from './ConfirmationWindow.module.css'
import { Modal } from './Modal'

export interface ConfirmationRow {
  label: string
  value: ReactNode
}

interface Props {
  /** What's about to be saved, one thing per line: a label on the left, what it is on the right. */
  rows: ConfirmationRow[]
  /** What the large amount at the bottom is, like "Total" or "Monto". */
  amountLabel: string
  amount: number
  /** Why the last Listo didn't save, and what to do about it. */
  error: string | null
  /** Back to the form, with everything still there. */
  onEdit: () => void
  /** Saves. */
  onConfirm: () => void
}

/**
 * The "Ventana de confirmación" of the sale and expense forms: what's about to be saved, before anything is saved.
 * Focus starts on Editar, so a stray Enter only goes back to the form; only Listo saves. A failure stays in it.
 */
export function ConfirmationWindow({ rows, amountLabel, amount, error, onEdit, onConfirm }: Props) {
  const editRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal
      title="Ventana de confirmación"
      onEscape={onEdit}
      initialFocus={editRef}
      body={
        <>
          <dl className={styles.summary}>
            {rows.map((row) => (
              <div key={row.label} className={styles.row}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.amount}>
            <span>{amountLabel}</span>
            <strong>{formatColones(amount)}</strong>
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </>
      }
    >
      <Button ref={editRef} variant="secondary" onClick={onEdit}>
        Editar
      </Button>
      <Button onClick={onConfirm}>Listo</Button>
    </Modal>
  )
}
