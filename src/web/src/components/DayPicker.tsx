import type { KeyboardEventHandler, Ref } from 'react'
import { formatDateLong, todayLocal, yesterdayLocal } from '../lib/dates'
import { Button } from './Button'
import { DateInput } from './DateInput'
import styles from './DayPicker.module.css'

interface Props {
  /** Local YYYY-MM-DD, or empty if the field has been cleared. */
  value: string
  onChange: (value: string) => void
  error?: string
  /** The day to write out when it isn't the field's value, like a list that stays on a day while a date is typed. */
  writtenDay?: string
  onDateKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onDateBlur?: () => void
  dateRef?: Ref<HTMLInputElement>
}

/** Today and yesterday as large buttons, because they're the usual days and the browser's calendar is small. */
export function DayPicker({ value, onChange, error, writtenDay, onDateKeyDown, onDateBlur, dateRef }: Props) {
  const today = todayLocal()
  const yesterday = yesterdayLocal()

  const dayButton = (label: string, day: string) => (
    <Button
      className={styles.dayButton}
      variant={value === day ? 'primary' : 'secondary'}
      aria-pressed={value === day}
      onClick={() => onChange(day)}
    >
      {label}
    </Button>
  )

  return (
    <div className={styles.picker}>
      {dayButton('Hoy', today)}
      {dayButton('Ayer', yesterday)}
      <div className={styles.date}>
        <DateInput
          ref={dateRef}
          label="Fecha"
          value={value}
          onChange={onChange}
          error={error}
          max={today}
          hideWrittenDate
          onKeyDown={onDateKeyDown}
          onBlur={onDateBlur}
        />
      </div>
      <p className={styles.written}>{formatDateLong(writtenDay ?? value)}</p>
    </div>
  )
}
