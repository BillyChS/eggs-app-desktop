import { Eye, HandCoins, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useMessages } from '../../components/messages'
import { Screen } from '../../layout/Screen'
import { useOneAtATime } from '../../layout/useOneAtATime'
import { formatDateLong, todayLocal, yesterdayLocal } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { getCustomer, type CustomerRef } from '../../services/customers'
import { ApiError } from '../../services/http'
import { deletePayment, type Payment } from '../../services/payments'
import { deleteSale, type Sale } from '../../services/sales'
import { describeBalanceNow, statementOf } from '../customers/customerText'
import { PeriodBar } from '../PeriodBar'
import { dayInPeriod } from '../periodView'
import { describePeriod, rangeOf } from '../summaries/periods'
import { AbonoDialog } from './AbonoDialog'
import { deleteQuestion, describeCartons, NO_NAME, statusOf } from './saleText'
import styles from './SalesScreen.module.css'
import { matchesSearch } from './salesSearch'
import { useSalesView, viewQuery, type SalesTab, type SalesView } from './salesView'
import { useSalesPage, type SalesPage } from './useSalesPage'

const nameOf = (customer: CustomerRef | null) =>
  !customer ? NO_NAME : customer.isDeleted ? `${customer.name} (borrado)` : customer.name

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** How each period is said in the cards: "Entró hoy", "Fiado ese día", "Entró en la semana"… */
function periodWord(view: SalesView): string {
  if (view.period.kind === 'month') {
    return 'en el mes'
  }

  if (view.period.kind === 'week') {
    return 'en la semana'
  }

  const day = view.period.start
  return day === todayLocal() ? 'hoy' : day === yesterdayLocal() ? 'ayer' : 'ese día'
}

function Cards({ page, view }: { page: SalesPage; view: SalesView }) {
  const { summary } = page
  const word = periodWord(view)
  const fifteens = summary.cartons.find((carton) => carton.cartonType === 'A')?.quantity ?? 0
  const thirties = summary.cartons.find((carton) => carton.cartonType === 'B')?.quantity ?? 0
  const creditCount = page.sales.sales.filter((sale) => sale.isCredit).length

  return (
    <section aria-label="Totales del período" className={styles.cards}>
      <div className={styles.card}>
        <span className={styles.cardLabel}>Entró {word}</span>
        <strong className={styles.cardNumber}>{formatColones(summary.cameIn.total)}</strong>
        <span className={styles.cardDetail}>
          Contado {formatColones(summary.cameIn.cash)} · Abonos {formatColones(summary.cameIn.payments)}
        </span>
      </div>
      <div className={styles.card}>
        <span className={styles.cardLabel}>
          {view.period.kind === 'month' ? 'Fiado del mes' : view.period.kind === 'week' ? 'Fiado de la semana' : `Fiado ${word}`}
        </span>
        <strong className={`${styles.cardNumber} ${styles.owedNumber}`}>{formatColones(summary.creditSold)}</strong>
        <span className={styles.cardDetail}>{plural(creditCount, 'venta fiada', 'ventas fiadas')}</span>
      </div>
      <div className={styles.card}>
        <span className={styles.cardLabel}>Cartones vendidos</span>
        <strong className={styles.cardNumber}>{fifteens + thirties}</strong>
        <span className={styles.cardDetail}>
          {fifteens} de 15 · {thirties} de 30
        </span>
      </div>
    </section>
  )
}

const TAB_LABELS: Record<SalesTab, string> = { fiado: 'Fiado', contado: 'Contado', abonos: 'Abonos' }

const EMPTY: Record<SalesTab, string> = {
  fiado: 'No hay ventas fiadas en este período.',
  contado: 'No hay ventas al contado en este período.',
  abonos: 'No hay abonos en este período.',
}

function footerText(tab: SalesTab, count: number): string {
  if (tab === 'abonos') {
    return plural(count, 'abono', 'abonos')
  }

  return `${plural(count, 'venta', 'ventas')} ${tab === 'fiado' ? (count === 1 ? 'fiada' : 'fiadas') : 'al contado'}`
}

/** "Abono a la venta del 3 de noviembre": an abono from a fiado's Abonar button, while that sale is still there. */
function describePaymentKind(payment: Payment): string {
  if (payment.saleId) {
    return 'Abono al hacer la venta'
  }

  const saleDay = payment.forSaleDate ? formatDateLong(payment.forSaleDate) : null
  return saleDay ? `Abono a la venta del ${saleDay.split(', ')[1] ?? saleDay}` : 'Abono'
}

/** What's being deleted, with the question to ask about it once it's ready. */
type Deleting = { kind: 'sale'; sale: Sale; question: string } | { kind: 'payment'; payment: Payment; question: string; balance: number | null }

