import { Check, CircleAlert } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DayPicker } from '../../components/DayPicker'
import { useMessages } from '../../components/messages'
import { MoneyInput } from '../../components/MoneyInput'
import { TextInput } from '../../components/TextInput'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { useUnsavedChanges } from '../../layout/useUnsavedChanges'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { selectOnFocus } from '../../lib/selectOnFocus'
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type Expense,
  type ExpenseCategory,
} from '../../services/expenses'
import { ApiError, hasStatus } from '../../services/http'
import styles from './ExpenseForm.module.css'
import { listOfExpenseDay } from './useExpenseDay'

// Must match Expense.cs. The API checks it too.
const NOTE_MAX_LENGTH = 200

const GONE_MESSAGE = 'Este gasto ya no existe.'
const CATEGORY_MISSING = 'Escoja en qué gastó.'
const DESCRIPTION_MISSING = 'Escriba en qué gastó.'

type Errors = Partial<Record<'date' | 'categoryId' | 'amount' | 'note', string>>

/** "Plásticos/Envoltorios" can break after the slash, so it fits its button in two lines. */
function breakableName(name: string) {
  return name.split('/').map((part, index, parts) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ))
}

interface Props {
  /** The categories new expenses can use, in button order. */
  categories: ExpenseCategory[]
  /** The expense being edited. Without one, the form creates a new expense. */
  expense?: Expense
  /** The day a new expense starts on. */
  startDay: string
}

