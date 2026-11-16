import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useMessages } from '../../components/messages'
import { Screen } from '../../layout/Screen'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { formatDateLong } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { deleteExpense, type Expense, type ExpenseList } from '../../services/expenses'
import { hasStatus } from '../../services/http'
import { PeriodBar } from '../PeriodBar'
import { dayInPeriod, periodWord } from '../periodView'
// The same cards and table as Ventas, so both pages look and work alike.
import sales from '../sales/SalesScreen.module.css'
import { describePeriod, rangeOf, type Period } from '../summaries/periods'
import { deleteQuestion, kindOf, noteOf, plural, topCategories } from './expenseText'
import styles from './ExpensesScreen.module.css'
import { expensesQuery, useExpensesPeriod } from './expensesView'
import { useExpenseList } from './useExpenseList'

function subtitleOf(period: Period): string {
  switch (period.kind) {
    case 'month':
      return `Todos los gastos de ${describePeriod(period)}`
    case 'week':
      return `Todos los gastos del ${describePeriod(period)}`
    default:
      return formatDateLong(period.start) ?? period.start
  }
}

function Cards({ list, period }: { list: ExpenseList; period: Period }) {
  const lines = topCategories(list.byCategory)

  return (
    <section aria-label="Totales del período" className={styles.cards}>
      <div className={sales.card}>
        <span className={sales.cardLabel}>Gastado {periodWord(period)}</span>
        <strong className={sales.cardNumber}>{formatColones(list.total)}</strong>
        <span className={sales.cardDetail}>{plural(list.expenses.length, 'gasto', 'gastos')}</span>
      </div>
      <div className={sales.card}>
        <span className={sales.cardLabel}>En qué se gastó</span>
        {lines.length > 0 ? (
          <ul className={styles.categories} aria-label="En qué se gastó">
            {lines.map((line) => (
              <li key={line.name}>
                <span>{line.name}</span>
                <strong>{formatColones(line.total)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <span className={styles.nothing}>Nada todavía.</span>
        )}
      </div>
    </section>
  )
}

/** Gastos: what was spent in a day, week or month, with its total, what it went to, and each expense. */
export function ExpensesScreen() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()
  const { run: oneAtATime } = useOneAtATime()
  const { period, setPeriod } = useExpensesPeriod()
  const { from, to } = rangeOf(period)
  const { list, failed, reload } = useExpenseList(from, to)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  // A week or a month: its rows say their day.
  const isRange = period.kind !== 'day'
  const query = expensesQuery(period)
  const newExpense = () => navigate(`/gastos/nuevo${query}`)

  const newButton = (
    <Button onClick={newExpense}>
      <span className={sales.buttonContent}>
        <Plus size={24} aria-hidden="true" />
        Nuevo gasto
      </span>
    </Button>
  )

  const confirmDelete = (expense: Expense) =>
    void oneAtATime(async () => {
      setDeleting(null)

      try {
        await deleteExpense(expense.id)
        showSuccess('Gasto borrado.')
      } catch (error) {
        showError(hasStatus(error, 404) ? 'Este gasto ya no existe.' : 'No se pudo borrar el gasto. Intente de nuevo.')
      }

      reload()
    })

  return (
    <Screen title="Gastos" subtitle={subtitleOf(period)} actions={newButton}>
      <div className={sales.page}>
        <PeriodBar period={period} onChange={setPeriod} />

        {failed ? (
          <div className={sales.message}>
            <p role="alert">No se pudieron cargar los gastos.</p>
            <Button onClick={reload}>Intentar de nuevo</Button>
          </div>
        ) : !list ? (
          <p role="status" className={sales.message}>
            Cargando…
          </p>
        ) : (
          <>
            <Cards list={list} period={period} />

            {list.expenses.length === 0 ? (
              <section aria-label="Lista de gastos" className={`${sales.list} ${styles.empty}`}>
                <p role="status">No hay gastos registrados {periodWord(period)}.</p>
                {newButton}
              </section>
            ) : (
              <section aria-label="Lista de gastos" className={sales.list}>
                <div className={sales.tableScroll}>
                  <table className={sales.table}>
                    <thead>
                      <tr>
                        {isRange && <th scope="col">Fecha</th>}
                        <th scope="col">Tipo</th>
                        <th scope="col">Nota</th>
                        <th scope="col" className={sales.number}>
                          Monto
                        </th>
                        <th scope="col" className={sales.actionsHead}>
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.expenses.map((expense) => {
                        const kind = kindOf(expense)

                        return (
                          <tr key={expense.id}>
                            {isRange && <td className={sales.date}>{dayInPeriod(expense.date)}</td>}
                            <td>
                              <span className={sales.name}>{kind}</span>
                              {kind !== expense.category.name && (
                                <span className={sales.detail}>{expense.category.name}</span>
                              )}
                            </td>
                            <td className={sales.note}>{noteOf(expense) ?? ''}</td>
                            <td className={`${sales.number} ${sales.amount}`}>{formatColones(expense.amount)}</td>
                            <td>
                              <div className={sales.actions}>
                                <button
                                  type="button"
                                  className={sales.edit}
                                  aria-label={`Editar el gasto de ${kind}`}
                                  onClick={() => navigate(`/gastos/${expense.id}/editar${query}`)}
                                >
                                  <Pencil size={20} aria-hidden="true" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className={sales.remove}
                                  aria-label={`Eliminar el gasto de ${kind}`}
                                  onClick={() => setDeleting(expense)}
                                >
                                  <Trash2 size={20} aria-hidden="true" />
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className={sales.footer}>
                  <span>{plural(list.expenses.length, 'gasto', 'gastos')}</span>
                  <strong>Total {formatColones(list.total)}</strong>
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          danger
          title="¿Borrar este gasto?"
          message={deleteQuestion(deleting)}
          confirmLabel="Sí, borrar"
          onCancel={() => setDeleting(null)}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </Screen>
  )
}
