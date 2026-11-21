import { useSearchParams } from 'react-router'
import { SaleForm } from './SaleForm'
import { startDayOf } from '../periodView'
import { readView, viewAddress, viewAfterSave } from './salesView'

/** Opened from Ventas, whose view is in the address, so Cancelar goes back to it and saving shows the sale in it. */
export function NewSaleScreen() {
  const [params] = useSearchParams()
  const view = readView(params)

  return (
    <SaleForm
      startDay={startDayOf(view.period)}
      closeTo={viewAddress(view)}
      afterSave={(saved) => viewAfterSave(view, saved.date, saved.isCredit)}
      afterDelete={viewAddress(view)}
    />
  )
}
