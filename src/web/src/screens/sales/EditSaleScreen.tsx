import { Navigate, useParams, useSearchParams } from 'react-router'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { getSale } from '../../services/sales'
import centered from '../CenteredMessage.module.css'
import { statementOf } from '../customers/customerText'
import { SaleForm } from './SaleForm'
import { listOfDay, useSaleDay } from './useSaleDay'

export function EditSaleScreen() {
  const { id = '' } = useParams()
  const { day } = useSaleDay()
  const [params] = useSearchParams()
  const { load, retry } = useLoad(id, (signal) => getSale(id, signal), 'Esta venta ya no existe.')

  // Opened from a customer's account ("?cliente="), it goes back there; otherwise to the day of the sale.
  const fromCustomer = params.get('cliente')
  const returnTo = fromCustomer
    ? statementOf(fromCustomer)
    : listOfDay(load.state === 'ready' ? load.value.date : day)

  if (load.state === 'gone') {
    return <Navigate to={returnTo} replace />
  }

  return (
    <Screen title="Editar venta" backTo={returnTo}>
      {load.state !== 'ready' ? (
        <LoadProblem state={load.state} failedMessage="No se pudo abrir esta venta." onRetry={retry} />
      ) : load.value.isCredit && load.value.customer?.isDeleted ? (
        // A cash sale moves no balance, so it stays editable even after its buyer was deleted.
        <div className={centered.center}>
          <p role="status" className={centered.text}>
            Venta fiada de {formatColones(load.value.total)}, {formatDateLong(load.value.date)}.
          </p>
          <p className={centered.detail}>
            Es de {load.value.customer.name}, un cliente que se borró, así que ya no se puede cambiar.
          </p>
        </div>
      ) : (
        <SaleForm
          sale={load.value}
          startDay={load.value.date}
          returnTo={fromCustomer ? returnTo : undefined}
        />
      )}
    </Screen>
  )
}
