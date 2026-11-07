import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { listExpenseCategories } from '../../services/expenses'
import { ExpenseForm } from './ExpenseForm'
import { listOfExpenseDay, useExpenseDay } from './useExpenseDay'

export function NewExpenseScreen() {
  const { day } = useExpenseDay()
  const { load, retry } = useLoad('categories', listExpenseCategories, 'No se encontraron las categorías.')

  return (
    <Screen title="Nuevo gasto" backTo={listOfExpenseDay(day)}>
      {load.state === 'ready' ? (
        <ExpenseForm categories={load.value} startDay={day} />
      ) : (
        <LoadProblem
          state={load.state === 'loading' ? 'loading' : 'failed'}
          failedMessage="No se pudo abrir el formulario de gastos."
          onRetry={retry}
        />
      )}
    </Screen>
  )
}
