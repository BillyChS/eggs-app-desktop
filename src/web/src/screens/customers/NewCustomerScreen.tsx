import { Screen } from '../../layout/Screen'
import { CustomerForm } from './CustomerForm'

export function NewCustomerScreen() {
  return (
    <Screen title="Nuevo cliente" backTo="/clientes">
      <CustomerForm />
    </Screen>
  )
}
