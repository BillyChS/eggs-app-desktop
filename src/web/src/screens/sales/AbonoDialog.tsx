import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useMessages } from '../../components/messages'
import { Modal } from '../../components/Modal'
import { MoneyInput } from '../../components/MoneyInput'
import { useLoad } from '../../layout/useLoad'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { selectOnFocus } from '../../lib/selectOnFocus'
import { ApiError, hasStatus } from '../../services/http'
import { createSalePayment, getSalePayments } from '../../services/payments'
import type { Sale } from '../../services/sales'
import styles from './AbonoDialog.module.css'
import { describeCartons, describeShareOf, NO_NAME, tooMuch } from './saleText'

const GONE_MESSAGE = 'Esta venta ya no existe.'
const AMOUNT_MISSING = 'Escriba cuánto va a abonar.'

interface Props {
  /** The fiado, as the list has it: shown at once, then replaced by what the API says now. */
  sale: Sale
  /** Ver abonos, for a fiado that's paid: the summary and its abonos, with nothing to type. */
  readOnly: boolean
  onClose: () => void
  /** Saved, or the sale is gone: the dialog closes, and the list loads again. */
  onChanged: () => void
}

/**
 * Abonar, from a fiado's row: what the sale owes, an amount (always empty when it opens), what it will owe after,
 * and the abonos that paid it so far. The abono is paid today and pays this sale first. Enter in the amount moves on
 * to Guardar abono and never saves; Guardar abono asks before saving.
 */
export function AbonoDialog({ sale, readOnly, onClose, onChanged }: Props) {
  const { showError } = useMessages()
  const { run: oneAtATime, finish } = useOneAtATime()
  const { load, retry } = useLoad(sale.id, (signal) => getSalePayments(sale.id, signal), GONE_MESSAGE)

  const [amount, setAmount] = useState<number | null>(null)
  const [amountError, setAmountError] = useState<string>()
  // A refusal or a failure, which isn't about the amount.
  const [problem, setProblem] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  const amountRef = useRef<HTMLInputElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const history = load.state === 'ready' ? load.value : null
  const shown = history?.sale ?? sale
  const owed = shown.owed
  const name = shown.customer?.name ?? NO_NAME

  // useLoad already said it's gone; there's nothing left to show.
  const gone = load.state === 'gone'
  const latestOnChanged = useRef(onChanged)
  useEffect(() => {
    latestOnChanged.current = onChanged
  })
  useEffect(() => {
    if (gone) {
      latestOnChanged.current()
    }
  }, [gone])

  const problemWith = (value: number | null): string | undefined =>
    value === null || value < 1 ? AMOUNT_MISSING : value > owed ? tooMuch(owed) : undefined

  const moveOn = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveRef.current?.focus()
    }
  }

  const askToSave = () => {
    const found = problemWith(amount)

    if (found) {
      setAmountError(found)
      amountRef.current?.focus()
      return
    }

    setProblem(null)
    setAsking(true)
  }

  const save = (value: number) =>
    void oneAtATime(async () => {
      try {
        await createSalePayment(sale.id, value)
        finish()
        onChanged()
      } catch (error) {
        if (hasStatus(error, 404)) {
          finish()
          showError(GONE_MESSAGE)
          onChanged()
        } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
          // What it owes may have changed since the dialog opened.
          setAmountError(error.fieldErrors.amount ?? Object.values(error.fieldErrors)[0])
          retry()
          amountRef.current?.focus()
        } else if (error instanceof ApiError && error.refusal) {
          setProblem(error.refusal)
        } else {
          setProblem('No se pudo guardar el abono. Intente de nuevo.')
        }
      }
    })

  if (gone) {
    return null
  }

  const after = amount !== null && amount > owed ? null : owed - (amount ?? 0)

  return (
    <>
      <Modal
        title={readOnly ? 'Abonos de la venta' : 'Abonar'}
        onEscape={onClose}
        initialFocus={readOnly ? closeRef : amountRef}
        wide
        body={
          <div className={styles.columns}>
            <div className={styles.column}>
              <dl className={styles.summary}>
                <dt>Cliente</dt>
                <dd>{name}</dd>
                <dt>Fecha de la venta</dt>
                <dd>{formatDateLong(shown.date) ?? shown.date}</dd>
                <dt>Cartones</dt>
                <dd>{describeCartons(shown.items)}</dd>
                <dt>Total de la venta</dt>
                <dd>{formatColones(shown.total)}</dd>
              </dl>

              {readOnly ? (
                <p className={styles.owed}>Ya está pagada.</p>
              ) : (
                <>
                  <p className={styles.owed}>
                    Debe: <strong>{formatColones(owed)}</strong>
                  </p>
                  <div>
                    <MoneyInput
                      ref={amountRef}
                      label="¿Cuánto va a abonar?"
                      value={amount}
                      onChange={(next) => {
                        setAmount(next)
                        setAmountError(undefined)
                      }}
                      error={amountError}
                      inputProps={{ ...selectOnFocus, onKeyDown: moveOn }}
                    />
                    <p
                      className={after === null ? `${styles.after} ${styles.tooMuch}` : styles.after}
                      aria-live="polite"
                    >
                      {after === null ? tooMuch(owed) : `Después de este abono le quedará: ${formatColones(after)}`}
                    </p>
                  </div>
                </>
              )}

              {problem && (
                <p role="alert" className={styles.problem}>
                  {problem}
                </p>
              )}
            </div>

            <section className={styles.history} aria-labelledby="abonos-anteriores">
              <h3 id="abonos-anteriores" className={styles.historyTitle}>
                Abonos anteriores
              </h3>
              {load.state === 'failed' ? (
                <div className={styles.historyProblem}>
                  <p role="alert">No se pudieron cargar los abonos.</p>
                  <Button variant="secondary" onClick={retry}>
                    Intentar de nuevo
                  </Button>
                </div>
              ) : !history ? (
                <p role="status" className={styles.muted}>
                  Cargando…
                </p>
              ) : history.payments.length === 0 ? (
                <p className={styles.muted}>Todavía no hay abonos para esta venta.</p>
              ) : (
                <>
                  <ul className={styles.list} aria-label="Abonos de esta venta">
                    {history.payments.map((share) => {
                      const of = describeShareOf(share)
                      return (
                        <li key={share.id} className={styles.row}>
                          <span className={styles.lines}>
                            <span>{formatDateLong(share.date) ?? share.date}</span>
                            {share.paidWithSale && <span className={styles.muted}>al hacer la venta</span>}
                          </span>
                          <span className={`${styles.lines} ${styles.amount}`}>
                            <strong>{formatColones(share.applied)}</strong>
                            {of && <span className={styles.muted}>{of}</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <p className={styles.paid}>
                    Total abonado: <strong>{formatColones(history.paid)}</strong>
                  </p>
                </>
              )}
            </section>
          </div>
        }
      >
        {readOnly ? (
          <Button ref={closeRef} variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button ref={saveRef} onClick={askToSave}>
              Guardar abono
            </Button>
          </>
        )}
      </Modal>

      {asking && amount !== null && (
        <ConfirmDialog
          title="¿Guardar este abono?"
          message={`¿Guardar abono de ${formatColones(amount)} para ${name}? Le quedará ${formatColones(owed - amount)}.`}
          cancelLabel="No"
          confirmLabel="Sí, guardar"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            save(amount)
          }}
        />
      )}
    </>
  )
}
