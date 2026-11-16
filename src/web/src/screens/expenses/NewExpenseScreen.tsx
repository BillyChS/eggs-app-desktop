import { useSearchParams } from 'react-router'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { listExpenseCategories } from '../../services/expenses'
import { periodAfterSave, readListPeriod, startDayOf } from '../periodView'
import { ExpenseForm } from './ExpenseForm'
import { expensesAddress } from './expensesView'

/** Opened from Gastos, whose period is in the address, so Cancelar goes back to it and saving shows the expense. */
export function NewExpenseScreen() {
  const [params] = useSearchParams()
  const period = readListPeriod(params)
  const closeTo = expensesAddress(period)
  const { load, retry } = useLoad('categories', listExpenseCategories, 'No se encontraron las categorías.')

  if (load.state !== 'ready') {
    return (
      <Screen title="Nuevo gasto" backTo={closeTo}>
        <LoadProblem
          state={load.state === 'loading' ? 'loading' : 'failed'}
          failedMessage="No se pudo abrir el formulario de gastos."
          onRetry={retry}
        />
      </Screen>
    )
  }

  return (
    <ExpenseForm
      categories={load.value}
      startDay={startDayOf(period)}
      closeTo={closeTo}
      afterSave={(saved) => expensesAddress(periodAfterSave(period, saved.date))}
      afterDelete={closeTo}
    />
  )
}
