import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DateInput } from '../components/DateInput'
import { formatDateShort, todayLocal, yesterdayLocal } from '../lib/dates'
import styles from './PeriodBar.module.css'
import { canHaveActivity } from './periodView'
import { describePeriod, isCurrent, periodOf, step, type Period } from './summaries/periods'

/** "3 nov 2026", on the Otro día button once a day is picked. */
const shortDay = (day: string) => formatDateShort(day)?.split(' ').slice(1).join(' ') ?? day

const STEP_NAMES = {
  week: { previous: 'Semana anterior', next: 'Semana siguiente' },
  month: { previous: 'Mes anterior', next: 'Mes siguiente' },
}

interface Props {
  period: Period
  onChange: (period: Period) => void
}

/**
 * Hoy, Ayer, Otro día, Esta semana and Este mes, as in Ventas and Gastos. On a week or a month, ‹ › go through them,
 * never past the current one. Weeks start on Monday.
 */
export function PeriodBar({ period, onChange }: Props) {
  const today = todayLocal()
  const yesterday = yesterdayLocal()
  const isDay = period.kind === 'day'
  const otherDay = isDay && period.start !== today && period.start !== yesterday

  const [picking, setPicking] = useState(false)
  // What's in the date field, which while typing a year can be something like 0002-11-04 or nothing at all. The list
  // stays on its day until the field holds a day it can show, and the field goes back to that day when it's left.
  const [typing, setTyping] = useState<string | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  // Otro día puts focus in the date field, once it's on screen.
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    if (focusRequest > 0) {
      dateRef.current?.focus()
    }
  }, [focusRequest])

  const showDay = (day: string) => onChange({ kind: 'day', start: day })

  const changeDate = (next: string) => {
    if (canHaveActivity(next)) {
      setTyping(null)
      showDay(next)
    } else {
      setTyping(next)
    }
  }

  const periodButton = (label: string, pressed: boolean, onClick: () => void, icon?: boolean) => (
    <button
      type="button"
      className={pressed ? `${styles.period} ${styles.pressed}` : styles.period}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon && <CalendarDays size={22} aria-hidden="true" />}
      {label}
    </button>
  )

  const showCurrent = (kind: 'week' | 'month') => {
    setPicking(false)
    onChange(periodOf(kind, today))
  }

  const showsDateField = isDay && (picking || otherDay)
  const next = step(period, 1)

  return (
    <div className={styles.periodBar}>
      <div role="group" aria-label="Período" className={styles.periods}>
        {periodButton('Hoy', isDay && period.start === today, () => {
          setPicking(false)
          showDay(today)
        })}
        {periodButton('Ayer', isDay && period.start === yesterday, () => {
          setPicking(false)
          showDay(yesterday)
        })}
        {periodButton(
          otherDay ? shortDay(period.start) : 'Otro día',
          otherDay,
          () => {
            setPicking(true)
            // On a week or a month, it opens on today, ready for another day to be typed or picked.
            if (!isDay) {
              showDay(today)
            }
            setFocusRequest((current) => current + 1)
          },
          true,
        )}
        {periodButton('Esta semana', period.kind === 'week', () => showCurrent('week'))}
        {periodButton('Este mes', period.kind === 'month', () => showCurrent('month'))}
      </div>

      {showsDateField && (
        <div className={styles.dateField}>
          <DateInput
            ref={dateRef}
            label="Día"
            value={typing ?? period.start}
            onChange={changeDate}
            max={today}
            hideWrittenDate
            onBlur={() => setTyping(null)}
          />
        </div>
      )}

      {period.kind !== 'day' && (
        <div className={styles.steps}>
          <button
            type="button"
            className={styles.arrow}
            aria-label={STEP_NAMES[period.kind].previous}
            onClick={() => onChange(step(period, -1))}
          >
            <ChevronLeft size={26} aria-hidden="true" />
          </button>
          <span className={styles.periodName}>{describePeriod(period)}</span>
          <button
            type="button"
            className={styles.arrow}
            aria-label={STEP_NAMES[period.kind].next}
            disabled={isCurrent(period) || next.start > today}
            onClick={() => onChange(next)}
          >
            <ChevronRight size={26} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
