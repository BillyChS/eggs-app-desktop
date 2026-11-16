import { useRef } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import type { SaleItemInput } from '../../services/sales'
import styles from './SaleConfirmDialog.module.css'
import { describeItem, describePaidWith } from './saleText'

export interface SaleSummary {
  /** Who it's for, as said in the form: a name, someone new, or Cliente sin nombre. */
  customer: string
  /** Local YYYY-MM-DD. */
  date: string
  isCredit: boolean
  paidNow: number
  items: SaleItemInput[]
}

interface Props {
  summary: SaleSummary
  /** Why the last Listo didn't save, and what to do about it. */
  error: string | null
  /** Back to the form, with everything still there. */
  onEdit: () => void
  /** Saves the sale. */
  onConfirm: () => void
}

/**
 * What's about to be saved, one thing per line, before anything is saved. Focus starts on Editar, so a stray Enter
 * only goes back to the form.
 */
export function SaleConfirmDialog({ summary, error, onEdit, onConfirm }: Props) {
  const editRef = useRef<HTMLButtonElement>(null)
  const total = summary.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  return (
    <Modal
      title="Ventana de confirmación"
      onEscape={onEdit}
      initialFocus={editRef}
      body={
        <>
          <dl className={styles.summary}>
            <dt>Cliente</dt>
            <dd>{summary.customer}</dd>
            <dt>Fecha</dt>
            <dd>{formatDateLong(summary.date) ?? summary.date}</dd>
            <dt>Cómo pagó</dt>
            <dd>{describePaidWith(summary.isCredit, summary.paidNow, total)}</dd>
            <dt>Cartones</dt>
            <dd>
              <ul className={styles.items}>
                {summary.items.map((item, index) => (
                  <li key={index}>
                    <span>{describeItem(item)}</span>
                    <span className={styles.subtotal}>{formatColones(item.quantity * item.unitPrice)}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
          <p className={styles.total}>
            <span>Total</span>
            <strong>{formatColones(total)}</strong>
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
