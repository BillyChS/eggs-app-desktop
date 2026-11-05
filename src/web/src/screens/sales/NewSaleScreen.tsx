import { Screen } from '../../layout/Screen'
import { SaleForm } from './SaleForm'
import { listOfDay, useSaleDay } from './useSaleDay'

export function NewSaleScreen() {
  const { day } = useSaleDay()

  return (
    <Screen title="Nueva venta" backTo={listOfDay(day)}>
      <SaleForm startDay={day} />
    </Screen>
  )
}
