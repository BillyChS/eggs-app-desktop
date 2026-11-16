import { Navigate, useParams, useSearchParams } from 'react-router'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { getExpense, listExpenseCategories } from '../../services/expenses'
import { hasListPeriod, periodAfterSave, readListPeriod } from '../periodView'
import type { Period } from '../summaries/periods'
import { ExpenseForm } from './ExpenseForm'
import { expensesAddress } from './expensesView'

export function EditExpenseScreen() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { load, retry } = useLoad(
    id,
    async (signal) => {
      const [expense, categories] = await Promise.all([getExpense(id, signal), listExpenseCategories(signal)])
      return { expense, categories }
    },
    'Este gasto ya no existe.',
  )

  const ready = load.state === 'ready' ? load.value : null
  // Opened from Gastos, back to the period it was opened from; from anywhere else, to the day of the expense.
  const period: Period =
    hasListPeriod(params) || !ready ? readListPeriod(params) : { kind: 'day', start: ready.expense.date }
  const closeTo = expensesAddress(period)

  if (load.state === 'gone') {
    return <Navigate to={closeTo} replace />
  }

  if (!ready) {
    return (
      <Screen title="Editar gasto" backTo={closeTo}>
        <LoadProblem
          state={load.state === 'failed' ? 'failed' : 'loading'}
          failedMessage="No se pudo abrir este gasto."
          onRetry={retry}
        />
      </Screen>
    )
  }

  return (
    <ExpenseForm
      categories={ready.categories}
      expense={ready.expense}
      startDay={ready.expense.date}
      closeTo={closeTo}
      afterSave={(saved) => expensesAddress(periodAfterSave(period, saved.date))}
      afterDelete={closeTo}
    />
  )
}
