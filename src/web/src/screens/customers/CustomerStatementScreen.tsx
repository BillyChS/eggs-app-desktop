import { ChevronRight, Pencil, Plus } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Button } from '../../components/Button'
import { formatDateShort } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { getStatement, type CashPurchase, type StatementEntry } from '../../services/customers'
import { summarizeSale } from '../sales/saleText'
import { describeBalance, statementOf } from './customerText'
import styles from './CustomerStatementScreen.module.css'

/** "Fiado · 3 de 15 · 1 de 30" or "Abono · pagó la mitad" */
function describeEntry(entry: StatementEntry): string {
  if (entry.kind === 'sale') {
    return `Fiado · ${summarizeSale(entry.items ?? [])}`
  }

  const abono = entry.saleId ? 'Abono al hacer la venta' : 'Abono'
  return entry.note ? `${abono} · ${entry.note}` : abono
}

/** "3 compras · ₡40.500" */
function describePurchases(purchases: CashPurchase[]): string {
  const total = purchases.reduce((sum, purchase) => sum + purchase.total, 0)
  const count = purchases.length === 1 ? '1 compra' : `${purchases.length} compras`
  return `${count} · ${formatColones(total)}`
}

/** "+₡5.000" for what adds to the balance, "−₡2.000" for what lowers it. */
function signedAmount(entry: StatementEntry): string {
  return `${entry.kind === 'sale' ? '+' : '−'}${formatColones(entry.amount)}`
}

/** A customer's one running account: what they owe now, then every fiado and abono, newest first. */
export function CustomerStatementScreen() {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const { load, retry } = useLoad(id, (signal) => getStatement(id, signal), 'Este cliente ya no existe.')

  if (load.state === 'gone') {
    return <Navigate to="/clientes" replace />
  }

  if (load.state !== 'ready') {
    return (
      <Screen title="Cliente" backTo="/clientes">
        <LoadProblem state={load.state} failedMessage="No se pudo abrir este cliente." onRetry={retry} />
      </Screen>
    )
  }

  const statement = load.value
  const owes = statement.balance > 0
  const here = `?${new URLSearchParams({ cliente: id })}`

  const openEntry = (entry: StatementEntry) =>
    navigate(
      entry.kind === 'sale'
        ? `/ventas/${entry.id}/editar${here}`
        : `${statementOf(id)}/abonos/${entry.id}/editar`,
    )

  return (
    <Screen title={statement.name} backTo="/clientes">
      <div className={styles.top}>
        <p className={owes ? `${styles.balance} ${styles.owes}` : styles.balance}>
          <span>{owes ? 'Debe' : 'Al día'}</span>
          {owes && <strong>{formatColones(statement.balance)}</strong>}
        </p>
        <div className={styles.actions}>
          {owes && (
            <Button onClick={() => navigate(`${statementOf(id)}/abonos/nuevo`)}>
              <span className={styles.buttonContent}>
                <Plus size={28} aria-hidden="true" />
                Anotar abono
              </span>
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate(`${statementOf(id)}/editar`)}>
            <span className={styles.buttonContent}>
              <Pencil size={26} aria-hidden="true" />
              Editar cliente
            </span>
          </Button>
        </div>
      </div>

      {statement.entries.length > 0 ? (
        <ul className={styles.list} aria-label="Fiados y abonos">
          {statement.entries.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`}>
              <button type="button" className={styles.row} onClick={() => openEntry(entry)}>
                <span className={styles.date}>{formatDateShort(entry.date)}</span>
                <span className={styles.description}>{describeEntry(entry)}</span>
                <span className={styles.amounts}>
                  <strong className={styles.amount}>{signedAmount(entry)}</strong>
                  <span className={styles.after}>{describeBalance(entry.balance)}</span>
                </span>
                <ChevronRight size={36} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className={styles.message}>
          {statement.name} no tiene fiados ni abonos.
        </p>
      )}

      {/* Apart from the account above, under its own heading: these were paid on the spot. */}
      {statement.cashPurchases.length > 0 && (
        <section className={styles.cash} aria-labelledby="compras-al-contado">
          <div className={styles.cashHeading}>
            <h2 id="compras-al-contado" className={styles.heading}>
              Compras al contado
            </h2>
            <p className={styles.cashNote}>
              No cuentan en lo que debe. {describePurchases(statement.cashPurchases)}
            </p>
          </div>
          <ul className={styles.list} aria-label="Compras al contado">
            {statement.cashPurchases.map((purchase) => (
              <li key={purchase.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => navigate(`/ventas/${purchase.id}/editar${here}`)}
                >
                  <span className={styles.date}>{formatDateShort(purchase.date)}</span>
                  <span className={styles.description}>{summarizeSale(purchase.items)}</span>
                  <span className={styles.amounts}>
                    <strong className={styles.amount}>{formatColones(purchase.total)}</strong>
                  </span>
                  <ChevronRight size={36} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}
