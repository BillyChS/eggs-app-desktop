import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
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
import { dayInPeriod, periodAfterSave, periodWord, startDayOf } from '../periodView'
// The same cards and table as Ventas, so both pages look and work alike.
import sales from '../sales/SalesScreen.module.css'
import { foldText } from '../sales/salesSearch'
import { describePeriod, rangeOf, type Period } from '../summaries/periods'
import { ExpenseDialog } from './ExpenseDialog'
import { byTypeOrder, deleteQuestion, kindOf, noteOf, plural } from './expenseText'
import styles from './ExpensesScreen.module.css'
import { useExpensesPeriod } from './expensesView'
import { ExpenseTypesDialog } from './ExpenseTypesDialog'
import { TypeFilter, type TypeOption } from './TypeFilter'
import { useExpenseList } from './useExpenseList'

const GONE_MESSAGE = 'Este gasto ya no existe.'

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

/** Whether "Buscar gasto" finds it: in what it was, its type or its note, ignoring case and accents. */
const matches = (expense: Expense, wanted: string) =>
  !wanted || [kindOf(expense), expense.category.name, expense.note ?? ''].some((text) => foldText(text).includes(wanted))

/** The period's types, with how many expenses each, plus any still ticked from another period. */
function typeOptions(expenses: Expense[], ticked: TypeOption[]): TypeOption[] {
  const found = new Map<string, TypeOption & { needsDescription: boolean }>()

  for (const { category } of expenses) {
    const seen = found.get(category.id)
    found.set(category.id, {
      id: category.id,
      name: category.name,
      needsDescription: category.needsDescription,
      count: (seen?.count ?? 0) + 1,
    })
  }

  for (const option of ticked) {
    if (!found.has(option.id)) {
      found.set(option.id, { ...option, count: 0, needsDescription: false })
    }
  }

  return [...found.values()].sort(byTypeOrder)
}

/** The popup open over the page: an expense to add or edit, or "Tipos de gasto". */
type Open = { kind: 'expense'; expense?: Expense } | { kind: 'types' } | null

/**
 * Gastos: what was spent in a day, week or month, with its total and each expense, searched by "Buscar gasto" and
 * filtered by type. Nuevo gasto and Editar open the expense in a popup over the page.
 */
export function ExpensesScreen() {
  const { showSuccess, showError } = useMessages()
  const { run: oneAtATime } = useOneAtATime()
  const { period, setPeriod } = useExpensesPeriod()
  const { from, to } = rangeOf(period)
  const { list, failed, reload } = useExpenseList(from, to)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [open, setOpen] = useState<Open>(null)
  // Both stay as the period changes, as Ventas' search does: the button and the footer say they're on.
  const [search, setSearch] = useState('')
  const [ticked, setTicked] = useState<TypeOption[]>([])

  // A week or a month: its rows say their day.
  const isRange = period.kind !== 'day'

  const newButton = (
    <Button onClick={() => setOpen({ kind: 'expense' })}>
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
        showError(hasStatus(error, 404) ? GONE_MESSAGE : 'No se pudo borrar el gasto. Intente de nuevo.')
      }

      reload()
    })

  /** Listo saved it: the list shows it, on its own day if it isn't in this week or month. */
  const saved = (expense: Expense) => {
    setOpen(null)
    const next = periodAfterSave(period, expense.date)

    if (next.kind === period.kind && next.start === period.start) {
      reload()
    } else {
      setPeriod(next)
    }
  }

  const removed = ({ gone }: { gone: boolean }) => {
    setOpen(null)
    if (gone) {
      showError(GONE_MESSAGE)
    } else {
      showSuccess('Gasto borrado.')
    }
    reload()
  }

  const clearFilters = () => {
    setSearch('')
    setTicked([])
  }

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
          <Expenses
            list={list}
            period={period}
            isRange={isRange}
            search={search}
            onSearch={setSearch}
            ticked={ticked}
            onTick={setTicked}
            onClearFilters={clearFilters}
            newButton={newButton}
            onTypes={() => setOpen({ kind: 'types' })}
            onEdit={(expense) => setOpen({ kind: 'expense', expense })}
            onDelete={setDeleting}
          />
        )}
      </div>

      {open?.kind === 'expense' && (
        <ExpenseDialog
          key={open.expense?.id ?? 'new'}
          expense={open.expense}
          startDay={startDayOf(period)}
          onClose={() => setOpen(null)}
          onSaved={saved}
          onDeleted={removed}
        />
      )}

      {open?.kind === 'types' && <ExpenseTypesDialog onClose={() => setOpen(null)} />}

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

