import { ConfirmationWindow } from '../../components/ConfirmationWindow'
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

/** The sale's Ventana de confirmación: who, when, how it was paid, each carton line, and the total. */
export function SaleConfirmDialog({ summary, error, onEdit, onConfirm }: Props) {
  const total = summary.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  return (
    <ConfirmationWindow
      rows={[
        { label: 'Cliente', value: summary.customer },
        { label: 'Fecha', value: formatDateLong(summary.date) ?? summary.date },
        { label: 'Cómo pagó', value: describePaidWith(summary.isCredit, summary.paidNow, total) },
        {
          label: 'Cartones',
          value: (
            <ul className={styles.items}>
              {summary.items.map((item, index) => (
                <li key={index}>
                  <span>{describeItem(item)}</span>
                  <span className={styles.subtotal}>{formatColones(item.quantity * item.unitPrice)}</span>
                </li>
              ))}
            </ul>
          ),
        },
      ]}
      amountLabel="Total"
      amount={total}
      error={error}
      onEdit={onEdit}
      onConfirm={onConfirm}
    />
  )
}
