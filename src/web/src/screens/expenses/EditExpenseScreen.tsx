import { Navigate, useParams } from 'react-router'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { getExpense, listExpenseCategories } from '../../services/expenses'
import { ExpenseForm } from './ExpenseForm'
import { listOfExpenseDay, useExpenseDay } from './useExpenseDay'

export function EditExpenseScreen() {
  const { id = '' } = useParams()
  const { day } = useExpenseDay()
  const { load, retry } = useLoad(
    id,
    async (signal) => {
      const [expense, categories] = await Promise.all([getExpense(id, signal), listExpenseCategories(signal)])
      return { expense, categories }
    },
    'Este gasto ya no existe.',
  )

  const returnTo = listOfExpenseDay(load.state === 'ready' ? load.value.expense.date : day)

  if (load.state === 'gone') {
    return <Navigate to={returnTo} replace />
  }

  return (
    <Screen title="Editar gasto" backTo={returnTo}>
      {load.state === 'ready' ? (
        <ExpenseForm categories={load.value.categories} expense={load.value.expense} startDay={load.value.expense.date} />
      ) : (
        <LoadProblem state={load.state} failedMessage="No se pudo abrir este gasto." onRetry={retry} />
      )}
    </Screen>
  )
}
