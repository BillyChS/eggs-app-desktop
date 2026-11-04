import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useMessages } from '../../components/messages'
import { TextArea } from '../../components/TextArea'
import { TextInput } from '../../components/TextInput'
import { useUnsavedChanges } from '../../layout/useUnsavedChanges'
import {
  createCustomer,
  deleteCustomer,
  findSimilarCustomers,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type CustomerSummary,
} from '../../services/customers'
import { ApiError, hasStatus } from '../../services/http'
import styles from './CustomerForm.module.css'

const LIST = '/clientes'

// Must match the limits in Customer.cs. The API checks them too.
const NAME_MAX_LENGTH = 100
const PHONE_MAX_LENGTH = 30
const NOTES_MAX_LENGTH = 500

const GONE_MESSAGE = 'Este cliente ya no existe.'

type FieldErrors = Partial<Record<keyof CustomerInput, string>>

/** The values as they'd be saved, so that adding a stray space doesn't count as a change. */
function clean({ name, phone, notes }: CustomerInput): CustomerInput {
  return { name: name.trim().replace(/\s+/g, ' '), phone: phone.trim(), notes: notes.trim() }
}

function isSame(a: CustomerInput, b: CustomerInput) {
  return a.name === b.name && a.phone === b.phone && a.notes === b.notes
}

function describe(customers: CustomerSummary[]) {
  return customers.map(({ name, phone }) => (phone ? `${name} (${phone})` : name)).join(', ')
}

interface Props {
  /** The customer being edited. Without one, the form creates a new customer. */
  customer?: Customer
}

export function CustomerForm({ customer }: Props) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()
  const [saved] = useState<CustomerInput>(() =>
    clean({ name: customer?.name ?? '', phone: customer?.phone ?? '', notes: customer?.notes ?? '' }),
  )
  const [values, setValues] = useState(saved)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [similar, setSimilar] = useState<CustomerSummary[] | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  // The API can answer before the screen has changed, and a double click's second click would then save a copy.
  const finished = useRef(false)

  const cleaned = clean(values)
  const guard = useUnsavedChanges(!isSame(cleaned, saved))

  const isNew = !customer

  useEffect(() => {
    if (isNew) {
      nameRef.current?.focus()
    }
  }, [isNew])

  const change = (field: keyof CustomerInput) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  // Ignores a second click while the first is working. The buttons stay enabled: disabling the focused button would
  // lose keyboard focus, and the local API answers too fast for a disabled look to mean anything.
  const oneAtATime = async (work: () => Promise<void>) => {
    if (busy.current || finished.current) {
      return
    }

    busy.current = true

    try {
      await work()
    } finally {
      busy.current = false
    }
  }

  const backToList = () => {
    finished.current = true
    guard.allowLeaving()
    navigate(LIST)
  }

  const handleGone = () => {
    showError(GONE_MESSAGE)
    backToList()
  }

  const save = async () => {
    try {
      await (customer ? updateCustomer(customer.id, cleaned) : createCustomer(cleaned))
      showSuccess('Cliente guardado.')
      backToList()
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone()
      } else if (hasStatus(error, 400) && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors)
      } else {
        showError('No se pudo guardar el cliente. Intente de nuevo.')
      }
    }
  }

  // The warning only helps; if it can't be checked, that's no reason to lose the save.
  const findSimilar = async () => {
    try {
      return await findSimilarCustomers(cleaned.name, customer?.id)
    } catch {
      return []
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()

    if (!cleaned.name) {
      setErrors({ name: 'Escriba el nombre del cliente.' })
      nameRef.current?.focus()
      return
    }

    void oneAtATime(async () => {
      // A name that didn't change was already accepted.
      if (cleaned.name !== saved.name) {
        const found = await findSimilar()

        if (found.length > 0) {
          setSimilar(found)
          return
        }
      }

      await save()
    })
  }

  const remove = async () => {
    try {
      await deleteCustomer(customer!.id)
      showSuccess('Cliente borrado.')
      backToList()
    } catch (error) {
      if (hasStatus(error, 404)) {
        handleGone()
      } else if (error instanceof ApiError && error.refusal) {
        showError(error.refusal)
      } else {
        showError('No se pudo borrar el cliente. Intente de nuevo.')
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <div className={styles.column}>
          <TextInput
            ref={nameRef}
            label="Nombre"
            value={values.name}
            onChange={change('name')}
            error={errors.name}
            maxLength={NAME_MAX_LENGTH}
          />
          <TextInput
            label="Teléfono (opcional)"
            value={values.phone}
            onChange={change('phone')}
            error={errors.phone}
            maxLength={PHONE_MAX_LENGTH}
          />
        </div>
        <TextArea
          label="Notas (opcional)"
          value={values.notes}
          onChange={change('notes')}
          error={errors.notes}
          maxLength={NOTES_MAX_LENGTH}
        />
      </div>

      <div className={styles.buttons}>
        <Button type="submit">Guardar</Button>
        {customer && (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
            Borrar cliente
          </Button>
        )}
      </div>

      {similar && (
        <ConfirmDialog
          title="Ya existe un cliente parecido"
          message={`${describe(similar)}. ¿Es otra persona?`}
          cancelLabel="No, revisar"
          confirmLabel="Sí, es otra persona"
          onCancel={() => setSimilar(null)}
          onConfirm={() => {
            setSimilar(null)
            void oneAtATime(save)
          }}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          danger
          title="¿Borrar este cliente?"
          message={`¿Borrar a ${customer!.name}? Ya no aparecerá en la lista.`}
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
    </form>
  )
}
