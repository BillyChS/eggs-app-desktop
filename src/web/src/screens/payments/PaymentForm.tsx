import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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
import type { Customer } from '../../services/customers'
import { ApiError, hasStatus } from '../../services/http'
import { createPayment, deletePayment, updatePayment, type Payment } from '../../services/payments'
import { describeBalance, describeBalanceNow, statementOf } from '../customers/customerText'
import styles from './PaymentForm.module.css'

// Must match Payment.cs. The API checks it too.
const NOTE_MAX_LENGTH = 200

type Errors = Partial<Record<'date' | 'amount' | 'note', string>>

interface Props {
  /** Who pays, with what they owe now. */
  customer: Customer
  /** The abono being edited. Without one, the form creates a new abono. */
  payment?: Payment
  startDay: string
  /** Where to go once saved or deleted. */
  returnTo: string
}

export function PaymentForm({ customer, payment, startDay, returnTo }: Props) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()

  const [date, setDate] = useState(payment?.date ?? startDay)
  const [amount, setAmount] = useState<number | null>(payment?.amount ?? null)
  const [note, setNote] = useState(payment?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const dateRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const { run: oneAtATime, finish } = useOneAtATime()

  const snapshot = (values: { date: string; amount: number | null; note: string }) =>
    JSON.stringify([values.date, values.amount, values.note.trim()])
  const [saved] = useState(() =>
    snapshot({ date: payment?.date ?? startDay, amount: payment?.amount ?? null, note: payment?.note ?? '' }),
  )
  const guard = useUnsavedChanges(snapshot({ date, amount, note }) !== saved)

  // What they'd owe without this abono: everything, for a new one.
  const owedBefore = customer.balance + (payment?.amount ?? 0)
  const owedAfter = owedBefore - (amount ?? 0)

  useEffect(() => {
    if (!payment) {
      amountRef.current?.focus()
    }
  }, [payment])

  const tooMuchMessage = payment
    ? `Sin este abono, ${customer.name} debería ${formatColones(owedBefore)}. El abono no puede ser mayor.`
    : `${customer.name} debe ${formatColones(owedBefore)}. El abono no puede ser mayor.`

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

  const handleGone = (message: string) => {
    showError(message)
    leaveTo(statementOf(customer.id))
  }

  const save = () => {
    if (!date) {
      setErrors((current) => ({ ...current, date: 'Escoja la fecha del abono.' }))
      dateRef.current?.focus()
      return
    }

    if (amount === null || amount < 1 || amount > owedBefore) {
      setErrors((current) => ({ ...current, amount: amount ? tooMuchMessage : 'Escriba el monto del abono.' }))
      amountRef.current?.focus()
      return
    }

    void oneAtATime(async () => {
      try {
        const input = { date, amount, note: note.trim() }
        const result = await (payment ? updatePayment(payment.id, input) : createPayment(customer.id, input))

        showSuccess(
          `Abono guardado: ${formatColones(result.amount)} de ${customer.name}. ` +
            describeBalanceNow(owedBefore - result.amount),
        )
        leaveTo(returnTo)
      } catch (error) {
        if (hasStatus(error, 404)) {
          handleGone(payment ? 'Este abono ya no existe.' : 'Este cliente ya no existe.')
        } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
          setErrors(error.fieldErrors)
          ;(error.fieldErrors.date ? dateRef : error.fieldErrors.amount ? amountRef : noteRef).current?.focus()
        } else if (error instanceof ApiError && error.refusal) {
          showError(error.refusal)
        } else {
          showError('No se pudo guardar el abono. Intente de nuevo.')
        }
      }
    })
  }

  const remove = async () => {
    try {
      await deletePayment(payment!.id)
      showSuccess(`Abono borrado. ${describeBalanceNow(customer.balance + payment!.amount)}`)
      leaveTo(returnTo)
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone('Este abono ya no existe.')
      } else if (error instanceof ApiError && error.refusal) {
        showError(error.refusal)
      } else {
        showError('No se pudo borrar el abono. Intente de nuevo.')
      }
    }
  }

  // What they owe now, and what they'd owe with this amount. Once the amount has an error, that error says it all,
  // and leaving this out keeps Guardar abono in sight in a small window.
  const owing = errors.amount ? null : (
    <p className={styles.after}>
      <span>{describeBalance(customer.balance)}.</span>
      {amount !== null && amount > owedBefore ? (
        <span className={styles.tooMuch}>Es más de lo que debe.</span>
      ) : (
        <span>
          {payment ? 'Con este cambio: ' : 'Después del abono: '}
          <strong>{owedAfter > 0 ? `debe ${formatColones(owedAfter)}` : 'queda al día'}</strong>
        </span>
      )}
    </p>
  )

  return (
    <>
      <div
        className={styles.form}
        // Holding Enter down must not run through the fields and press Guardar abono.
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
          onDateKeyDown={(event) => moveOnEnter(event, amountRef.current)}
        />

        {/* Side by side, so Guardar abono is still in sight in a small window. */}
        <div className={styles.fields}>
          <div className={styles.amount}>
            <MoneyInput
              ref={amountRef}
              label="Monto del abono"
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
              label="Nota (opcional)"
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
        </div>

        {owing}

        <div className={styles.buttons}>
          <Button ref={saveRef} onClick={save}>
            Guardar abono
          </Button>
          {payment && (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              Borrar abono
            </Button>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          danger
          title="¿Borrar este abono?"
          message={
            `¿Borrar el abono de ${formatColones(payment!.amount)} de ${customer.name} del ` +
            `${formatDateLong(payment!.date)}? Su saldo subirá de ${formatColones(customer.balance)} a ` +
            `${formatColones(customer.balance + payment!.amount)}.`
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
