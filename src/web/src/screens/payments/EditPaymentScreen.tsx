import { Navigate, useParams } from 'react-router'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { getCustomer } from '../../services/customers'
import { getPayment } from '../../services/payments'
import centered from '../CenteredMessage.module.css'
import { PaymentForm } from './PaymentForm'
import { useReturnTo } from './useReturnTo'

export function EditPaymentScreen() {
  const { id = '', paymentId = '' } = useParams()
  const returnTo = useReturnTo(id)

  const { load, retry } = useLoad(
    paymentId,
    async (signal) => {
      const payment = await getPayment(paymentId, signal)

      // A deleted customer can't be opened, and their abonos can't change anyway.
      return {
        payment,
        customer: payment.customer.isDeleted ? null : await getCustomer(payment.customer.id, signal),
      }
    },
    'Este abono ya no existe.',
  )

  if (load.state === 'gone') {
    return <Navigate to={returnTo} replace />
  }

  return (
    <Screen
      title={load.state === 'ready' ? `Editar abono de ${load.value.payment.customer.name}` : 'Editar abono'}
      backTo={returnTo}
    >
      {load.state !== 'ready' ? (
        <LoadProblem state={load.state} failedMessage="No se pudo abrir este abono." onRetry={retry} />
      ) : load.value.customer ? (
        <PaymentForm
          customer={load.value.customer}
          payment={load.value.payment}
          startDay={load.value.payment.date}
          returnTo={returnTo}
        />
      ) : (
        <div className={centered.center}>
          <p role="status" className={centered.text}>
            Abono de {formatColones(load.value.payment.amount)} del {formatDateLong(load.value.payment.date)}.
          </p>
          <p className={centered.detail}>
            Es de {load.value.payment.customer.name}, un cliente que se borró, así que ya no se puede cambiar.
          </p>
        </div>
      )}
    </Screen>
  )
}