interface ExpensesProps {
  list: ExpenseList
  period: Period
  isRange: boolean
  search: string
  onSearch: (search: string) => void
  ticked: TypeOption[]
  onTick: (ticked: TypeOption[]) => void
  onClearFilters: () => void
  newButton: ReactNode
  onTypes: () => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

/** The card, the toolbar, and the table of what the search and the filter leave. */
function Expenses({
  list,
  period,
  isRange,
  search,
  onSearch,
  ticked,
  onTick,
  onClearFilters,
  newButton,
  onTypes,
  onEdit,
  onDelete,
}: ExpensesProps) {
  const wanted = foldText(search)
  const tickedIds = new Set(ticked.map((option) => option.id))
  const options = typeOptions(list.expenses, ticked)
  const filtering = wanted !== '' || ticked.length > 0
  const shown = list.expenses.filter(
    (expense) => (tickedIds.size === 0 || tickedIds.has(expense.category.id)) && matches(expense, wanted),
  )
  const shownTotal = shown.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <>
      <section aria-label="Totales del período" className={sales.cards}>
        <div className={sales.card}>
          <span className={sales.cardLabel}>Gastado {periodWord(period)}</span>
          <strong className={sales.cardNumber}>{formatColones(list.total)}</strong>
          <span className={sales.cardDetail}>{plural(list.expenses.length, 'gasto', 'gastos')}</span>
        </div>
      </section>

      <section aria-label="Lista de gastos" className={sales.list}>
        <div className={sales.toolbar}>
          <label className={sales.search}>
            <Search size={22} aria-hidden="true" />
            <span className={sales.hidden}>Buscar gasto</span>
            <input
              type="search"
              value={search}
              placeholder="Buscar gasto"
              autoComplete="off"
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
          <div className={styles.tools}>
            <TypeFilter
              options={options}
              selected={ticked.map((option) => option.id)}
              onChange={(ids) => onTick(options.filter((option) => ids.includes(option.id)))}
            />
            <Button variant="secondary" className={styles.types} onClick={onTypes}>
              <span className={sales.buttonContent}>
                <Tags size={22} aria-hidden="true" />
                Tipos de gasto
              </span>
            </Button>
          </div>
        </div>

        {list.expenses.length === 0 ? (
          <div className={styles.empty}>
            <p role="status">No hay gastos registrados {periodWord(period)}.</p>
            {newButton}
          </div>
        ) : shown.length === 0 ? (
          <div className={styles.empty}>
            <p role="status">No hay gastos que coincidan.</p>
            <Button variant="secondary" onClick={onClearFilters}>
              Quitar filtros
            </Button>
          </div>
        ) : (
          <>
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
                  {shown.map((expense) => {
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
                              onClick={() => onEdit(expense)}
                            >
                              <Pencil size={20} aria-hidden="true" />
                              Editar
                            </button>
                            <button
                              type="button"
                              className={sales.remove}
                              aria-label={`Eliminar el gasto de ${kind}`}
                              onClick={() => onDelete(expense)}
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
              <span>
                {filtering
                  ? `${shown.length} de ${plural(list.expenses.length, 'gasto', 'gastos')}`
                  : plural(list.expenses.length, 'gasto', 'gastos')}
              </span>
              <strong>Total {formatColones(filtering ? shownTotal : list.total)}</strong>
            </div>
          </>
        )}
      </section>
    </>
  )
}
