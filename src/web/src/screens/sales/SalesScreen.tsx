import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { DayPicker } from '../../components/DayPicker'
import { todayLocal } from '../../lib/dates'
import { formatColones } from '../../lib/money'
import { Screen } from '../../layout/Screen'
import { summarizeSale } from './saleText'
import styles from './SalesScreen.module.css'
import { canHaveSales, useSaleDay } from './useSaleDay'
import { useSaleList } from './useSaleList'

export function SalesScreen() {
  const navigate = useNavigate()
  const { day, setDay } = useSaleDay()
  const { list, failed, retry } = useSaleList(day)

  // What's in the date field, which while typing a year can be something like 0002-11-04 or nothing at all. The list
  // stays on its day until the field holds a day it can show, and the field goes back to that day when it's left.
  const [typing, setTyping] = useState<string | null>(null)

  const changeDate = (next: string) => {
    if (canHaveSales(next)) {
      setTyping(null)
      setDay(next)
    } else {
      setTyping(next)
    }
  }

  const query = `?fecha=${day}`

  return (
    <Screen title="Ventas" backTo="/">
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
          <Button onClick={() => navigate(`/ventas/nueva${query}`)}>
            <span className={styles.buttonContent}>
              <Plus size={28} aria-hidden="true" />
              Nueva venta
            </span>
          </Button>
        </div>
        {list && (
          <p className={styles.total}>
            <span>Total del día</span>
            <strong>{formatColones(list.cashTotal)}</strong>
          </p>
        )}
      </div>

      {failed ? (
        <div className={styles.message}>
          <p role="alert">No se pudieron cargar las ventas.</p>
          <Button onClick={retry}>Intentar de nuevo</Button>
        </div>
      ) : !list ? (
        <p role="status" className={styles.message}>
          Cargando…
        </p>
      ) : list.sales.length > 0 ? (
        <ul className={styles.list} aria-label="Ventas del día">
          {list.sales.map((sale) => (
            <li key={sale.id}>
              <button type="button" className={styles.row} onClick={() => navigate(`/ventas/${sale.id}/editar${query}`)}>
                <span className={styles.summary}>{summarizeSale(sale.items)}</span>
                <span className={styles.rowEnd}>
                  <strong className={styles.rowTotal}>{formatColones(sale.total)}</strong>
                  <ChevronRight size={36} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.message}>
          <p role="status">{day === todayLocal() ? 'Todavía no hay ventas hoy.' : 'No hay ventas este día.'}</p>
        </div>
      )}
    </Screen>
  )
}