export function SalesScreen() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useMessages()
  const { run: oneAtATime } = useOneAtATime()
  const { view, setView } = useSalesView()
  const { from, to } = rangeOf(view.period)
  const { page, failed, reload } = useSalesPage(from, to)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  // The fiado whose Abonar (or Ver abonos, once it's paid) is open.
  const [paying, setPaying] = useState<{ sale: Sale; readOnly: boolean } | null>(null)

  // A week or a month: its rows say their day.
  const isRange = view.period.kind !== 'day'
  const query = viewQuery(view)

  const sales = page?.sales.sales ?? []
  const payments = page?.payments.payments ?? []
  const counts: Record<SalesTab, number> = {
    fiado: sales.filter((sale) => sale.isCredit).length,
    contado: sales.filter((sale) => !sale.isCredit).length,
    abonos: payments.length,
  }

  const shownSales = sales.filter(
    (sale) =>
      sale.isCredit === (view.tab === 'fiado') &&
      matchesSearch(nameOf(sale.customer), sale.customer?.phone, search),
  )
  const shownPayments = payments.filter((payment) =>
    matchesSearch(nameOf(payment.customer), payment.customer.phone, search),
  )
  const shownCount = view.tab === 'abonos' ? shownPayments.length : shownSales.length
  const shownTotal =
    view.tab === 'abonos'
      ? shownPayments.reduce((sum, payment) => sum + payment.amount, 0)
      : shownSales.reduce((sum, sale) => sum + sale.total, 0)

  /** Asks first, with the balance it changes when it can be read. Without it, the question just leaves it out. */
  const startDeleteSale = (sale: Sale) =>
    void oneAtATime(async () => {
      const owedNow =
        sale.isCredit && sale.customer && !sale.customer.isDeleted
          ? await getCustomer(sale.customer.id).then(
              (customer) => customer.balance,
              () => null,
            )
          : null
      setDeleting({ kind: 'sale', sale, question: deleteQuestion(sale, owedNow) })
    })

  const startDeletePayment = (payment: Payment) =>
    void oneAtATime(async () => {
      const balance = payment.customer.isDeleted
        ? null
        : await getCustomer(payment.customer.id).then(
            (customer) => customer.balance,
            () => null,
          )
      const what = `¿Borrar el abono de ${formatColones(payment.amount)} de ${payment.customer.name} del ${formatDateLong(payment.date)}?`
      const question =
        balance === null
          ? what
          : `${what} Su saldo subirá de ${formatColones(balance)} a ${formatColones(balance + payment.amount)}.`
      setDeleting({ kind: 'payment', payment, question, balance })
    })

  const confirmDelete = (what: Deleting) =>
    void oneAtATime(async () => {
      setDeleting(null)

      try {
        if (what.kind === 'sale') {
          await deleteSale(what.sale.id)
          showSuccess('Venta borrada.')
        } else {
          await deletePayment(what.payment.id)
          showSuccess(
            what.balance === null
              ? 'Abono borrado.'
              : `Abono borrado. ${describeBalanceNow(what.balance + what.payment.amount)}`,
          )
        }
      } catch (error) {
        if (error instanceof ApiError && error.refusal) {
          showError(error.refusal)
        } else if (error instanceof ApiError && error.status === 404) {
          showError(what.kind === 'sale' ? 'Esta venta ya no existe.' : 'Este abono ya no existe.')
        } else {
          showError(`No se pudo borrar ${what.kind === 'sale' ? 'la venta' : 'el abono'}. Intente de nuevo.`)
        }
      }

      reload()
    })

  const editSale = (sale: Sale) => navigate(`/ventas/${sale.id}/editar${query}`)
  const editPayment = (payment: Payment) =>
    navigate(
      payment.saleId
        ? `/ventas/${payment.saleId}/editar${query}`
        : `${statementOf(payment.customer.id)}/abonos/${payment.id}/editar${query}`,
    )

  const subtitle =
    view.period.kind === 'month'
      ? `Todas las ventas de ${describePeriod(view.period)}`
      : view.period.kind === 'week'
        ? `Todas las ventas del ${describePeriod(view.period)}`
        : formatDateLong(view.period.start)

  return (
    <Screen
      title="Ventas"
      subtitle={subtitle}
      actions={
        <Button onClick={() => navigate(`/ventas/nueva${query}`)}>
          <span className={styles.buttonContent}>
            <Plus size={24} aria-hidden="true" />
            Nueva venta
          </span>
        </Button>
      }
    >
      <div className={styles.page}>
        <PeriodBar period={view.period} onChange={(period) => setView({ ...view, period })} />

        {failed ? (
          <div className={styles.message}>
            <p role="alert">No se pudieron cargar las ventas.</p>
            <Button onClick={reload}>Intentar de nuevo</Button>
          </div>
        ) : !page ? (
          <p role="status" className={styles.message}>
            Cargando…
          </p>
        ) : (
          <>
            <Cards page={page} view={view} />

            <section aria-label="Lista de ventas" className={styles.list}>
              <div className={styles.toolbar}>
                <label className={styles.search}>
                  <Search size={22} aria-hidden="true" />
                  <span className={styles.hidden}>Buscar por nombre o teléfono</span>
                  <input
                    type="search"
                    value={search}
                    placeholder="Buscar por nombre o teléfono"
                    autoComplete="off"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <div role="group" aria-label="Tipo de venta" className={styles.tabs}>
                  {(['fiado', 'contado', 'abonos'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={view.tab === tab ? `${styles.tab} ${styles.currentTab}` : styles.tab}
                      aria-pressed={view.tab === tab}
                      onClick={() => setView({ ...view, tab })}
                    >
                      {TAB_LABELS[tab]}
                      <span className={styles.count}>{counts[tab]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {isRange && <th scope="col">Fecha</th>}
                      <th scope="col">Nombre</th>
                      <th scope="col" className={styles.number}>
                        {view.tab === 'abonos' ? 'Monto' : 'Precio de venta'}
                      </th>
                      <th scope="col">{view.tab === 'abonos' ? 'Nota' : 'Estatus'}</th>
                      <th scope="col" className={styles.actionsHead}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.tab === 'abonos'
                      ? shownPayments.map((payment) => (
                          <tr key={payment.id}>
                            {isRange && <td className={styles.date}>{dayInPeriod(payment.date)}</td>}
                            <td>
                              <span className={styles.name}>{nameOf(payment.customer)}</span>
                              <span className={styles.detail}>{describePaymentKind(payment)}</span>
                            </td>
                            <td className={`${styles.number} ${styles.amount}`}>{formatColones(payment.amount)}</td>
                            <td className={styles.note}>{payment.note ?? ''}</td>
                            <td>
                              <div className={styles.actions}>
                                {payment.saleId ? (
                                  // It follows its sale, so that's where it's changed or deleted.
                                  <button type="button" className={styles.edit} onClick={() => editPayment(payment)}>
                                    Abrir la venta
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className={styles.edit}
                                      aria-label={`Editar el abono de ${payment.customer.name}`}
                                      onClick={() => editPayment(payment)}
                                    >
                                      <Pencil size={20} aria-hidden="true" />
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.remove}
                                      aria-label={`Eliminar el abono de ${payment.customer.name}`}
                                      onClick={() => startDeletePayment(payment)}
                                    >
                                      <Trash2 size={20} aria-hidden="true" />
                                      Eliminar
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      : shownSales.map((sale) => {
                          const status = statusOf(sale)
                          const name = nameOf(sale.customer)

                          return (
                            <tr key={sale.id}>
                              {isRange && <td className={styles.date}>{dayInPeriod(sale.date)}</td>}
                              <td>
                                <span className={sale.customer ? styles.name : `${styles.name} ${styles.noName}`}>
                                  {name}
                                </span>
                                <span className={styles.detail}>{describeCartons(sale.items)}</span>
                              </td>
                              <td className={`${styles.number} ${styles.amount}`}>{formatColones(sale.total)}</td>
                              <td>
                                <span className={`${styles.badge} ${styles[status.tone]}`}>{status.text}</span>
                              </td>
                              <td>
                                <div className={styles.actions}>
                                  {sale.isCredit &&
                                    (sale.owed > 0 ? (
                                      <button
                                        type="button"
                                        className={styles.pay}
                                        aria-label={`Abonar a la venta de ${name}`}
                                        onClick={() => setPaying({ sale, readOnly: false })}
                                      >
                                        <HandCoins size={20} aria-hidden="true" />
                                        Abonar
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className={styles.edit}
                                        aria-label={`Ver abonos de la venta de ${name}`}
                                        onClick={() => setPaying({ sale, readOnly: true })}
                                      >
                                        <Eye size={20} aria-hidden="true" />
                                        Ver abonos
                                      </button>
                                    ))}
                                  <button
                                    type="button"
                                    className={styles.edit}
                                    aria-label={`Editar la venta de ${name}`}
                                    onClick={() => editSale(sale)}
                                  >
                                    <Pencil size={20} aria-hidden="true" />
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.remove}
                                    aria-label={`Eliminar la venta de ${name}`}
                                    onClick={() => startDeleteSale(sale)}
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

              {shownCount === 0 && (
                <p role="status" className={styles.empty}>
                  {search.trim() ? `No se encontró nada con “${search.trim()}”.` : EMPTY[view.tab]}
                </p>
              )}

              <div className={styles.footer}>
                <span>{footerText(view.tab, shownCount)}</span>
                <strong>Total {formatColones(shownTotal)}</strong>
              </div>
            </section>
          </>
        )}
      </div>

      {paying && (
        <AbonoDialog
          key={paying.sale.id}
          sale={paying.sale}
          readOnly={paying.readOnly}
          onClose={() => setPaying(null)}
          onChanged={() => {
            setPaying(null)
            reload()
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          danger
          title={deleting.kind === 'sale' ? '¿Borrar esta venta?' : '¿Borrar este abono?'}
          message={deleting.question}
          confirmLabel="Sí, borrar"
          onCancel={() => setDeleting(null)}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </Screen>
  )
}
