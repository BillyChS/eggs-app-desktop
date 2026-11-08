import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '../../components/Button'
import { LoadProblem } from '../../layout/LoadProblem'
import { Screen } from '../../layout/Screen'
import { useLoad } from '../../layout/useLoad'
import { formatDateShort, todayLocal } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { getSummary, type BestCustomers, type CustomerBought, type Summary } from '../../services/reports'
import {
  describePeriod,
  isCurrent,
  periodOf,
  periodParams,
  rangeOf,
  readPeriod,
  step,
  type Period,
  type PeriodKind,
} from './periods'
import styles from './SummariesScreen.module.css'

const CHOICES: { kind: PeriodKind; label: string }[] = [
  { kind: 'day', label: 'Hoy' },
  { kind: 'week', label: 'Esta semana' },
  { kind: 'month', label: 'Este mes' },
]

const CREDIT_LABELS: Record<PeriodKind, string> = {
  day: 'Fiado del día',
  week: 'Fiado de la semana',
  month: 'Fiado del mes',
}

/** "−₡24.500" with a real minus sign, which is easier to see than a hyphen. */
function signedColones(value: number): string {
  return value < 0 ? `−${formatColones(-value)}` : formatColones(value)
}

const cartonsText = (quantity: number) => (quantity === 1 ? '1 cartón' : `${quantity} cartones`)

function BigNumbers({ summary }: { summary: Summary }) {
  const lost = summary.net < 0

  return (
    <div className={styles.bigNumbers}>
      <p className={styles.big}>
        <span>Entró</span>
        <strong>{formatColones(summary.cameIn.total)}</strong>
      </p>
      <p className={styles.big}>
        <span>Gastado</span>
        <strong>{formatColones(summary.spent.total)}</strong>
      </p>
      <p className={lost ? `${styles.big} ${styles.lost}` : styles.big}>
        <span>Quedó</span>
        <strong>{signedColones(summary.net)}</strong>
        {lost && <span className={styles.phrase}>Se gastó más de lo que entró.</span>}
      </p>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className={styles.line}>
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  )
}

