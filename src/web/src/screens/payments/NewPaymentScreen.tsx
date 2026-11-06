import { Navigate, useParams } from 'react-router'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { todayLocal } from '../../lib/dates'
import { getCustomer } from '../../services/customers'
import centered from '../CenteredMessage.module.css'
import { PaymentForm } from './PaymentForm'
import { useReturnTo } from './useReturnTo'

export function NewPaymentScreen() {
  const { id = '' } = useParams()
  const returnTo = useReturnTo(id)
  const { load, retry } = useLoad(id, (signal) => getCustomer(id, signal), 'Este cliente ya no existe.')

  if (load.state === 'gone') {
    return <Navigate to="/clientes" replace />
  }

  return (
    <Screen title={load.state === 'ready' ? `Abono de ${load.value.name}` : 'Anotar abono'} backTo={returnTo}>
      {load.state !== 'ready' ? (
        <LoadProblem state={load.state} failedMessage="No se pudo abrir este cliente." onRetry={retry} />
      ) : load.value.balance > 0 ? (
        <PaymentForm customer={load.value} startDay={todayLocal()} returnTo={returnTo} />
      ) : (
        <div className={centered.center}>
          <p role="status" className={centered.text}>
            {load.value.name} está al día: no debe nada.
          </p>
        </div>
      )}
    </Screen>
  )
}
