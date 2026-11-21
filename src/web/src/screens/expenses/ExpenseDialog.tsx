import { CircleHelp } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { ConfirmationSummary, type ConfirmationRow } from '../../components/ConfirmationWindow'
import { DayPicker } from '../../components/DayPicker'
import { Dropdown } from '../../components/Dropdown'
import { Modal } from '../../components/Modal'
import { MoneyInput } from '../../components/MoneyInput'
import { TextInput } from '../../components/TextInput'
import { LoadProblem } from '../../layout/LoadProblem'
import { useLoad } from '../../layout/useLoad'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { useUnsavedChanges } from '../../layout/useUnsavedChanges'
import { formatDateLong } from '../../lib/dates'
import { selectOnFocus } from '../../lib/selectOnFocus'
import {
  createExpense,
  deleteExpense,
  listExpenseCategories,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
} from '../../services/expenses'
import { ApiError, hasStatus } from '../../services/http'
import styles from './ExpenseDialog.module.css'
import {
  cleanTypeName,
  deleteQuestion,
  sameType,
  TYPE_NAME_MAX_LENGTH,
  typeNameProblem,
} from './expenseText'

// Must match Expense.cs. The API checks it too.
const NOTE_MAX_LENGTH = 200

// Must match ExpenseValidator.cs, which says the same for the same cases.
const DATE_MISSING = 'Escoja la fecha del gasto.'
const CATEGORY_MISSING = 'Elija el tipo de gasto.'
const DESCRIPTION_MISSING = 'Escriba qué gasto fue.'
const AMOUNT_MISSING = 'Escriba el monto.'
const SAVE_FAILED =
  'No se pudo guardar el gasto. Presione Listo para intentar de nuevo. Si vuelve a pasar, cierre la aplicación y ábrala otra vez.'
const DELETE_FAILED = 'No se pudo borrar el gasto. Intente de nuevo.'

type Field = 'date' | 'categoryId' | 'description' | 'amount' | 'note'
type Errors = Partial<Record<Field, string>>

/** The API's name for each field of the form. "newCategory" is what "¿Qué gasto fue?" says. */
const API_FIELDS: Record<string, Field> = {
  date: 'date',
  categoryId: 'categoryId',
  newCategory: 'description',
  amount: 'amount',
  note: 'note',
}

/** What the popup shows: the fields, or in their place one of the questions, never a second dialog on top. */
type View = 'form' | 'confirm' | 'delete' | 'discard'

/** The expense waiting in the Ventana de confirmación, with why the last Listo didn't save it. */
interface Confirming {
  input: ExpenseInput
  rows: ConfirmationRow[]
  error: string | null
}

interface Props {
  /** The expense being edited. Without one, the popup adds a new expense. */
  expense?: Expense
  /** The day a new expense starts on. */
  startDay: string
  /** Cancelar, with nothing saved. */
  onClose: () => void
  onSaved: (saved: Expense) => void
  /** Borrar gasto, or the expense was gone already: Gastos closes the popup and says which. */
  onDeleted: (message: { gone: boolean }) => void
}

/**
 * Nuevo gasto and Editar gasto, as a popup over Gastos: the day, its type ("Otro" asks what it was, and that becomes a
 * type of its own), the amount and an optional note. Enter moves on and never saves: Guardar gasto shows the Ventana
 * de confirmación in the same popup, and only its Listo saves.
 */