function Breakdowns({ summary, kind, onOpenDay }: { summary: Summary; kind: PeriodKind; onOpenDay: (day: string) => void }) {
  const fifteens = summary.cartons.find((carton) => carton.cartonType === 'A')?.quantity ?? 0
  const thirties = summary.cartons.find((carton) => carton.cartonType === 'B')?.quantity ?? 0

  return (
    <>
      <div className={styles.sections}>
        <section className={styles.section} aria-label="De dónde entró">
          <h2 className={styles.heading}>Entró</h2>
          <Line label="Contado" value={formatColones(summary.cameIn.cash)} />
          <Line label="Abonos" value={formatColones(summary.cameIn.payments)} />
        </section>

        <section className={styles.section} aria-label="En qué se gastó">
          <h2 className={styles.heading}>Gastado</h2>
          {summary.spent.byCategory.length > 0 ? (
            summary.spent.byCategory.map((category) => (
              <Line key={category.name} label={category.name} value={formatColones(category.total)} />
            ))
          ) : (
            <p className={styles.none}>No hubo gastos.</p>
          )}
        </section>

        <section className={styles.section} aria-label="Cartones vendidos">
          <h2 className={styles.heading}>Cartones vendidos (contado y fiado)</h2>
          <Line label="De 15 huevos" value={cartonsText(fifteens)} />
          <Line label="De 30 huevos" value={cartonsText(thirties)} />
        </section>

        <section className={styles.section} aria-label="Fiado">
          <h2 className={styles.heading}>Fiado</h2>
          <Line label={`${CREDIT_LABELS[kind]} (por cobrar)`} value={formatColones(summary.creditSold)} />
          <OwedTotal summary={summary} />
        </section>
      </div>

      <BestCustomersSection best={summary.bestCustomers} />

      {kind !== 'day' && summary.days.length > 0 && (
        <section aria-label="Día por día">
          <h2 className={styles.heading}>Día por día</h2>
          <ul className={styles.days}>
            {summary.days.map((day) => (
              <li key={day.date}>
                <button type="button" className={styles.day} onClick={() => onOpenDay(day.date)}>
                  <span className={styles.dayDate}>{formatDateShort(day.date)}</span>
                  <span className={styles.dayAmount}>Entró {formatColones(day.cameIn)}</span>
                  <span className={styles.dayAmount}>Gastado {formatColones(day.spent)}</span>
                  <span className={day.net < 0 ? `${styles.dayAmount} ${styles.lostText}` : styles.dayAmount}>
                    Quedó {signedColones(day.net)}
                  </span>
                  <ChevronRight size={32} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** "4 de 15 · 6 de 30", leaving out a size they didn't buy. */
function describeCartons({ fifteens, thirties }: CustomerBought): string {
  return [fifteens > 0 && `${fifteens} de 15`, thirties > 0 && `${thirties} de 30`].filter(Boolean).join(' · ')
}

/**
 * Only sales where someone was named can be ranked, which the note says plainly, and what was sold to nobody in
 * particular is shown right under it, so the ranking can't pass for all the sales.
 */
function BestCustomersSection({ best }: { best: BestCustomers }) {
  return (
    <section className={styles.section} aria-labelledby="mejores-clientes">
      <h2 id="mejores-clientes" className={styles.heading}>
        Mejores clientes
      </h2>
      <p className={styles.note}>Solo cuenta las ventas en que se anotó quién compró (al contado y fiado).</p>

      {best.top.length > 0 ? (
        <ol className={styles.ranking}>
          {best.top.map((customer, index) => (
            <li key={customer.id} className={styles.rank}>
              <span className={styles.rankNumber}>{index + 1}.</span>
              <span className={styles.rankName}>
                {customer.isDeleted ? `${customer.name} (borrado)` : customer.name}
              </span>
              <span className={styles.rankCartons}>{describeCartons(customer)}</span>
              <strong className={styles.rankTotal}>{formatColones(customer.total)}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.none}>En este período no se anotó quién compró en ninguna venta.</p>
      )}

      {best.othersCount > 0 && (
        <Line
          label={best.othersCount === 1 ? 'Y 1 cliente más' : `Y ${best.othersCount} clientes más`}
          value={formatColones(best.othersTotal)}
        />
      )}
      <Line label="Ventas sin cliente" value={formatColones(best.withoutCustomer)} />
    </section>
  )
}

function OwedTotal({ summary }: { summary: Summary }) {
  return (
    <div>
      <Line label="Por cobrar en total" value={formatColones(summary.owedTotal)} />
      <p className={styles.note}>Lo que deben hoy todos los clientes.</p>
    </div>
  )
}

export function SummariesScreen() {
  const [params, setParams] = useSearchParams()
  const today = todayLocal()
  const period = readPeriod(params, today)
  const { from, to } = rangeOf(period, today)
  const current = isCurrent(period, today)
  const previousRef = useRef<HTMLButtonElement>(null)

  const { load, retry } = useLoad(`${from}|${to}`, (signal) => getSummary(from, to, signal), 'No se encontró el resumen.')

  /** Replaces the address, so that going through periods doesn't pile up in the history. */
  const show = (next: Period) => setParams(periodParams(next), { replace: true })

  const showNext = () => {
    const next = step(period, 1)
    show(next)

    // "›" can't go past the current period, and turns off there: focus goes to "‹" rather than nowhere.
    if (isCurrent(next, today)) {
      previousRef.current?.focus()
    }
  }

  const summary = load.state === 'ready' ? load.value : null
  const isEmpty = summary !== null && summary.days.length === 0

  return (
    <Screen title="Resúmenes">
      <div className={styles.toolbar}>
        <div className={styles.choices}>
          {CHOICES.map(({ kind, label }) => {
            const chosen = current && period.kind === kind

            return (
              <Button
                key={kind}
                variant={chosen ? 'primary' : 'secondary'}
                aria-pressed={chosen}
                onClick={() => show(periodOf(kind, today))}
              >
                {label}
              </Button>
            )
          })}
        </div>
        <div className={styles.stepper}>
          <Button
            ref={previousRef}
            variant="secondary"
            className={styles.arrow}
            aria-label="Anterior"
            onClick={() => show(step(period, -1))}
          >
            <ChevronLeft size={36} aria-hidden="true" />
          </Button>
          <p className={styles.period} aria-live="polite">
            {describePeriod(period)}
          </p>
          <Button
            variant="secondary"
            className={styles.arrow}
            aria-label="Siguiente"
            disabled={current}
            onClick={showNext}
          >
            <ChevronRight size={36} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {load.state === 'failed' ? (
        <LoadProblem state="failed" failedMessage="No se pudo cargar el resumen." onRetry={retry} />
      ) : !summary ? (
        <LoadProblem state="loading" failedMessage="" onRetry={retry} />
      ) : (
        <div className={styles.body}>
          <BigNumbers summary={summary} />
          {isEmpty ? (
            <>
              <p role="status" className={styles.empty}>
                No hubo ventas, abonos ni gastos en este período.
              </p>
              <div className={styles.section}>
                <OwedTotal summary={summary} />
              </div>
            </>
          ) : (
            <Breakdowns
              summary={summary}
              kind={period.kind}
              onOpenDay={(day) => show(periodOf('day', day))}
            />
          )}
        </div>
      )}
    </Screen>
  )
}
