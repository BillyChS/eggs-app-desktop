import { X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateInput } from '../../components/DateInput'
import { Dropdown } from '../../components/Dropdown'
import { useMessages } from '../../components/messages'
import { MoneyInput } from '../../components/MoneyInput'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { useUnsavedChanges } from '../../layout/useUnsavedChanges'
import { todayLocal } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { selectOnFocus } from '../../lib/selectOnFocus'
import { findSimilarCustomers, getCustomer, type CustomerSummary } from '../../services/customers'
import { ApiError, hasStatus } from '../../services/http'
import {
  createSale,
  deleteSale,
  findLastPrices,
  updateSale,
  type CartonType,
  type LastPrices,
  type Sale,
  type SaleInput,
} from '../../services/sales'
import { describeSimilar } from '../customers/customerText'
import { CustomerChooser } from './CustomerChooser'
import { cleanName, NO_NAME_FOR_CREDIT, type CustomerChoice } from './customerChoice'
import { BLANK_LINE, findProblems, isUntouched, MAX_LINES, shownPrice, subtotal, toItem, type LineProblems } from './saleLine'
import { SaleLines, type FormLine, type LineRefs } from './SaleLines'
import styles from './SaleForm.module.css'
import { deleteQuestion, describeLine, describeSaved, PAID_IN_FULL } from './saleText'

const GONE_MESSAGE = 'Esta venta ya no existe.'
const PAID_WITH_MISSING = '¿Cómo pagó? Escoja "Al contado" o "Fiado".'
const NEW_NAME_MISSING = 'Escriba el nombre del cliente.'

/** How the sale was paid. A new sale starts with neither, so a forgotten "Fiado" can't become a debt nobody wrote. */
type PaidWith = 'cash' | 'credit'

const PAID_WITH_OPTIONS: { value: PaidWith; label: string }[] = [
  { value: 'cash', label: 'Al contado' },
  { value: 'credit', label: 'Fiado' },
]

interface Errors {
  date?: string
  paidWith?: string
  paidNow?: string
  customer?: string
  newName?: string
  newPhone?: string
  lines?: string
  byLine: Record<number, LineProblems | undefined>
}

const NO_ERRORS: Errors = { byLine: {} }

function initialLines(sale: Sale | undefined): FormLine[] {
  if (!sale) {
    return [{ ...BLANK_LINE, key: 0 }]
  }

  return sale.items.map(({ cartonType, quantity, unitPrice }, key) => ({
    key,
    cartonType,
    quantity: String(quantity),
    price: unitPrice,
    priceTyped: true,
  }))
}

function initialChoice(sale: Sale | undefined): CustomerChoice {
  if (!sale) {
    return { kind: 'none' }
  }

  return sale.customer
    ? { kind: 'existing', customer: { id: sale.customer.id, name: sale.customer.name, isDeleted: sale.customer.isDeleted } }
    : { kind: 'noName' }
}

/** The lines that are part of the sale: an untouched one isn't, unless it's the only one, which then shows its errors. */
function linesToSave(lines: FormLine[]): FormLine[] {
  const touched = lines.filter((line) => !isUntouched(line))
  return touched.length > 0 ? touched : lines.slice(0, 1)
}

interface Values {
  date: string
  lines: FormLine[]
  paidWith: PaidWith | null
  choice: CustomerChoice
  paidNow: number | null
}

/** What would be saved, to compare with what's there. */
function snapshot({ date, lines, paidWith, choice, paidNow }: Values, lastPrices: LastPrices) {
  const kept = lines
    .filter((line) => !isUntouched(line))
    .map((line) => [line.cartonType ?? '', line.quantity.trim(), shownPrice(line, lastPrices) ?? 0])

  const who =
    choice.kind === 'existing'
      ? choice.customer.id
      : choice.kind === 'new'
        ? `new:${cleanName(choice.name)}|${choice.phone.trim()}`
        : choice.kind

  return JSON.stringify({ date, kept, paidWith, who, paidNow: paidWith === 'credit' ? (paidNow ?? 0) : 0 })
}