export function ExpenseForm({ categories, expense, startDay }: Props) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()

  const [date, setDate] = useState(expense?.date ?? startDay)
  // A new expense starts with no category, so a forgotten choice can't be saved under the wrong one.
  const [categoryId, setCategoryId] = useState<string | null>(expense?.category.id ?? null)
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [note, setNote] = useState(expense?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const dateRef = useRef<HTMLInputElement>(null)
  const firstCategoryRef = useRef<HTMLButtonElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const categoriesLabelId = useId()
  const { run: oneAtATime, finish } = useOneAtATime()

  // A retired category is only a button on the expense that still has it.
  const buttons =
    expense?.category.isRetired && !categories.some((category) => category.id === expense.category.id)
      ? [...categories, expense.category]
      : categories
  const category = buttons.find((candidate) => candidate.id === categoryId) ?? null

  const snapshot = (values: { date: string; categoryId: string | null; amount: number | null; note: string }) =>
    JSON.stringify([values.date, values.categoryId, values.amount, values.note.trim()])
  const [saved] = useState(() =>
    snapshot({
      date: expense?.date ?? startDay,
      categoryId: expense?.category.id ?? null,
      amount: expense?.amount ?? null,
      note: expense?.note ?? '',
    }),
  )
  const guard = useUnsavedChanges(snapshot({ date, categoryId, amount, note }) !== saved)

  useEffect(() => {
    if (!expense) {
      firstCategoryRef.current?.focus()
    }
  }, [expense])

  // In a small window an error under Monto or the note falls below the edge, though its field is in sight and has
  // focus. Its message is what says what to do, so it's brought into sight too.
  useEffect(() => {
    const describedBy = document.activeElement?.getAttribute('aria-describedby')
    const message = describedBy ? document.getElementById(describedBy.split(' ').pop()!) : null
    message?.scrollIntoView?.({ block: 'nearest' })
  }, [errors])

  const chooseCategory = (chosen: ExpenseCategory) => {
    setCategoryId(chosen.id)
    setErrors((current) => ({
      ...current,
      categoryId: undefined,
      // A description that was missing for "Otro" isn't missing for any other category.
      note: current.note === DESCRIPTION_MISSING ? undefined : current.note,
    }))
    amountRef.current?.focus()
  }

  /** Enter moves on, and never saves: that takes the button itself. */
  const moveOnEnter = (event: KeyboardEvent<HTMLInputElement>, next: HTMLElement | null) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        next?.focus()
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
    leaveTo(listOfExpenseDay(expense?.date ?? startDay))
  }

  const save = () => {
    const trimmed = note.trim()

    if (!date) {
      setErrors((current) => ({ ...current, date: 'Escoja la fecha del gasto.' }))
      dateRef.current?.focus()
      return
    }

    if (!category) {
      setErrors((current) => ({ ...current, categoryId: CATEGORY_MISSING }))
      firstCategoryRef.current?.focus()
      return
    }

    if (amount === null || amount < 1) {
      setErrors((current) => ({ ...current, amount: 'Escriba el monto del gasto.' }))
      amountRef.current?.focus()
      return
    }

    if (category.needsDescription && !trimmed) {
      setErrors((current) => ({ ...current, note: DESCRIPTION_MISSING }))
      noteRef.current?.focus()
      return
    }

    void oneAtATime(async () => {
      try {
        const input = { date, categoryId: category.id, amount, note: trimmed }
        const result = await (expense ? updateExpense(expense.id, input) : createExpense(input))

        showSuccess(
          `Gasto guardado: ${result.category.name} ${formatColones(result.amount)}, ${formatDateLong(result.date)}.`,
        )
        leaveTo(listOfExpenseDay(result.date))
      } catch (error) {
        if (hasStatus(error, 404)) {
          handleGone()
        } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
          const fieldErrors = error.fieldErrors as Errors
          setErrors(fieldErrors)
          ;(fieldErrors.date
            ? dateRef
            : fieldErrors.categoryId
              ? firstCategoryRef
              : fieldErrors.amount
                ? amountRef
                : noteRef
          ).current?.focus()
        } else if (error instanceof ApiError && error.refusal) {
          showError(error.refusal)
        } else {
          showError('No se pudo guardar el gasto. Intente de nuevo.')
        }
      }
    })
  }

  const remove = async () => {
    try {
      await deleteExpense(expense!.id)
      showSuccess('Gasto borrado.')
      leaveTo(listOfExpenseDay(expense!.date))
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone()
      } else {
        showError('No se pudo borrar el gasto. Intente de nuevo.')
      }
    }
  }

  return (
    <>
      <div
        className={styles.form}
        // Holding Enter down must not run through the fields and press Guardar gasto.
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && event.repeat) {
            event.preventDefault()
          }
        }}
      >
        <DayPicker
          dateRef={dateRef}
          value={date}
          onChange={(next) => {
            setDate(next)
            setErrors((current) => ({ ...current, date: undefined }))
          }}
          error={errors.date}
          onDateKeyDown={(event) => moveOnEnter(event, category ? amountRef.current : firstCategoryRef.current)}
        />

        <div>
          {/* Read out by screen readers; the buttons say plainly enough what they are to the eye. */}
          <span id={categoriesLabelId} className={styles.hiddenLabel}>
            ¿En qué gastó?
          </span>
          <div role="group" aria-labelledby={categoriesLabelId} className={styles.categories}>
            {buttons.map((candidate, index) => {
              const chosen = candidate.id === categoryId

              return (
                <button
                  key={candidate.id}
                  ref={index === 0 ? firstCategoryRef : undefined}
                  type="button"
                  className={chosen ? `${styles.category} ${styles.chosen}` : styles.category}
                  aria-pressed={chosen}
                  onClick={() => chooseCategory(candidate)}
                >
                  {chosen && <Check size={26} aria-hidden="true" />}
                  <span>{breakableName(candidate.name)}</span>
                </button>
              )
            })}
          </div>
          {errors.categoryId && (
            <p className={styles.error} role="alert">
              <CircleAlert size={26} aria-hidden="true" />
              {errors.categoryId}
            </p>
          )}
        </div>

        {/* One row with Guardar gasto at its end, so it's still in sight in a small window. */}
        <div className={styles.fields}>
          <div className={styles.amount}>
            <MoneyInput
              ref={amountRef}
              label="Monto"
              value={amount}
              onChange={(next) => {
                setAmount(next)
                setErrors((current) => ({ ...current, amount: undefined }))
              }}
              error={errors.amount}
              inputProps={{ ...selectOnFocus, onKeyDown: (event) => moveOnEnter(event, noteRef.current) }}
            />
          </div>
          <div className={styles.note}>
            <TextInput
              ref={noteRef}
              label={category?.needsDescription ? '¿En qué gastó? (obligatorio)' : 'Nota (opcional)'}
              value={note}
              onChange={(next) => {
                setNote(next)
                setErrors((current) => ({ ...current, note: undefined }))
              }}
              error={errors.note}
              maxLength={NOTE_MAX_LENGTH}
              inputProps={{ onKeyDown: (event) => moveOnEnter(event, saveRef.current) }}
            />
          </div>
          <Button ref={saveRef} className={styles.save} onClick={save}>
            Guardar gasto
          </Button>
        </div>

        {expense && (
          <div>
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Borrar gasto
            </Button>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          danger
          title="¿Borrar este gasto?"
          message={
            `¿Borrar el gasto de ${expense!.category.name} de ${formatColones(expense!.amount)} del ` +
            `${formatDateLong(expense!.date)}? Ya no contará en el total del día.`
          }
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
