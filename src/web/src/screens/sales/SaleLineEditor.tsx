import { Check, CircleAlert } from 'lucide-react'
import { useId, type KeyboardEventHandler, type RefObject } from 'react'
import { Button } from '../../components/Button'
import { MoneyInput } from '../../components/MoneyInput'
import { TextInput } from '../../components/TextInput'
import { formatColones } from '../../lib/money'
import { selectOnFocus } from '../../lib/selectOnFocus'
import type { CartonType } from '../../services/sales'
import { quantityProblem, type LineProblems, type OpenLine } from './saleLine'
import styles from './SaleForm.module.css'
import { CARTONS } from './saleText'

interface Props {
  line: OpenLine
  price: number | null
  subtotal: number
  errors: LineProblems
  onChooseType: (type: CartonType) => void
  onQuantityChange: (text: string) => void
  onPriceChange: (price: number | null) => void
  /** Only when the sale has other lines to keep. */
  onRemove?: () => void
  onQuantityEnter: KeyboardEventHandler<HTMLInputElement>
  onPriceEnter: KeyboardEventHandler<HTMLInputElement>
  firstTypeRef: RefObject<HTMLButtonElement | null>
  quantityRef: RefObject<HTMLInputElement | null>
  priceRef: RefObject<HTMLInputElement | null>
}

/** The line being filled in: carton type, quantity, price and what it comes to. */
export function SaleLineEditor({
  line,
  price,
  subtotal,
  errors,
  onChooseType,
  onQuantityChange,
  onPriceChange,
  onRemove,
  onQuantityEnter,
  onPriceEnter,
  firstTypeRef,
  quantityRef,
  priceRef,
}: Props) {
  const labelId = useId()

  return (
    <div className={styles.editor}>
      <div className={styles.typeField}>
        <span id={labelId} className={styles.fieldLabel}>
          Tipo de cartón
        </span>
        <div role="group" aria-labelledby={labelId} className={styles.types}>
          {CARTONS.map(({ type, label }, index) => {
            const chosen = line.cartonType === type

            return (
              <button
                key={type}
                ref={index === 0 ? firstTypeRef : undefined}
                type="button"
                className={chosen ? `${styles.type} ${styles.chosen}` : styles.type}
                aria-pressed={chosen}
                onClick={() => onChooseType(type)}
              >
                {chosen && <Check size={26} aria-hidden="true" />}
                {label}
              </button>
            )
          })}
        </div>
        {errors.cartonType && (
          <p className={styles.error} role="alert">
            <CircleAlert size={26} aria-hidden="true" />
            {errors.cartonType}
          </p>
        )}
      </div>

      <div className={styles.quantity}>
        <TextInput
          ref={quantityRef}
          label="Cantidad"
          value={line.quantity}
          onChange={onQuantityChange}
          error={errors.quantity ?? quantityProblem(line.quantity)}
          maxLength={7}
          inputProps={{ ...selectOnFocus, inputMode: 'numeric', onKeyDown: onQuantityEnter }}
        />
      </div>

      <div className={styles.price}>
        <MoneyInput
          ref={priceRef}
          label="Precio por cartón"
          value={price}
          onChange={onPriceChange}
          error={errors.unitPrice}
          inputProps={{ ...selectOnFocus, onKeyDown: onPriceEnter }}
        />
      </div>

      <p className={styles.subtotal}>
        <span className={styles.fieldLabel}>Subtotal</span>
        <strong>{formatColones(subtotal)}</strong>
      </p>

      {onRemove && (
        <Button variant="secondary" className={styles.remove} onClick={onRemove}>
          Quitar
        </Button>
      )}
    </div>
  )
}
