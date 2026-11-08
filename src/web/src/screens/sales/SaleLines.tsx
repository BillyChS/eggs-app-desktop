import { Plus, Trash2 } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'
import { Dropdown } from '../../components/Dropdown'
import { MoneyInput } from '../../components/MoneyInput'
import { TextInput } from '../../components/TextInput'
import { formatColones } from '../../lib/money'
import { selectOnFocus } from '../../lib/selectOnFocus'
import type { CartonType, LastPrices } from '../../services/sales'
import { quantityProblem, shownPrice, subtotal, type LineProblems, type OpenLine } from './saleLine'
import styles from './SaleForm.module.css'
import { CARTONS } from './saleText'

/** A line of the form. The key is what lets React tell apart two lines with the same values. */
export interface FormLine extends OpenLine {
  key: number
}

export interface LineRefs {
  type: RefObject<HTMLButtonElement | null>
  quantity: RefObject<HTMLInputElement | null>
  price: RefObject<HTMLInputElement | null>
}

const TYPE_OPTIONS = CARTONS.map(({ type, label }) => ({ value: type, label }))

interface Props {
  lines: FormLine[]
  lastPrices: LastPrices
  errors: Record<number, LineProblems | undefined>
  /** For "Una venta no puede tener más de 20 líneas." */
  linesError?: string
  refsOf: (key: number) => LineRefs
  onChooseType: (key: number, type: CartonType) => void
  onQuantityChange: (key: number, text: string) => void
  onPriceChange: (key: number, price: number | null) => void
  onRemove: (key: number) => void
  onAdd: () => void
  addRef: RefObject<HTMLButtonElement | null>
  /** Enter in the price of this line: the next line, or on past the lines. */
  onPriceEnter: (key: number) => void
}

/** Every line stays editable: carton type, quantity, price and what it comes to, with Quitar once there are two. */
export function SaleLines({
  lines,
  lastPrices,
  errors,
  linesError,
  refsOf,
  onChooseType,
  onQuantityChange,
  onPriceChange,
  onRemove,
  onAdd,
  addRef,
  onPriceEnter,
}: Props) {
  const enter = (event: KeyboardEvent<HTMLInputElement>, next: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        next()
      }
    }
  }

  // Line numbers in the names only once there are several, so one line reads just "Cantidad".
  const named = (label: string, index: number) => (lines.length > 1 ? `${label}, línea ${index + 1}` : label)

  return (
    <fieldset className={styles.lines}>
      <legend className={styles.legend}>Cartones</legend>
      <div className={styles.lineHeadings} aria-hidden="true">
        <span>Tipo de cartón</span>
        <span>Cantidad</span>
        <span>Precio por cartón</span>
        <span className={styles.right}>Subtotal</span>
        <span />
      </div>

      {lines.map((line, index) => {
        const refs = refsOf(line.key)
        const problems = errors[line.key] ?? {}

        return (
          <div key={line.key} className={styles.line}>
            <Dropdown
              label={named('Tipo de cartón', index)}
              hideLabel
              value={line.cartonType}
              options={TYPE_OPTIONS}
              onChange={(type) => onChooseType(line.key, type)}
              error={problems.cartonType}
              buttonRef={refs.type}
            />
            <TextInput
              ref={refs.quantity}
              label={named('Cantidad', index)}
              hideLabel
              value={line.quantity}
              onChange={(text) => onQuantityChange(line.key, text)}
              error={problems.quantity ?? quantityProblem(line.quantity)}
              maxLength={7}
              inputProps={{
                ...selectOnFocus,
                inputMode: 'numeric',
                onKeyDown: (event) => enter(event, () => refs.price.current?.focus()),
              }}
            />
            <MoneyInput
              ref={refs.price}
              label={named('Precio por cartón', index)}
              hideLabel
              value={shownPrice(line, lastPrices)}
              onChange={(price) => onPriceChange(line.key, price)}
              error={problems.unitPrice}
              inputProps={{ ...selectOnFocus, onKeyDown: (event) => enter(event, () => onPriceEnter(line.key)) }}
            />
            <span className={styles.subtotal} aria-label={named('Subtotal', index)}>
              {formatColones(subtotal(line, lastPrices))}
            </span>
            {lines.length > 1 ? (
              <button
                type="button"
                className={styles.removeLine}
                aria-label={`Quitar la línea ${index + 1}`}
                onClick={() => onRemove(line.key)}
              >
                <Trash2 size={20} aria-hidden="true" />
                Quitar
              </button>
            ) : (
              <span />
            )}
          </div>
        )
      })}

      {linesError && (
        <p className={styles.error} role="alert">
          {linesError}
        </p>
      )}

      <button ref={addRef} type="button" className={styles.addLine} onClick={onAdd}>
        <Plus size={22} aria-hidden="true" />
        Agregar otro cartón
      </button>
    </fieldset>
  )
}
