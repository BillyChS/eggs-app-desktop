import { Plus } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useMessages } from '../../components/messages'
import { TextInput } from '../../components/TextInput'
import modal from '../../components/Modal.module.css'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { createCustomer, findSimilarCustomers, type CustomerSummary } from '../../services/customers'
import { hasStatus } from '../../services/http'
import { describeBalance, describeSimilar } from '../customers/customerText'
import { useCustomerList } from '../customers/useCustomerList'
import styles from './CustomerPicker.module.css'

// Must match Customer.cs. The API checks it too.
const NAME_MAX_LENGTH = 100

export interface PickedCustomer {
  id: string
  name: string
}

interface Props {
  /** The question it answers: who a credit sale goes to, or who bought a cash sale. */
  title: string
  onPick: (customer: PickedCustomer) => void
  onCancel: () => void
}

/**
 * Who a sale goes to: the same search as Clientes, and a way to add someone new by name, because leaving the sale to
 * go create them would lose it.
 */
export function CustomerPicker({ title, onPick, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const { showError } = useMessages()
  const { run: oneAtATime } = useOneAtATime()

  const [text, setText] = useState('')
  const [nameError, setNameError] = useState<string>()
  const [similar, setSimilar] = useState<CustomerSummary[] | null>(null)
  const search = text.trim()
  const newName = search.replace(/\s+/g, ' ')
  const { result, failed, retry } = useCustomerList(search)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (!dialog.open) {
      dialog.showModal()
    }
    searchRef.current?.focus()

    return () => dialog.close()
  }, [])

  // Enter moves on to the first name, rather than picking one that might not be the person meant.
  const moveOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      ;(listRef.current?.querySelector('button') ?? addRef.current)?.focus()
    }
  }

  const create = async () => {
    try {
      const customer = await createCustomer({ name: newName, phone: '', notes: '' })
      onPick({ id: customer.id, name: customer.name })
    } catch (error) {
      if (hasStatus(error, 400) && error.fieldErrors.name) {
        setNameError(error.fieldErrors.name)
        searchRef.current?.focus()
      } else {
        showError('No se pudo agregar el cliente. Intente de nuevo.')
      }
    }
  }

  const add = () =>
    void oneAtATime(async () => {
      // The warning only helps; if it can't be checked, that's no reason not to add them.
      const found = await findSimilarCustomers(newName).catch(() => [])

      if (found.length > 0) {
        setSimilar(found)
      } else {
        await create()
      }
    })

  return (
    <dialog
      ref={dialogRef}
      className={`${modal.dialog} ${styles.picker}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // The parent decides when it closes, so its state and the dialog can't disagree.
        event.preventDefault()
        onCancel()
      }}
    >
      <h2 id={titleId} className={modal.title}>
        {title}
      </h2>

      <TextInput
        ref={searchRef}
        label="Buscar por nombre"
        value={text}
        onChange={(next) => {
          setText(next)
          setNameError(undefined)
        }}
        error={nameError}
        maxLength={NAME_MAX_LENGTH}
        inputProps={{ onKeyDown: moveOnEnter }}
      />

      <div className={styles.results}>
        {failed ? (
          <div className={styles.message}>
            <p role="alert">No se pudo cargar la lista de clientes.</p>
            <Button variant="secondary" onClick={retry}>
              Intentar de nuevo
            </Button>
          </div>
        ) : !result ? (
          <p role="status" className={styles.message}>
            Cargando…
          </p>
        ) : result.customers.length > 0 ? (
          <ul ref={listRef} className={styles.list} aria-label="Clientes">
            {result.customers.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => onPick({ id: customer.id, name: customer.name })}
                >
                  <span className={styles.name}>{customer.name}</span>
                  <span className={styles.balance}>{describeBalance(customer.balance).toLowerCase()}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className={styles.message}>
            {result.search ? `No hay ningún cliente con “${result.search}”.` : 'Todavía no hay clientes.'}
          </p>
        )}
      </div>

      <div className={styles.buttons}>
        {newName ? (
          <Button ref={addRef} variant="secondary" className={styles.add} onClick={add}>
            <span className={styles.buttonContent}>
              <Plus size={28} aria-hidden="true" />
              <span className={styles.addText}>Agregar “{newName}” como cliente nuevo</span>
            </span>
          </Button>
        ) : (
          <span />
        )}
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

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
            void oneAtATime(create)
          }}
        />
      )}
    </dialog>
  )
}
