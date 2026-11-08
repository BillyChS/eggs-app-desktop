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
import { listOfDay, readView, viewAddress, viewAfterSave } from './salesView'

export function EditSaleScreen() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { load, retry } = useLoad(id, (signal) => getSale(id, signal), 'Esta venta ya no existe.')

  // Opened from a customer's account ("?cliente="), it goes back there. Opened from Ventas, back to the view it was
  // opened from; from anywhere else, to the day of the sale.
  const fromCustomer = params.get('cliente')
  const hasView = params.has('fecha') || params.has('mes')
  const view = readView(params)
  const sale = load.state === 'ready' ? load.value : null

  const closeTo = fromCustomer
    ? statementOf(fromCustomer)
    : hasView || !sale
      ? viewAddress(view)
      : listOfDay(sale.date, sale.isCredit ? 'fiado' : 'contado')

  if (load.state === 'gone') {
    return <Navigate to={closeTo} replace />
  }

  if (!sale || (sale.isCredit && sale.customer?.isDeleted)) {
    return (
      <Screen title="Editar venta" backTo={closeTo}>
        {!sale ? (
          <LoadProblem
            state={load.state === 'failed' ? 'failed' : 'loading'}
            failedMessage="No se pudo abrir esta venta."
            onRetry={retry}
          />
        ) : (
          // A cash sale moves no balance, so it stays editable even after its buyer was deleted.
          <div className={centered.center}>
            <p role="status" className={centered.text}>
              Venta fiada de {formatColones(sale.total)}, {formatDateLong(sale.date)}.
            </p>
            <p className={centered.detail}>
              Es de {sale.customer!.name}, un cliente que se borró, así que ya no se puede cambiar.
            </p>
          </div>
        )}
      </Screen>
    )
  }

  return (
    <SaleForm
      sale={sale}
      startDay={sale.date}
      closeTo={closeTo}
      afterSave={(saved) =>
        fromCustomer ? closeTo : viewAfterSave(hasView ? view : { ...view, period: { kind: 'day', start: sale.date } }, saved.date, saved.isCredit)
      }
      afterDelete={closeTo}
    />
  )
}
