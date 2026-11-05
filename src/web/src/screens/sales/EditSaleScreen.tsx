import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { Button } from '../../components/Button'
import { useMessages } from '../../components/messages'
import { Screen } from '../../layout/Screen'
import { hasStatus } from '../../services/http'
import { getSale, type Sale } from '../../services/sales'
import centered from '../CenteredMessage.module.css'
import { SaleForm } from './SaleForm'
import { listOfDay, useSaleDay } from './useSaleDay'

type Load = { state: 'loading' } | { state: 'failed' } | { state: 'gone' } | { state: 'ready'; sale: Sale }

export function EditSaleScreen() {
  const { id = '' } = useParams()
  const { day } = useSaleDay()
  const { showError } = useMessages()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getSale(id, controller.signal)
      .then((sale) => {
        if (!controller.signal.aborted) {
          setLoad({ state: 'ready', sale })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        if (hasStatus(error, 404)) {
          showError('Esta venta ya no existe.')
          setLoad({ state: 'gone' })
        } else {
          setLoad({ state: 'failed' })
        }
      })

    return () => controller.abort()
  }, [id, attempt, showError])

  if (load.state === 'gone') {
    return <Navigate to={listOfDay(day)} replace />
  }

  return (
    <Screen title="Editar venta" backTo={listOfDay(load.state === 'ready' ? load.sale.date : day)}>
      {load.state === 'ready' ? (
        <SaleForm sale={load.sale} startDay={load.sale.date} />
      ) : load.state === 'failed' ? (
        <div className={centered.center}>
          <p role="alert" className={centered.text}>
            No se pudo abrir esta venta.
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
