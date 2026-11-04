import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { Button } from '../../components/Button'
import { useMessages } from '../../components/messages'
import { Screen } from '../../layout/Screen'
import { getCustomer, type Customer } from '../../services/customers'
import { hasStatus } from '../../services/http'
import centered from '../CenteredMessage.module.css'
import { CustomerForm } from './CustomerForm'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'gone' } | { state: 'ready'; customer: Customer }

export function EditCustomerScreen() {
  const { id = '' } = useParams()
  const { showError } = useMessages()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getCustomer(id, controller.signal)
      .then((customer) => {
        if (!controller.signal.aborted) {
          setLoad({ state: 'ready', customer })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        if (hasStatus(error, 404)) {
          showError('Este cliente ya no existe.')
          setLoad({ state: 'gone' })
        } else {
          setLoad({ state: 'failed' })
        }
      })

    return () => controller.abort()
  }, [id, attempt, showError])

  if (load.state === 'gone') {
    return <Navigate to="/clientes" replace />
  }

  return (
    <Screen title="Editar cliente" backTo="/clientes">
      {load.state === 'ready' ? (
        <CustomerForm customer={load.customer} />
      ) : load.state === 'failed' ? (
        <div className={centered.center}>
          <p role="alert" className={centered.text}>
            No se pudo abrir este cliente.
          </p>
          <Button
            onClick={() => {
              setLoad({ state: 'loading' })
              setAttempt((current) => current + 1)
            }}
          >
            Intentar de nuevo
          </Button>
        </div>
      ) : (
        <p role="status" className={centered.center}>
          Cargando…
        </p>
      )}
    </Screen>
  )
}