interface Props {
  /** The sale being edited. Without one, the form creates a new sale. */
  sale?: Sale
  /** The day a new sale starts on. */
  startDay: string
  /** Where Cancelar and ✕ go. */
  closeTo: string
  /** Where to go once saved. */
  afterSave: (saved: Sale) => string
  /** Where to go once deleted. */
  afterDelete: string
}

/**
 * A sale, in the order it's told: the day, how it was paid, the cartons, what was paid with a fiado, and who. Enter
 * moves on and never saves: only Guardar venta does. The header and the buttons stay in sight; the middle scrolls.
 */
export function SaleForm({ sale, startDay, closeTo, afterSave, afterDelete }: Props) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()

  const [date, setDate] = useState(sale?.date ?? startDay)
  const [paidWith, setPaidWith] = useState<PaidWith | null>(sale ? (sale.isCredit ? 'credit' : 'cash') : null)
  const [lines, setLines] = useState(() => initialLines(sale))
  const [nextKey, setNextKey] = useState(() => lines.length)
  const [choice, setChoice] = useState<CustomerChoice>(() => initialChoice(sale))
  const [search, setSearch] = useState('')
  const [paidNow, setPaidNow] = useState<number | null>(sale?.paidNow || null)
  const [lastPrices, setLastPrices] = useState<LastPrices>({})
  const [errors, setErrors] = useState<Errors>(NO_ERRORS)
  const [removing, setRemoving] = useState<FormLine | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [similar, setSimilar] = useState<CustomerSummary[] | null>(null)
  // What the sale's customer owes now, to say what deleting the sale does to it. Unknown until loaded.
  const [owedNow, setOwedNow] = useState<number | null>(null)

  const dateRef = useRef<HTMLInputElement>(null)
  const paidWithRef = useRef<HTMLButtonElement>(null)
  const paidNowRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const newNameRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const lineRefs = useRef(new Map<number, LineRefs>())

  const refsOf = (key: number): LineRefs => {
    let refs = lineRefs.current.get(key)

    if (!refs) {
      refs = { type: { current: null }, quantity: { current: null }, price: { current: null } }
      lineRefs.current.set(key, refs)
    }

    return refs
  }

  // A line added or removed gets its focus once it's on screen.
  const focusNext = useRef<(() => HTMLElement | null) | null>(sale ? null : () => paidWithRef.current)
  useEffect(() => {
    if (focusNext.current) {
      focusNext.current()?.focus()
      focusNext.current = null
    }
  })

  const { run: oneAtATime, finish } = useOneAtATime()

  const [saved] = useState(() =>
    snapshot(
      { date: sale?.date ?? startDay, lines, paidWith, choice, paidNow: sale?.paidNow || null },
      {},
    ),
  )
  const guard = useUnsavedChanges(snapshot({ date, lines, paidWith, choice, paidNow }, lastPrices) !== saved)

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

  const isCredit = paidWith === 'credit'
  const total = lines.reduce((sum, line) => sum + subtotal(line, lastPrices), 0)

  const clearLineError = (key: number, ...fields: (keyof LineProblems)[]) =>
    setErrors((current) => {
      const problems = { ...current.byLine[key] }
      fields.forEach((field) => delete problems[field])
      return { ...current, byLine: { ...current.byLine, [key]: problems } }
    })

  const clearErrors = (...fields: (keyof Omit<Errors, 'byLine'>)[]) =>
    setErrors((current) => ({ ...current, ...Object.fromEntries(fields.map((field) => [field, undefined])) }))

  const changeLine = (key: number, change: Partial<FormLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))

  /** Whether who it's for is settled, so Enter can go on to Guardar venta. */
  const customerReady = () =>
    choice.kind === 'existing' ||
    (choice.kind === 'noName' && !isCredit) ||
    (choice.kind === 'new' && cleanName(choice.name) !== '')

  /** Past the cartons: what was paid with a fiado, then who, then Guardar venta. */
  const afterLines = () => {
    if (isCredit) {
      paidNowRef.current?.focus()
    } else {
      afterPaidNow()
    }
  }

  const afterPaidNow = () => {
    if (customerReady()) {
      saveRef.current?.focus()
    } else if (choice.kind === 'new') {
      newNameRef.current?.focus()
    } else {
      searchRef.current?.focus()
    }
  }

  const moveOnEnter = (event: KeyboardEvent<HTMLInputElement>, next: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        next()
      }
    }
  }

  const choosePaidWith = (next: PaidWith) => {
    setPaidWith(next)
    clearErrors('paidWith', 'customer', 'paidNow')

    // Nobody named is what a cash sale starts with, and what a fiado can't be.
    if (next === 'cash' && choice.kind === 'none') {
      setChoice({ kind: 'noName' })
    } else if (next === 'credit' && choice.kind === 'noName') {
      setChoice({ kind: 'none' })
    }

    if (next === 'cash') {
      setPaidNow(null)
    }

    const first = lines[0]
    if (first && first.cartonType === null) {
      refsOf(first.key).type.current?.focus()
    }
  }

  const chooseType = (key: number, cartonType: CartonType) => {
    changeLine(key, { cartonType })
    clearLineError(key, 'cartonType', 'unitPrice')
    refsOf(key).quantity.current?.focus()
  }

  const priceEnter = (key: number) => {
    const index = lines.findIndex((line) => line.key === key)
    const next = lines[index + 1]

    if (next) {
      refsOf(next.key).type.current?.focus()
    } else {
      afterLines()
    }
  }

  const addLine = () => {
    const blank = lines.find(isUntouched)

    if (blank) {
      refsOf(blank.key).type.current?.focus()
      return
    }

    if (lines.length >= MAX_LINES) {
      setErrors((current) => ({ ...current, lines: `Una venta no puede tener más de ${MAX_LINES} líneas.` }))
      return
    }

    const key = nextKey
    setLines((current) => [...current, { ...BLANK_LINE, key }])
    setNextKey(key + 1)
    focusNext.current = () => refsOf(key).type.current
  }

  const askRemove = (key: number) => {
    const line = lines.find((candidate) => candidate.key === key)!

    if (isUntouched(line)) {
      removeLine(line)
    } else {
      setRemoving(line)
    }
  }

  const removeLine = (line: FormLine) => {
    setRemoving(null)
    setLines((current) => current.filter((other) => other.key !== line.key))
    clearErrors('lines')
    focusNext.current = () => addRef.current
  }

  const chooseCustomer = (next: CustomerChoice) => {
    setChoice(next)
    clearErrors('customer', 'newName', 'newPhone')
  }

  const switchToCash = () => {
    setPaidNow(null)
    choosePaidWith('cash')
    saveRef.current?.focus()
  }

  const leaveTo = (address: string) => {
    finish()
    guard.allowLeaving()
    navigate(address)
  }

  const handleGone = () => {
    showError(GONE_MESSAGE)
    leaveTo(afterDelete)
  }

  /** Checks what can be checked here, and shows the first problem with focus on it. Null when something's wrong. */
  const readInput = (): SaleInput | null => {
    const kept = linesToSave(lines)
    const byLine: Errors['byLine'] = {}

    for (const line of kept) {
      const problems = findProblems(line, lastPrices)

      if (Object.keys(problems).length > 0) {
        byLine[line.key] = problems
      }
    }

    const firstBad = kept.find((line) => byLine[line.key])

    if (firstBad) {
      setErrors({ ...NO_ERRORS, byLine })
      const problems = byLine[firstBad.key]!
      const refs = refsOf(firstBad.key)
      ;(problems.cartonType ? refs.type : problems.quantity ? refs.quantity : refs.price).current?.focus()
      return null
    }

    if (!date) {
      setErrors({ ...NO_ERRORS, date: 'Escoja la fecha de la venta.' })
      dateRef.current?.focus()
      return null
    }

    if (!paidWith) {
      setErrors({ ...NO_ERRORS, paidWith: PAID_WITH_MISSING })
      paidWithRef.current?.focus()
      return null
    }

    const items = kept.map((line) => toItem(line, lastPrices))
    const saleTotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const paid = isCredit ? (paidNow ?? 0) : 0

    if (paid > saleTotal || (paid > 0 && paid === saleTotal)) {
      const message =
        paid === saleTotal ? PAID_IN_FULL : `No puede ser mayor que el total de la venta (${formatColones(saleTotal)}).`
      setErrors({ ...NO_ERRORS, paidNow: message })
      paidNowRef.current?.focus()
      return null
    }

    if (isCredit && (choice.kind === 'none' || choice.kind === 'noName')) {
      setErrors({ ...NO_ERRORS, customer: NO_NAME_FOR_CREDIT })
      searchRef.current?.focus()
      return null
    }

    if (choice.kind === 'new' && cleanName(choice.name) === '') {
      setErrors({ ...NO_ERRORS, newName: NEW_NAME_MISSING })
      newNameRef.current?.focus()
      return null
    }

    return {
      date,
      items,
      isCredit,
      customerId: choice.kind === 'existing' ? choice.customer.id : null,
      paidNow: paid,
      ...(choice.kind === 'new' && { newCustomer: { name: cleanName(choice.name), phone: choice.phone.trim() } }),
    }
  }

  /** The API's messages, each next to its field. A line's index is its place among the lines that were sent. */
  const showFieldErrors = (fieldErrors: Record<string, string>) => {
    const kept = linesToSave(lines)
    const byLine: Errors['byLine'] = {}

    for (const [field, message] of Object.entries(fieldErrors)) {
      const match = /^items\[(\d+)\]\.(cartonType|quantity|unitPrice)$/.exec(field)
      const line = match ? kept[Number(match[1])] : undefined

      if (line) {
        byLine[line.key] = { ...byLine[line.key], [match![2]]: message }
      }
    }

    setErrors({
      byLine,
      date: fieldErrors.date,
      paidNow: fieldErrors.paidNow,
      customer: fieldErrors.customerId,
      newName: fieldErrors['newCustomer.name'],
      newPhone: fieldErrors['newCustomer.phone'],
      lines: fieldErrors.items,
    })

    if (fieldErrors.date) {
      dateRef.current?.focus()
    } else if (fieldErrors.paidNow) {
      paidNowRef.current?.focus()
    } else if (fieldErrors['newCustomer.name'] || fieldErrors['newCustomer.phone']) {
      newNameRef.current?.focus()
    } else if (fieldErrors.customerId) {
      searchRef.current?.focus()
    }
  }

  /** Only from inside oneAtATime. */
  const sendNow = async (input: SaleInput) => {
    try {
      const result = await (sale ? updateSale(sale.id, input) : createSale(input))
      showSuccess(describeSaved(result))
      leaveTo(afterSave(result))
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone()
      } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
        showFieldErrors(error.fieldErrors)
      } else if (error instanceof ApiError && error.refusal) {
        showError(error.refusal)
      } else {
        showError('No se pudo guardar la venta. Intente de nuevo.')
      }
    }
  }

  const save = () => {
    const input = readInput()

    if (!input) {
      return
    }

    void oneAtATime(async () => {
      // Someone new is asked about first, if there's already someone with a name like theirs. The warning only
      // helps; if it can't be checked, that's no reason not to add them.
      const found = input.newCustomer ? await findSimilarCustomers(input.newCustomer.name).catch(() => []) : []

      if (found.length > 0) {
        setSimilar(found)
      } else {
        await sendNow(input)
      }
    })
  }

  const remove = async () => {
    try {
      await deleteSale(sale!.id)
      showSuccess('Venta borrada.')
      leaveTo(afterDelete)
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

  const describeRemoving = (line: FormLine) =>
    Object.keys(findProblems(line, lastPrices)).length === 0
      ? `¿Quitar ${describeLine(toItem(line, lastPrices))}?`
      : '¿Quitar esta línea?'

  const showRemaining = isCredit && paidNow !== null && paidNow > 0 && paidNow < total

  return (
    <>
      <div className={styles.page}>
        <section
          className={styles.panel}
          aria-labelledby="sale-form-title"
          // Holding Enter down must not run through the fields and press Guardar venta.
          onKeyDownCapture={(event) => {
            if (event.key === 'Enter' && event.repeat) {
              event.preventDefault()
            }
          }}
        >
          <header className={styles.header}>
            <h1 id="sale-form-title" className={styles.title}>
              {sale ? 'Editar venta' : 'Nueva venta'}
            </h1>
            <button type="button" className={styles.close} aria-label="Cerrar" onClick={() => navigate(closeTo)}>
              <X size={28} aria-hidden="true" />
            </button>
          </header>

          <div className={styles.body}>
            <div className={styles.firstRow}>
              <DateInput
                ref={dateRef}
                label="Fecha"
                value={date}
                onChange={(next) => {
                  setDate(next)
                  clearErrors('date')
                }}
                error={errors.date}
                max={todayLocal()}
                onKeyDown={(event) => moveOnEnter(event, () => paidWithRef.current?.focus())}
              />
              <Dropdown
                label="¿Cómo pagó?"
                value={paidWith}
                options={PAID_WITH_OPTIONS}
                onChange={choosePaidWith}
                error={errors.paidWith}
                buttonRef={paidWithRef}
              />
            </div>

            <SaleLines
              lines={lines}
              lastPrices={lastPrices}
              errors={errors.byLine}
              linesError={errors.lines}
              refsOf={refsOf}
              onChooseType={chooseType}
              onQuantityChange={(key, quantity) => {
                changeLine(key, { quantity })
                clearLineError(key, 'quantity')
              }}
              onPriceChange={(key, price) => {
                changeLine(key, { price, priceTyped: true })
                clearLineError(key, 'unitPrice')
              }}
              onRemove={askRemove}
              onAdd={addLine}
              addRef={addRef}
              onPriceEnter={priceEnter}
            />

            {isCredit && (
              <div className={styles.paidNow}>
                <div className={styles.paidNowRow}>
                  <MoneyInput
                    ref={paidNowRef}
                    label="¿Pagó algo ahora? (opcional)"
                    value={paidNow}
                    onChange={(next) => {
                      setPaidNow(next)
                      clearErrors('paidNow')
                    }}
                    error={errors.paidNow === PAID_IN_FULL ? undefined : errors.paidNow}
                    inputProps={{ ...selectOnFocus, onKeyDown: (event) => moveOnEnter(event, afterPaidNow) }}
                  />
                  <p className={styles.remaining} aria-live="polite">
                    <span>Queda debiendo</span>
                    <strong>{formatColones(showRemaining ? total - paidNow! : total)}</strong>
                  </p>
                </div>
                {errors.paidNow === PAID_IN_FULL && (
                  <div className={styles.paidInFull} role="alert">
                    <p>{PAID_IN_FULL}</p>
                    <Button variant="secondary" onClick={switchToCash}>
                      Cambiar a Al contado
                    </Button>
                  </div>
                )}
              </div>
            )}

            <CustomerChooser
              choice={choice}
              onChoose={chooseCustomer}
              search={search}
              onSearch={setSearch}
              isCredit={isCredit}
              error={errors.customer}
              newErrors={{ name: errors.newName, phone: errors.newPhone }}
              searchRef={searchRef}
              newNameRef={newNameRef}
              onDone={() => saveRef.current?.focus()}
            />
          </div>

          <footer className={styles.footer}>
            <p className={styles.total}>
              <span>Total de la venta</span>
              <strong>{formatColones(total)}</strong>
            </p>
            <div className={styles.buttons}>
              {sale && (
                <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                  Borrar venta
                </Button>
              )}
              <Button variant="secondary" onClick={() => navigate(closeTo)}>
                Cancelar
              </Button>
              <Button ref={saveRef} onClick={save}>
                Guardar venta
              </Button>
            </div>
          </footer>
        </section>
      </div>

      {removing && (
        <ConfirmDialog
          title="¿Quitar este cartón?"
          message={describeRemoving(removing)}
          confirmLabel="Sí, quitar"
          onCancel={() => setRemoving(null)}
          onConfirm={() => removeLine(removing)}
        />
      )}

      {similar && (
        <ConfirmDialog
          title="Ya existe un cliente parecido"
          message={describeSimilar(similar)}
          cancelLabel="No, revisar"
          confirmLabel="Sí, es otra persona"
          onCancel={() => {
            setSimilar(null)
            searchRef.current?.focus()
          }}
          onConfirm={() => {
            setSimilar(null)
            const input = readInput()
            if (input) {
              void oneAtATime(() => sendNow(input))
            }
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          danger
          title="¿Borrar esta venta?"
          message={deleteQuestion(sale!, owedNow)}
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
