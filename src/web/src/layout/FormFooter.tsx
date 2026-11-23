import type { RefObject } from 'react'
import { Button } from '../components/Button'
import { formatColones } from '../lib/money'
import styles from './FormFooter.module.css'

interface Props {
  /** "Total de la venta", "Total del gasto". */
  totalLabel: string
  total: number
  /** "Guardar venta", "Guardar gasto". */
  saveLabel: string
  saveRef: RefObject<HTMLButtonElement | null>
  onSave: () => void
  onCancel: () => void
  /** "Borrar venta", "Borrar gasto": only when editing. It must ask before deleting. */
  deleteLabel?: string
  onDelete?: () => void
}

/**
 * The bar of the sale and expense forms, for Screen's `footer`, so it stays in sight while the form scrolls: the total
 * next to Cancelar and the save button on the right, and the delete button, when there is one, alone on the left,
 * away from them.
 */
export function FormFooter({ totalLabel, total, saveLabel, saveRef, onSave, onCancel, deleteLabel, onDelete }: Props) {
  return (
    <>
      {deleteLabel && onDelete && (
        <Button variant="dangerOutline" onClick={onDelete}>
          {deleteLabel}
        </Button>
      )}
      <div className={styles.end}>
        <p className={styles.total}>
          <span>{totalLabel}</span>
          <strong>{formatColones(total)}</strong>
        </p>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button ref={saveRef} onClick={onSave}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </>
  )
}
