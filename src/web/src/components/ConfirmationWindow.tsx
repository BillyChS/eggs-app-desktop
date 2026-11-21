import { useRef, type ReactNode } from 'react'
import { formatColones } from '../lib/money'
import { Button } from './Button'
import styles from './ConfirmationWindow.module.css'
import { Modal } from './Modal'

export interface ConfirmationRow {
  label: string
  value: ReactNode
}

interface SummaryProps {
  /** What's about to be saved, one thing per line: a label on the left, what it is on the right. */
  rows: ConfirmationRow[]
  /** What the large amount at the bottom is, like "Total" or "Monto". */
  amountLabel: string
  amount: number
  /** Why the last Listo didn't save, and what to do about it. */
  error: string | null
}

interface Props extends SummaryProps {
  /** Back to the form, with everything still there. */
  onEdit: () => void
  /** Saves. */
  onConfirm: () => void
}

/**
 * What the Ventana de confirmación shows: one line per thing, the amount large and bold, and why Listo failed. The
 * expense popup shows it in place of its fields, so there's never a second dialog on top of it.
 */
export function ConfirmationSummary({ rows, amountLabel, amount, error }: SummaryProps) {
  return (
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
  )
}

/**
 * The "Ventana de confirmación" of the sale form: what's about to be saved, before anything is saved.
 * Focus starts on Editar, so a stray Enter only goes back to the form; only Listo saves. A failure stays in it.
 */
export function ConfirmationWindow({ rows, amountLabel, amount, error, onEdit, onConfirm }: Props) {
  const editRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal
      title="Ventana de confirmación"
      onEscape={onEdit}
      initialFocus={editRef}
      body={<ConfirmationSummary rows={rows} amountLabel={amountLabel} amount={amount} error={error} />}
    >
      <Button ref={editRef} variant="secondary" onClick={onEdit}>
        Editar
      </Button>
      <Button onClick={onConfirm}>Listo</Button>
    </Modal>
  )
}
