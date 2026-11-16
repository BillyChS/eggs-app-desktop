import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmationWindow, type ConfirmationRow } from '../../components/ConfirmationWindow'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DayPicker } from '../../components/DayPicker'
import { Dropdown } from '../../components/Dropdown'
import { useMessages } from '../../components/messages'
import { MoneyInput } from '../../components/MoneyInput'
import { TextInput } from '../../components/TextInput'
import { FormFooter } from '../../layout/FormFooter'
import { Screen } from '../../layout/Screen'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { useUnsavedChanges } from '../../layout/useUnsavedChanges'
import { formatDateLong } from '../../lib/dates'
import { selectOnFocus } from '../../lib/selectOnFocus'
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
} from '../../services/expenses'
import { ApiError, hasStatus } from '../../services/http'
import { deleteQuestion } from './expenseText'
import styles from './ExpenseForm.module.css'

// Must match Expense.cs. The API checks it too.
const NOTE_MAX_LENGTH = 200

const GONE_MESSAGE = 'Este gasto ya no existe.'
// Must match ExpenseValidator.cs, which says the same for the same cases.
const DATE_MISSING = 'Escoja la fecha del gasto.'
const CATEGORY_MISSING = 'Elija el tipo de gasto.'
const DESCRIPTION_MISSING = 'Escriba qué gasto fue.'
const AMOUNT_MISSING = 'Escriba el monto.'
const SAVE_FAILED =
  'No se pudo guardar el gasto. Presione Listo para intentar de nuevo. Si vuelve a pasar, cierre la aplicación y ábrala otra vez.'

type Field = 'date' | 'categoryId' | 'description' | 'amount' | 'note'
type Errors = Partial<Record<Field, string>>

/** The expense waiting in the Ventana de confirmación, with why the last Listo didn't save it. */
interface Confirming {
  input: ExpenseInput
  rows: ConfirmationRow[]
  error: string | null
}

interface Props {
  /** The categories new expenses can use, in their order, "Otro" last. */
  categories: ExpenseCategory[]
  /** The expense being edited. Without one, the form creates a new expense. */
  expense?: Expense
  /** The day a new expense starts on. */
  startDay: string
  /** Where Cancelar goes. */
  closeTo: string
  /** Where to go once saved. */
  afterSave: (saved: Expense) => string
  /** Where to go once deleted. */
  afterDelete: string
}

/**
 * An expense, as a page like the sale form: the day, what type it was ("Otro" says what in "¿Qué gasto fue?", which
 * is saved as its note), the amount and an optional note. Enter moves on and never saves: Guardar gasto opens the
 * Ventana de confirmación, and only its Listo saves. The bar with the total and the buttons stays in sight.
 */
