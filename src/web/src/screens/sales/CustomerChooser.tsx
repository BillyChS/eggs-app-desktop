import { Check, CircleAlert, Plus, Search } from 'lucide-react'
import { useId, useRef, type KeyboardEvent, type RefObject } from 'react'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { formatColones } from '../../lib/money'
import { useCustomerList } from '../customers/useCustomerList'
import styles from './CustomerChooser.module.css'
import { cleanName, describeChoice, type CustomerChoice } from './customerChoice'
import { NO_NAME } from './saleText'

// Must match Customer.cs. The API checks them too.
const NAME_MAX_LENGTH = 100
const PHONE_MAX_LENGTH = 30

interface Props {
  choice: CustomerChoice
  onChoose: (choice: CustomerChoice) => void
  search: string
  onSearch: (search: string) => void
  isCredit: boolean
  /** Why what's chosen can't be saved, under the results. */
  error?: string
  newErrors: { name?: string; phone?: string }
  searchRef: RefObject<HTMLInputElement | null>
  newNameRef: RefObject<HTMLInputElement | null>
  /** Where Enter goes from the last field: Guardar venta. */
  onDone: () => void
}

/**
 * The search, with its results always in sight below it: someone new first, then "Cliente sin nombre" (until a name
 * is typed), then whoever matches, each with their phone and what they owe. Adding someone new opens a smaller panel;
 * they're saved together with the sale.
 */
export function CustomerChooser({
  choice,
  onChoose,
  search,
  onSearch,
  isCredit,
  error,
  newErrors,
  searchRef,
  newNameRef,
  onDone,
}: Props) {
  const searchId = useId()
  const resultsRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const wanted = cleanName(search)
  const { result, failed, retry } = useCustomerList(wanted)

  const shown = result?.search === wanted ? result.customers : null
  const nothingMatches = wanted !== '' && shown?.length === 0

  // Enter moves on to the first name, rather than picking one that might not be the person meant.
  const searchEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        ;(resultsRef.current?.querySelector<HTMLButtonElement>('[data-result]:not(:disabled)') ?? addRef.current)?.focus()
      }
    }
  }

  const moveOn = (event: KeyboardEvent<HTMLInputElement>, next: () => void) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      if (!event.repeat) {
        next()
      }
    }
  }

  const startNew = () => {
    onChoose({ kind: 'new', name: nothingMatches ? wanted : '', phone: '' })
    requestAnimationFrame(() => newNameRef.current?.focus())
  }

  const cancelNew = () => {
    onChoose(isCredit ? { kind: 'none' } : { kind: 'noName' })
    searchRef.current?.focus()
  }

  const row = (chosen: boolean, disabled = false) =>
    [styles.row, chosen && styles.chosen, disabled && styles.disabled].filter(Boolean).join(' ')

  return (
    <div className={styles.chooser}>
      <div className={styles.top}>
        <label htmlFor={searchId} className={styles.label}>
          Cliente
        </label>
        <span className={styles.chosenLabel} aria-live="polite">
          Elegido: <strong>{describeChoice(choice)}</strong>
        </span>
      </div>

      <div className={error ? `${styles.search} ${styles.invalid}` : styles.search}>
        <Search size={22} aria-hidden="true" />
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          value={search}
          placeholder="Buscar cliente por nombre"
          autoComplete="off"
          maxLength={NAME_MAX_LENGTH}
          aria-invalid={Boolean(error)}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={searchEnter}
        />
      </div>

      <div ref={resultsRef} role="group" aria-label="Resultados de clientes" className={styles.results}>
        <div className={styles.sticky}>
          <button ref={addRef} type="button" className={styles.add} onClick={startNew}>
            <Plus size={22} aria-hidden="true" />
            {nothingMatches ? `Agregar «${wanted}» como cliente nuevo` : 'Agregar cliente nuevo'}
          </button>
        </div>

        {!wanted && (
          <button
            type="button"
            data-result
            className={row(choice.kind === 'noName', isCredit)}
            aria-pressed={choice.kind === 'noName'}
            disabled={isCredit}
            onClick={() => {
              onChoose({ kind: 'noName' })
              onDone()
            }}
          >
            <span className={styles.who}>
              <span className={`${styles.name} ${styles.noName}`}>{NO_NAME}</span>
              <span className={styles.detail}>
                {isCredit ? 'No se puede fiar a un cliente sin nombre' : 'Para ventas al contado de paso'}
              </span>
            </span>
            {choice.kind === 'noName' && <Check size={24} aria-hidden="true" />}
          </button>
        )}

        {failed ? (
          <div className={styles.message}>
            <p role="alert">No se pudo cargar la lista de clientes.</p>
            <Button variant="secondary" onClick={retry}>
              Intentar de nuevo
            </Button>
          </div>
        ) : !shown ? (
          <p role="status" className={styles.message}>
            Cargando…
          </p>
        ) : nothingMatches ? (
          <p role="status" className={styles.message}>
            No se encontró ningún cliente con «{wanted}».
          </p>
        ) : (
          shown.map((customer) => {
            const chosen = choice.kind === 'existing' && choice.customer.id === customer.id

            return (
              <button
                key={customer.id}
                type="button"
                data-result
                className={row(chosen)}
                aria-pressed={chosen}
                onClick={() => {
                  onChoose({ kind: 'existing', customer: { id: customer.id, name: customer.name } })
                  onDone()
                }}
              >
                <span className={styles.who}>
                  <span className={styles.name}>{customer.name}</span>
                  <span className={styles.detail}>
                    {customer.phone || 'Sin teléfono'} ·{' '}
                    {customer.balance > 0 ? `debe ${formatColones(customer.balance)}` : 'al día'}
                  </span>
                </span>
                {chosen && <Check size={24} aria-hidden="true" />}
              </button>
            )
          })
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          <CircleAlert size={24} aria-hidden="true" />
          {error}
        </p>
      )}

      {choice.kind === 'new' && (
        <div className={styles.newPanel} role="group" aria-label="Cliente nuevo">
          <div className={styles.newTop}>
            <span className={styles.newTitle}>Cliente nuevo</span>
            <button type="button" className={styles.quiet} onClick={cancelNew}>
              Cancelar
            </button>
          </div>
          <div className={styles.newFields}>
            <TextInput
              ref={newNameRef}
              label="Nombre"
              value={choice.name}
              onChange={(name) => onChoose({ ...choice, name })}
              error={newErrors.name}
              maxLength={NAME_MAX_LENGTH}
              inputProps={{ onKeyDown: (event) => moveOn(event, () => phoneRef.current?.focus()) }}
            />
            <TextInput
              ref={phoneRef}
              label="Teléfono (opcional)"
              value={choice.phone}
              onChange={(phone) => onChoose({ ...choice, phone })}
              error={newErrors.phone}
              maxLength={PHONE_MAX_LENGTH}
              inputProps={{ inputMode: 'tel', onKeyDown: (event) => moveOn(event, onDone) }}
            />
          </div>
          <p className={styles.newNote}>Se guarda en Clientes junto con la venta.</p>
        </div>
      )}
    </div>
  )
}
