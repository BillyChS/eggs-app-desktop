import { Check, CircleAlert, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DayPicker } from '../../components/DayPicker'
import { useMessages } from '../../components/messages'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { useUnsavedChanges } from '../../layout/useUnsavedChanges'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { getCustomer } from '../../services/customers'
import { ApiError, hasStatus } from '../../services/http'
import {
  createSale,
  deleteSale,
  findLastPrices,
  updateSale,
  type CartonType,
  type LastPrices,
  type Sale,
  type SaleItemInput,
} from '../../services/sales'
import {
  BLANK_LINE,
  findProblems,
  isUntouched,
  MAX_LINES,
  shownPrice,
  subtotal,
  toItem,
  type LineProblems,
  type OpenLine,
} from './saleLine'
import { CustomerPicker, type PickedCustomer } from './CustomerPicker'
import { SaleLineEditor } from './SaleLineEditor'
import styles from './SaleForm.module.css'
import { describeLine, summarizeSale } from './saleText'
import { listOfDay } from './useSaleDay'

const GONE_MESSAGE = 'Esta venta ya no existe.'
const PAID_WITH_MISSING = '¿Cómo pagó? Escoja "Al contado" o "Fiado".'

/** A finished line of the form. The key is what lets React tell apart two lines with the same values. */
interface DoneLine extends SaleItemInput {
  key: number
}

/** How the sale was paid. A new sale starts with neither, so a forgotten "Fiado" can't become a debt nobody wrote. */
type PaidWith = 'cash' | 'credit' | null

type Errors = Record<string, string | undefined>
type FocusTarget = 'type' | 'add' | 'save'

const itemKey = (index: number, field: keyof LineProblems) => `items[${index}].${field}`

function initialLines(sale: Sale | undefined): { done: DoneLine[]; open: OpenLine } {
  if (!sale) {
    return { done: [], open: BLANK_LINE }
  }

  // The last line opens ready to change. Most sales have just one.
  const last = sale.items[sale.items.length - 1]

  return {
    done: sale.items.slice(0, -1).map(({ cartonType, quantity, unitPrice }, key) => ({
      key,
      cartonType,
      quantity,
      unitPrice,
    })),
    open: { cartonType: last.cartonType, quantity: String(last.quantity), price: last.unitPrice, priceTyped: true },
  }
}

interface Values {
  date: string
  done: DoneLine[]
  open: OpenLine | null
  paidWith: PaidWith
  creditTo: PickedCustomer | null
}

/** What would be saved, to compare with what's there. An untouched open line isn't part of the sale. */
function snapshot({ date, done, open, paidWith, creditTo }: Values, lastPrices: LastPrices) {
  const lines = done.map(({ cartonType, quantity, unitPrice }) => [cartonType, String(quantity), unitPrice])

  if (open && !isUntouched(open)) {
    lines.push([open.cartonType ?? '', open.quantity.trim(), shownPrice(open, lastPrices) ?? 0])
  }

  return JSON.stringify({ date, lines, paidWith, creditTo: creditTo?.id ?? null })
}

interface Props {
  /** The sale being edited. Without one, the form creates a new sale. */
  sale?: Sale
  /** The day a new sale starts on. */
  startDay: string
  /** Where to go once saved or deleted, like the customer's account it was opened from. Otherwise, the day's list. */
  returnTo?: string
}