export function ExpenseForm({ categories, expense, startDay, closeTo, afterSave, afterDelete }: Props) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()
  const { run: oneAtATime, finish } = useOneAtATime()

  const wasOther = expense?.category.needsDescription ?? false
  const [date, setDate] = useState(expense?.date ?? startDay)
  // A new expense starts with no type, so a forgotten choice can't be saved under the wrong one.
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category.id ?? null)
  const [description, setDescription] = useState(wasOther ? (expense?.note ?? '') : '')
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [note, setNote] = useState(wasOther ? '' : (expense?.note ?? ''))
  const [errors, setErrors] = useState<Errors>({})
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const dateRef = useRef<HTMLInputElement>(null)
  const typeRef = useRef<HTMLButtonElement>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)

  // A retired category is only offered on the expense that still has it.
  const offered =
    expense?.category.isRetired && !categories.some((category) => category.id === expense.category.id)
      ? [...categories, expense.category]
      : categories
  const category = offered.find((candidate) => candidate.id === categoryId) ?? null
  const isOther = category?.needsDescription ?? false

  // What would be saved as the note: for "Otro", what it was; for the rest, the optional note.
  const noteToSave = (isOther ? description : note).trim()

  const [saved] = useState(() => JSON.stringify([date, categoryId, amount, (expense?.note ?? '').trim()]))
  const guard = useUnsavedChanges(JSON.stringify([date, categoryId, amount, noteToSave]) !== saved)

  // Where focus goes once the next render has put it on screen: the type when a new expense opens, "¿Qué gasto
  // fue?" once "Otro" shows it, the field the API refused once Editar closes the Ventana de confirmación.
  const focusNext = useRef<(() => HTMLElement | null) | null>(expense ? null : () => typeRef.current)
  const focusAfterEdit = useRef<(() => HTMLElement | null) | null>(null)
  useEffect(() => {
    if (focusNext.current) {
      focusNext.current()?.focus()
      focusNext.current = null
    }
  })

  // In a small window an error under a field can fall below the edge, though its field is in sight and has focus.
  // Its message is what says what to do, so it's brought into sight too.
  useEffect(() => {
    const describedBy = document.activeElement?.getAttribute('aria-describedby')
    const message = describedBy ? document.getElementById(describedBy.split(' ').pop()!) : null
    message?.scrollIntoView?.({ block: 'nearest' })
  }, [errors])

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

  /** Enter moves on, and never saves: that takes the button itself. */
  const moveOnEnter = (event: KeyboardEvent<HTMLInputElement>, next: () => HTMLElement | null) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        next()?.focus()
      }
    }
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

  /** Checks what can be checked here: every problem next to its field, and focus on the first. Null if any. */
  const readInput = (): ExpenseInput | null => {
    const found: Errors = {
      date: date ? undefined : DATE_MISSING,
      categoryId: category ? undefined : CATEGORY_MISSING,
      description: isOther && !description.trim() ? DESCRIPTION_MISSING : undefined,
      amount: amount === null || amount < 1 ? AMOUNT_MISSING : undefined,
    }
    setErrors(found)

    const first = found.date
      ? dateRef
      : found.categoryId
        ? typeRef
        : found.description
          ? descriptionRef
          : found.amount
            ? amountRef
            : null

    if (first) {
      first.current?.focus()
      return null
    }

    return { date, categoryId: category!.id, amount: amount!, note: noteToSave }
  }

  const save = () => {
    const input = readInput()

    if (!input) {
      return
    }

    const rows: ConfirmationRow[] = [
      { label: 'Tipo', value: isOther ? `Otro: ${input.note}` : category!.name },
      { label: 'Fecha', value: formatDateLong(input.date) ?? input.date },
    ]

    if (!isOther && input.note) {
      rows.push({ label: 'Nota', value: input.note })
    }

    setConfirming({ input, rows, error: null })
  }

  const showSaveError = (error: string) => setConfirming((current) => current && { ...current, error })

  /** The API's messages, each next to its field. Returns how to reach the first, for once the form is back in front. */
  const showFieldErrors = (fieldErrors: Record<string, string>): (() => HTMLElement | null) => {
    // "Otro"'s note is what's in "¿Qué gasto fue?".
    const noteField: Field = isOther ? 'description' : 'note'
    setErrors({
      date: fieldErrors.date,
      categoryId: fieldErrors.categoryId,
      amount: fieldErrors.amount,
      [noteField]: fieldErrors.note,
    })

    const refs = { date: dateRef, categoryId: typeRef, amount: amountRef, note: isOther ? descriptionRef : noteRef }
    const field = (['date', 'categoryId', 'amount', 'note'] as const).find((name) => fieldErrors[name])
    return () => (field ? refs[field].current : saveRef.current)
  }

  /** Listo: only from inside oneAtATime. When it fails, the Ventana de confirmación stays and says why. */
  const sendNow = async (input: ExpenseInput) => {
    try {
      const result = await (expense ? updateExpense(expense.id, input) : createExpense(input))
      leaveTo(afterSave(result))
    } catch (error) {
      if (hasStatus(error, 404)) {
        setConfirming(null)
        handleGone()
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
    focusNext.current = focusAfterEdit.current
    focusAfterEdit.current = null
  }

  const remove = async () => {
    try {
      await deleteExpense(expense!.id)
      showSuccess('Gasto borrado.')
      leaveTo(afterDelete)
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone()
      } else {
        showError('No se pudo borrar el gasto. Intente de nuevo.')
      }
    }
  }

  return (
    <div
      className={styles.form}
      // Holding Enter down must not run through the fields and press Guardar gasto, or Listo after it.
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' && event.repeat) {
          event.preventDefault()
        }
      }}
    >
      <Screen
        title={expense ? 'Editar gasto' : 'Nuevo gasto'}
        footer={
          <FormFooter
            totalLabel="Total del gasto"
            total={amount ?? 0}
            saveLabel="Guardar gasto"
            saveRef={saveRef}
            onSave={save}
            onCancel={() => navigate(closeTo)}
            {...(expense && { deleteLabel: 'Borrar gasto', onDelete: () => setConfirmingDelete(true) })}
          />
        }
      >
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

          <div className={styles.narrow}>
            <Dropdown
              label="¿Qué tipo de gasto?"
              value={categoryId}
              options={offered.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
              onChange={chooseCategory}
              error={errors.categoryId}
              buttonRef={typeRef}
            />
          </div>

          {isOther && (
            <div className={styles.narrow}>
              <TextInput
                ref={descriptionRef}
                label="¿Qué gasto fue?"
                value={description}
                onChange={(next) => {
                  setDescription(next)
                  clearError('description')
                }}
                error={errors.description}
                maxLength={NOTE_MAX_LENGTH}
                inputProps={{
                  placeholder: 'Por ejemplo: Gasolina',
                  onKeyDown: (event) => moveOnEnter(event, () => amountRef.current),
                }}
              />
            </div>
          )}

          <div className={styles.narrow}>
            <MoneyInput
              ref={amountRef}
              label="Monto"
              value={amount}
              onChange={(next) => {
                setAmount(next)
                clearError('amount')
              }}
              error={errors.amount}
              inputProps={{
                ...selectOnFocus,
                // "Otro" has no note: what it was is its note.
                onKeyDown: (event) => moveOnEnter(event, () => (isOther ? saveRef.current : noteRef.current)),
              }}
            />
          </div>

          {!isOther && (
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
          )}
        </div>
      </Screen>

      {confirming && (
        <ConfirmationWindow
          rows={confirming.rows}
          amountLabel="Monto"
          amount={confirming.input.amount}
          error={confirming.error}
          onEdit={backToForm}
          onConfirm={() => void oneAtATime(() => sendNow(confirming.input))}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          danger
          title="¿Borrar este gasto?"
          message={deleteQuestion(expense!)}
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
    </div>
  )
}
