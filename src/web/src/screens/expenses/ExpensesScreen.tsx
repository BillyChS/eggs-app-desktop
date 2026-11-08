import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { DayPicker } from '../../components/DayPicker'
import { todayLocal } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { Screen } from '../../layout/Screen'
// The same list as Ventas, so both screens look and work alike.
import styles from '../sales/SalesScreen.module.css'
import { canHaveExpenses, useExpenseDay } from './useExpenseDay'
import { useExpenseList } from './useExpenseList'

export function ExpensesScreen() {
  const navigate = useNavigate()
  const { day, setDay } = useExpenseDay()
  const { list, failed, retry } = useExpenseList(day)
  const isToday = day === todayLocal()

  // What's in the date field while a date is being typed; the list stays on its day until the field holds one.
  const [typing, setTyping] = useState<string | null>(null)

  const changeDate = (next: string) => {
    if (canHaveExpenses(next)) {
      setTyping(null)
      setDay(next)
    } else {
      setTyping(next)
    }
  }

  const query = `?fecha=${day}`

  return (
    <Screen title="Gastos">
      <div className={styles.toolbar}>
        <div className={styles.controls}>
          <div className={styles.picker}>
            <DayPicker
              value={typing ?? day}
              writtenDay={day}
              onChange={changeDate}
              onDateBlur={() => setTyping(null)}
            />
          </div>
          <Button onClick={() => navigate(`/gastos/nuevo${query}`)}>
            <span className={styles.buttonContent}>
              <Plus size={28} aria-hidden="true" />
              Nuevo gasto
            </span>
          </Button>
        </div>
        {list && (
          <div className={styles.totals}>
            <p className={styles.total}>
              <span>{isToday ? 'Gastado hoy' : 'Gastado'}</span>
              <strong>{formatColones(list.total)}</strong>
            </p>
          </div>
        )}
      </div>

      {failed ? (
        <div className={styles.message}>
          <p role="alert">No se pudieron cargar los gastos.</p>
          <Button onClick={retry}>Intentar de nuevo</Button>
        </div>
      ) : !list ? (
        <p role="status" className={styles.message}>
          Cargando…
        </p>
      ) : list.expenses.length > 0 ? (
        <ul className={styles.list} aria-label="Gastos del día">
          {list.expenses.map((expense) => (
            <li key={expense.id}>
              <button
                type="button"
                className={styles.row}
                onClick={() => navigate(`/gastos/${expense.id}/editar${query}`)}
              >
                <span className={styles.summary}>
                  <strong>{expense.category.name}</strong>
                  {expense.note && ` · ${expense.note}`}
                </span>
                <span className={styles.rowEnd}>
                  <strong className={styles.rowTotal}>{formatColones(expense.amount)}</strong>
                  <ChevronRight size={36} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.message}>
          <p role="status">{isToday ? 'Todavía no hay gastos hoy.' : 'No hay gastos este día.'}</p>
        </div>
      )}
    </Screen>
  )
}