export function SaleForm({ sale, startDay, returnTo }: Props) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()

  const [initial] = useState(() => initialLines(sale))
  const [date, setDate] = useState(sale?.date ?? startDay)
  const [done, setDone] = useState(initial.done)
  const [open, setOpen] = useState<OpenLine | null>(initial.open)
  const [lineNumber, setLineNumber] = useState(sale?.items.length ?? 0)
  const [paidWith, setPaidWith] = useState<PaidWith>(sale ? (sale.isCredit ? 'credit' : 'cash') : null)
  const [creditTo, setCreditTo] = useState<PickedCustomer | null>(sale?.customer ?? null)
  const [picking, setPicking] = useState(false)
  const [lastPrices, setLastPrices] = useState<LastPrices>({})
  const [errors, setErrors] = useState<Errors>({})
  const [removing, setRemoving] = useState<DoneLine | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // What the sale's customer owes now, to say what deleting the sale does to it. Unknown until loaded.
  const [owedNow, setOwedNow] = useState<number | null>(null)

  const dateRef = useRef<HTMLInputElement>(null)
  const firstTypeRef = useRef<HTMLButtonElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)
  const cashRef = useRef<HTMLButtonElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)
  const paidWithLabelId = useId()

  // Set before a change that adds or removes what's to get focus next, and used once the screen has that change.
  const focusNext = useRef<FocusTarget | null>(sale ? null : 'type')
  const { run: oneAtATime, finish } = useOneAtATime()

  const [saved] = useState(() =>
    snapshot(
      {
        date: sale?.date ?? startDay,
        done: initial.done,
        open: sale ? initial.open : null,
        paidWith: sale ? (sale.isCredit ? 'credit' : 'cash') : null,
        creditTo: sale?.customer ?? null,
      },
      {},
    ),
  )
  const guard = useUnsavedChanges(snapshot({ date, done, open, paidWith, creditTo }, lastPrices) !== saved)

  useEffect(() => {
    if (focusNext.current) {
      const targets = { type: firstTypeRef, add: addRef, save: saveRef }
      targets[focusNext.current].current?.focus()
      focusNext.current = null
    }
  })

  const creditCustomerId = sale?.isCredit ? sale.customer?.id : undefined

  // Only a help for the delete question: without it, the question just leaves the balance out.
  useEffect(() => {
    if (!creditCustomerId) {
      return
    }

    const controller = new AbortController()

    getCustomer(creditCustomerId, controller.signal)
      .then((customer) => {
        if (!controller.signal.aborted) {
          setOwedNow(customer.balance)
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [creditCustomerId])

  // In a short window the line being filled in, or its errors, could otherwise stay below the edge of the list.
  useEffect(() => {
    const lines = linesRef.current

    if (lines) {
      lines.scrollTop = lines.scrollHeight
    }
  }, [errors, lineNumber])

  // Only a help: without it, the price just starts empty.
  useEffect(() => {
    const controller = new AbortController()

    findLastPrices(controller.signal)
      .then((prices) => {
        if (!controller.signal.aborted) {
          setLastPrices(prices)
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [])

  const openIndex = done.length
  const price = open ? shownPrice(open, lastPrices) : null
  const openSubtotal = open ? subtotal(open, lastPrices) : 0
  const total = done.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) + openSubtotal

  const clearErrors = (...keys: string[]) =>
    setErrors((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, undefined])) }))

  const chooseType = (cartonType: CartonType) => {
    setOpen((current) => ({ ...(current ?? BLANK_LINE), cartonType }))
    clearErrors(itemKey(openIndex, 'cartonType'), itemKey(openIndex, 'unitPrice'))
    quantityRef.current?.focus()
  }

  const changeQuantity = (quantity: string) => {
    setOpen((current) => ({ ...(current ?? BLANK_LINE), quantity }))
    clearErrors(itemKey(openIndex, 'quantity'))
  }

  const changePrice = (next: number | null) => {
    setOpen((current) => ({ ...(current ?? BLANK_LINE), price: next, priceTyped: true }))
    clearErrors(itemKey(openIndex, 'unitPrice'))
  }

  const changeDate = (next: string) => {
    setDate(next)
    clearErrors('date')
  }

  const chooseCash = () => {
    setPaidWith('cash')
    setCreditTo(null)
    clearErrors('paidWith', 'customerId')
    saveRef.current?.focus()
  }

  const pickCustomer = (customer: PickedCustomer) => {
    setPaidWith('credit')
    setCreditTo(customer)
    setPicking(false)
    clearErrors('paidWith', 'customerId')
    focusNext.current = 'save'
  }

  /** After the price, the payment comes next until it's been chosen; then it's Guardar venta. */
  const afterPrice = () => (paidWith ? saveRef : cashRef).current

  /** Enter moves on, and never saves: that takes the button itself. */
  const moveOnEnter = (event: KeyboardEvent<HTMLInputElement>, next: HTMLElement | null) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        next?.focus()
      }
    }
  }

  const showLineProblems = (problems: LineProblems) => {
    setErrors((current) => ({
      ...current,
      [itemKey(openIndex, 'cartonType')]: problems.cartonType,
      [itemKey(openIndex, 'quantity')]: problems.quantity,
      [itemKey(openIndex, 'unitPrice')]: problems.unitPrice,
    }))

    if (problems.cartonType) {
      firstTypeRef.current?.focus()
    } else if (problems.quantity) {
      quantityRef.current?.focus()
    } else {
      priceRef.current?.focus()
    }
  }

  const addLine = () => {
    // The open line may be untouched here, so it isn't one more line yet.
    if (open && done.length + 1 >= MAX_LINES) {
      setErrors((current) => ({ ...current, items: `Una venta no puede tener más de ${MAX_LINES} líneas.` }))
      return
    }

    if (!open) {
      setOpen(BLANK_LINE)
      setLineNumber((current) => current + 1)
      focusNext.current = 'type'
      return
    }

    if (done.length > 0 && isUntouched(open)) {
      firstTypeRef.current?.focus()
      return
    }

    const problems = findProblems(open, lastPrices)

    if (Object.keys(problems).length > 0) {
      showLineProblems(problems)
      return
    }

    setDone((current) => [...current, { ...toItem(open, lastPrices), key: lineNumber }])
    setOpen(BLANK_LINE)
    setLineNumber((current) => current + 1)
    setErrors({})
    focusNext.current = 'type'
  }

  const removeOpenLine = () => {
    setOpen(null)
    setErrors({})
    focusNext.current = 'add'
  }

  const removeDoneLine = (line: DoneLine) => {
    const remaining = done.filter((other) => other !== line)

    setRemoving(null)
    setDone(remaining)
    setErrors({})

    if (remaining.length === 0 && !open) {
      setOpen(BLANK_LINE)
      setLineNumber((current) => current + 1)
      focusNext.current = 'type'
    } else {
      focusNext.current = 'add'
    }
  }

  const leaveTo = (address: string) => {
    finish()
    guard.allowLeaving()
    navigate(address)
  }

  const handleGone = () => {
    showError(GONE_MESSAGE)
    leaveTo(returnTo ?? '/ventas')
  }

  const save = () => {
    const includesOpen = open !== null && (done.length === 0 || !isUntouched(open))

    if (includesOpen) {
      const problems = findProblems(open, lastPrices)

      if (Object.keys(problems).length > 0) {
        showLineProblems(problems)
        return
      }
    }

    if (!date) {
      setErrors((current) => ({ ...current, date: 'Escoja la fecha de la venta.' }))
      dateRef.current?.focus()
      return
    }

    if (!paidWith) {
      setErrors((current) => ({ ...current, paidWith: PAID_WITH_MISSING }))
      cashRef.current?.focus()
      return
    }

    const items = [
      ...done.map(({ cartonType, quantity, unitPrice }) => ({ cartonType, quantity, unitPrice })),
      ...(includesOpen ? [toItem(open, lastPrices)] : []),
    ]

    void oneAtATime(async () => {
      try {
        const isCredit = paidWith === 'credit'
        const input = { date, items, isCredit, customerId: isCredit ? creditTo!.id : null }
        const result = await (sale ? updateSale(sale.id, input) : createSale(input))
        const when = formatDateLong(result.date)

        showSuccess(
          result.customer
            ? `Venta fiada guardada: ${formatColones(result.total)} a ${result.customer.name}, ${when}.`
            : `Venta guardada: ${formatColones(result.total)}, ${when}.`,
        )
        leaveTo(returnTo ?? listOfDay(result.date))
      } catch (error) {
        if (hasStatus(error, 404)) {
          handleGone()
        } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
          setErrors(error.fieldErrors)

          if (error.fieldErrors.date) {
            dateRef.current?.focus()
          }
        } else if (error instanceof ApiError && error.refusal) {
          showError(error.refusal)
        } else {
          showError('No se pudo guardar la venta. Intente de nuevo.')
        }
      }
    })
  }

  const remove = async () => {
    try {
      await deleteSale(sale!.id)
      showSuccess('Venta borrada.')
      leaveTo(returnTo ?? listOfDay(sale!.date))
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone()
      } else if (error instanceof ApiError && error.refusal) {
        showError(error.refusal)
      } else {
        showError('No se pudo borrar la venta. Intente de nuevo.')
      }
    }
  }

  const deleteQuestion = () => {
    const total = formatColones(sale!.total)

    if (!sale!.isCredit || !sale!.customer) {
      return `¿Borrar la venta de ${total} (${summarizeSale(sale!.items)})? Ya no contará en el total del día.`
    }

    const question = `¿Borrar la venta fiada de ${total} a ${sale!.customer.name}?`

    return owedNow === null
      ? question
      : `${question} Su saldo bajará de ${formatColones(owedNow)} a ${formatColones(owedNow - sale!.total)}.`
  }

  const paidWithError = errors.paidWith ?? errors.customerId

  const lineError = (index: number) =>
    errors[itemKey(index, 'cartonType')] ?? errors[itemKey(index, 'quantity')] ?? errors[itemKey(index, 'unitPrice')]

  return (
    <>
      <div
        className={styles.form}
        // Holding Enter down must not run through the fields and press Guardar venta.
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && event.repeat) {
            event.preventDefault()
          }
        }}
      >
        <DayPicker
          dateRef={dateRef}
          value={date}
          onChange={changeDate}
          error={errors.date}
          onDateKeyDown={(event) => moveOnEnter(event, open ? firstTypeRef.current : afterPrice())}
        />

        <div ref={linesRef} className={styles.lines}>
          {done.length > 0 && (
            <ul className={styles.doneLines} aria-label="Cartones de esta venta">
              {done.map((line, index) => (
                <li key={line.key} className={styles.doneLine}>
                  <span className={styles.doneText}>
                    {describeLine(line)}
                    {lineError(index) && (
                      <span className={styles.error} role="alert">
                        {lineError(index)}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="secondary"
                    className={styles.remove}
                    aria-label={`Quitar ${describeLine(line)}`}
                    onClick={() => setRemoving(line)}
                  >
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {open && (
            <SaleLineEditor
              key={lineNumber}
              line={open}
              price={price}
              subtotal={openSubtotal}
              errors={{
                cartonType: errors[itemKey(openIndex, 'cartonType')],
                quantity: errors[itemKey(openIndex, 'quantity')],
                unitPrice: errors[itemKey(openIndex, 'unitPrice')],
              }}
              onChooseType={chooseType}
              onQuantityChange={changeQuantity}
              onPriceChange={changePrice}
              onRemove={done.length > 0 ? removeOpenLine : undefined}
              onQuantityEnter={(event) => moveOnEnter(event, priceRef.current)}
              onPriceEnter={(event) => moveOnEnter(event, afterPrice())}
              firstTypeRef={firstTypeRef}
              quantityRef={quantityRef}
              priceRef={priceRef}
            />
          )}
        </div>

        <div className={styles.bottom}>
          {errors.items && (
            <p className={styles.error} role="alert">
              {errors.items}
            </p>
          )}
          <div className={styles.summary}>
            <div className={styles.payment}>
              <span id={paidWithLabelId} className={styles.paymentLabel}>
                ¿Cómo pagó?
              </span>
              <div role="group" aria-labelledby={paidWithLabelId} className={styles.paidWith}>
                <button
                  ref={cashRef}
                  type="button"
                  className={paidWith === 'cash' ? `${styles.type} ${styles.chosen}` : styles.type}
                  aria-pressed={paidWith === 'cash'}
                  onClick={chooseCash}
                >
                  {paidWith === 'cash' && <Check size={26} aria-hidden="true" />}
                  Al contado
                </button>
                {/* Shows who, and pressing it again changes who: one button, so the row fits a small window. */}
                <button
                  type="button"
                  className={paidWith === 'credit' ? `${styles.type} ${styles.chosen}` : styles.type}
                  aria-pressed={paidWith === 'credit'}
                  title={creditTo ? `Fiado a ${creditTo.name}` : undefined}
                  onClick={() => setPicking(true)}
                >
                  {paidWith === 'credit' && <Check size={26} aria-hidden="true" />}
                  <span className={styles.creditText}>
                    {paidWith === 'credit' && creditTo ? `Fiado a ${creditTo.name}` : 'Fiado'}
                  </span>
                </button>
              </div>
            </div>
            <p className={styles.total}>
              <span>Total de la venta</span>
              <strong>{formatColones(total)}</strong>
            </p>
          </div>
          {paidWithError && (
            <p className={styles.error} role="alert">
              <CircleAlert size={26} aria-hidden="true" />
              {paidWithError}
            </p>
          )}
          <div className={styles.buttons}>
            <div className={styles.mainButtons}>
              <Button ref={saveRef} onClick={save}>
                Guardar venta
              </Button>
              <Button ref={addRef} variant="secondary" onClick={addLine}>
                <span className={styles.buttonContent}>
                  <Plus size={28} aria-hidden="true" />
                  Agregar otro cartón
                </span>
              </Button>
            </div>
            {sale && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Borrar venta
              </Button>
            )}
          </div>
        </div>
      </div>

      {picking && <CustomerPicker onPick={pickCustomer} onCancel={() => setPicking(false)} />}

      {removing && (
        <ConfirmDialog
          title="¿Quitar este cartón?"
          message={`¿Quitar ${describeLine(removing)}?`}
          confirmLabel="Sí, quitar"
          onCancel={() => setRemoving(null)}
          onConfirm={() => removeDoneLine(removing)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          danger
          title="¿Borrar esta venta?"
          message={deleteQuestion()}
          confirmLabel="Sí, borrar"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false)
            void oneAtATime(remove)
          }}
        />
      )}

      {guard.isAsking && (
        <ConfirmDialog
          title="Tiene cambios sin guardar"
          message="¿Salir sin guardar?"
          cancelLabel="No, seguir aquí"
          confirmLabel="Sí, salir"
          onCancel={guard.stay}
          onConfirm={guard.leave}
        />
      )}
    </>
  )
}