export function ExpenseDialog({ expense, startDay, onClose, onSaved, onDeleted }: Props) {
  const { run: oneAtATime } = useOneAtATime()
  const { load, retry } = useLoad('expense-categories', listExpenseCategories, 'No se encontraron los tipos de gasto.')
  const categories = load.state === 'ready' ? load.value : null

  // An old "Otro" expense says what it was in its note: it opens with that in "¿Qué gasto fue?", to become a type.
  const wasOther = expense?.category.needsDescription ?? false
  const [date, setDate] = useState(expense?.date ?? startDay)
  // A new expense starts with no type, so a forgotten choice can't be saved under the wrong one.
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category.id ?? null)
  const [description, setDescription] = useState(wasOther ? (expense?.note ?? '') : '')
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [note, setNote] = useState(wasOther ? '' : (expense?.note ?? ''))
  const [errors, setErrors] = useState<Errors>({})
  const [view, setView] = useState<View>('form')
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const dateRef = useRef<HTMLInputElement>(null)
  const typeRef = useRef<HTMLButtonElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  // A retired category is only offered on the expense that still has it.
  const offered: ExpenseCategory[] =
    categories && expense?.category.isRetired && !categories.some((candidate) => candidate.id === expense.category.id)
      ? [...categories, expense.category]
      : (categories ?? [])
  const category = offered.find((candidate) => candidate.id === categoryId) ?? null
  const isOther = category?.needsDescription ?? false
  const typedName = cleanTypeName(description)

  const snapshot = JSON.stringify([date, categoryId, isOther ? typedName : '', amount, note.trim()])
  const [saved] = useState(snapshot)
  const changed = snapshot !== saved
  const guard = useUnsavedChanges(changed)
  // Leaving Gastos (the keyboard's back shortcut) with changes asks the same as Cancelar does.
  const shown: View = guard.isAsking ? 'discard' : view

  // Where focus goes once the next render has put it on screen: the type once the types are in, the field the API
  // refused once Editar is back on the form, the safe button of each question.
  const focusNext = useRef<(() => HTMLElement | null) | null>(() => typeRef.current)
  const focusAfterEdit = useRef<(() => HTMLElement | null) | null>(null)
  useEffect(() => {
    const target = focusNext.current?.()
    if (target) {
      target.focus()
      focusNext.current = null
    }
  })

  const show = (next: View, focus: () => HTMLElement | null) => {
    setView(next)
    focusNext.current = focus
  }

  const clearError = (field: Field) => setErrors((current) => ({ ...current, [field]: undefined }))

  const chooseCategory = (id: string) => {
    const chosen = offered.find((candidate) => candidate.id === id)!
    setCategoryId(id)
    setErrors((current) => ({ ...current, categoryId: undefined, description: undefined }))

    if (chosen.needsDescription) {
      focusNext.current = () => descriptionRef.current
    } else {
      // "¿Qué gasto fue?" goes away, and what was in it with it.
      setDescription('')
      amountRef.current?.focus()
    }
  }

  /** Enter moves on, and never saves: that takes the button itself. A held-down Enter the Modal already ignores. */
  const moveOnEnter = (event: KeyboardEvent<HTMLInputElement>, next: () => HTMLElement | null) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      next()?.focus()
    }
  }

  const close = () => (changed ? show('discard', () => keepRef.current) : onClose())

  /** Checks what can be checked here: every problem next to its field, and focus on the first. Null if any. */
  const readInput = (): ExpenseInput | null => {
    const found: Errors = {
      date: date ? undefined : DATE_MISSING,
      categoryId: category ? undefined : CATEGORY_MISSING,
      description: isOther ? typeNameProblem(typedName, DESCRIPTION_MISSING) : undefined,
      amount: amount === null || amount < 1 ? AMOUNT_MISSING : undefined,
    }
    setErrors(found)

    const refs = { date: dateRef, categoryId: typeRef, description: descriptionRef, amount: amountRef }
    const first = (['date', 'categoryId', 'description', 'amount'] as const).find((field) => found[field])

    if (first) {
      refs[first].current?.focus()
      return null
    }

    const common = { date, amount: amount!, note: note.trim() }
    return isOther ? { ...common, newCategory: typedName } : { ...common, categoryId: category!.id }
  }

  const save = () => {
    const input = readInput()

    if (!input) {
      return
    }

    // For "Otro", the type it goes under: one there already with that name, or a new one.
    const existing = input.newCategory ? sameType(categories ?? [], input.newCategory) : undefined
    const type = input.newCategory ? (existing?.name ?? `${input.newCategory} (tipo nuevo)`) : category!.name
    const rows: ConfirmationRow[] = [
      { label: 'Tipo', value: type },
      { label: 'Fecha', value: formatDateLong(input.date) ?? input.date },
    ]

    if (input.note) {
      rows.push({ label: 'Nota', value: input.note })
    }

    setConfirming({ input, rows, error: null })
    show('confirm', () => editRef.current)
  }

  const showSaveError = (error: string) => setConfirming((current) => current && { ...current, error })

  /** The API's messages, each next to its field. Returns how to reach the first, for once the form is back. */
  const showFieldErrors = (fieldErrors: Record<string, string>): (() => HTMLElement | null) => {
    const found: Errors = {}
    for (const [name, message] of Object.entries(fieldErrors)) {
      if (API_FIELDS[name]) {
        found[API_FIELDS[name]] = message
      }
    }
    setErrors(found)

    const refs = { date: dateRef, categoryId: typeRef, description: descriptionRef, amount: amountRef, note: noteRef }
    const field = (['date', 'categoryId', 'description', 'amount', 'note'] as const).find((name) => found[name])
    return () => (field ? refs[field].current : saveRef.current)
  }

  /** Listo: only from inside oneAtATime. When it fails, the Ventana de confirmación stays and says why. */
  const sendNow = async (input: ExpenseInput) => {
    try {
      const result = await (expense ? updateExpense(expense.id, input) : createExpense(input))
      guard.allowLeaving()
      onSaved(result)
    } catch (error) {
      if (hasStatus(error, 404)) {
        guard.allowLeaving()
        onDeleted({ gone: true })
      } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
        focusAfterEdit.current = showFieldErrors(error.fieldErrors)
        const [first] = Object.values(error.fieldErrors)
        showSaveError(`${first} Presione Editar para corregirlo.`)
      } else if (error instanceof ApiError && error.refusal) {
        showSaveError(`${error.refusal} Presione Editar para cambiar el gasto.`)
      } else {
        showSaveError(SAVE_FAILED)
      }
    }
  }

  /** Editar: back to the form as it was, on the field the API refused, if it refused one. */
  const backToForm = () => {
    setConfirming(null)
    show('form', focusAfterEdit.current ?? (() => saveRef.current))
    focusAfterEdit.current = null
  }

  const remove = async () => {
    try {
      await deleteExpense(expense!.id)
      guard.allowLeaving()
      onDeleted({ gone: false })
    } catch (error) {
      if (hasStatus(error, 404)) {
        guard.allowLeaving()
        onDeleted({ gone: true })
      } else {
        setDeleteError(DELETE_FAILED)
      }
    }
  }

  const stay = () => {
    if (guard.isAsking) {
      guard.stay()
    }
    show('form', () => typeRef.current)
  }

  const leave = () => {
    guard.allowLeaving()
    if (guard.isAsking) {
      guard.leave()
    }
    onClose()
  }

  // Every view is this one Modal, so the dialog stays open as they change; each focuses its own button through
  // focusNext, and initialFocus stays the same ref, which Modal only reads when it opens.
  const title = expense ? 'Editar gasto' : 'Nuevo gasto'

  if (shown === 'confirm' && confirming) {
    return (
      <Modal
        title="Ventana de confirmación"
        className={styles.dialog}
        onEscape={backToForm}
        initialFocus={typeRef}
        body={
          <ConfirmationSummary
            rows={confirming.rows}
            amountLabel="Monto"
            amount={confirming.input.amount}
            error={confirming.error}
          />
        }
      >
        <Button ref={editRef} variant="secondary" onClick={backToForm}>
          Editar
        </Button>
        <Button onClick={() => void oneAtATime(() => sendNow(confirming.input))}>Listo</Button>
      </Modal>
    )
  }

  if (shown === 'delete' && expense) {
    return (
      <Modal
        title="¿Borrar este gasto?"
        tone="danger"
        icon={<CircleHelp size={44} />}
        className={styles.dialog}
        onEscape={() => show('form', () => typeRef.current)}
        initialFocus={typeRef}
        body={
          <>
            <p className={styles.question}>{deleteQuestion(expense)}</p>
            {deleteError && (
              <p role="alert" className={styles.problem}>
                {deleteError}
              </p>
            )}
          </>
        }
      >
        <Button ref={keepRef} variant="secondary" onClick={() => show('form', () => typeRef.current)}>
          No, cancelar
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setDeleteError(null)
            void oneAtATime(remove)
          }}
        >
          Sí, borrar
        </Button>
      </Modal>
    )
  }

  if (shown === 'discard') {
    return (
      <Modal
        title="Tiene cambios sin guardar"
        message="¿Salir sin guardar?"
        icon={<CircleHelp size={44} />}
        className={styles.dialog}
        onEscape={stay}
        initialFocus={typeRef}
      >
        <Button ref={keepRef} variant="secondary" onClick={stay}>
          No, seguir aquí
        </Button>
        <Button onClick={leave}>Sí, salir</Button>
      </Modal>
    )
  }

  return (
    <Modal
      title={title}
      className={`${styles.dialog} ${styles.form}`}
      onEscape={close}
      initialFocus={typeRef}
      body={
        !categories ? (
          <LoadProblem
            state={load.state === 'failed' ? 'failed' : 'loading'}
            failedMessage="No se pudo abrir el formulario de gastos."
            onRetry={retry}
          />
        ) : (
          <div className={styles.fields}>
            <DayPicker
              dateRef={dateRef}
              value={date}
              onChange={(next) => {
                setDate(next)
                clearError('date')
              }}
              error={errors.date}
              onDateKeyDown={(event) => moveOnEnter(event, () => typeRef.current)}
            />

            <div className={styles.pair}>
              <Dropdown
                label="¿Qué tipo de gasto?"
                value={categoryId}
                options={offered.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
                onChange={chooseCategory}
                error={errors.categoryId}
                buttonRef={typeRef}
              />

              {isOther && (
                <TextInput
                  ref={descriptionRef}
                  label="¿Qué gasto fue?"
                  value={description}
                  onChange={(next) => {
                    setDescription(next)
                    clearError('description')
                  }}
                  error={errors.description}
                  maxLength={TYPE_NAME_MAX_LENGTH}
                  inputProps={{
                    placeholder: 'Por ejemplo: Gasolina',
                    onKeyDown: (event) => moveOnEnter(event, () => amountRef.current),
                  }}
                />
              )}
            </div>

            <div className={styles.pair}>
              <MoneyInput
                ref={amountRef}
                label="Monto"
                value={amount}
                onChange={(next) => {
                  setAmount(next)
                  clearError('amount')
                }}
                error={errors.amount}
                inputProps={{ ...selectOnFocus, onKeyDown: (event) => moveOnEnter(event, () => noteRef.current) }}
              />

              <TextInput
                ref={noteRef}
                label="Nota (opcional)"
                value={note}
                onChange={(next) => {
                  setNote(next)
                  clearError('note')
                }}
                error={errors.note}
                maxLength={NOTE_MAX_LENGTH}
                inputProps={{ onKeyDown: (event) => moveOnEnter(event, () => saveRef.current) }}
              />
            </div>
          </div>
        )
      }
    >
      {expense && categories && (
        <Button
          variant="dangerOutline"
          className={styles.apart}
          onClick={() => {
            setDeleteError(null)
            show('delete', () => keepRef.current)
          }}
        >
          Borrar gasto
        </Button>
      )}
      <Button variant="secondary" onClick={close}>
        Cancelar
      </Button>
      {categories && (
        <Button ref={saveRef} onClick={save}>
          Guardar gasto
        </Button>
      )}
    </Modal>
  )
}
