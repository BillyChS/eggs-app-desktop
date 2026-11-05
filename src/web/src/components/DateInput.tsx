import { useEffect, type KeyboardEventHandler, type Ref } from 'react'
import { formatDateLong, todayLocal } from '../lib/dates'
import { Field } from './Field'

interface Props {
  label: string
  /** Local YYYY-MM-DD. Leave undefined to start on today: the field reports today through onChange. */
  value: string | undefined
  onChange: (value: string) => void
  error?: string
  /** The latest date the calendar offers, local YYYY-MM-DD. It doesn't stop a date being typed. */
  max?: string
  /** For a screen that shows the written date somewhere else. */
  hideWrittenDate?: boolean
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onBlur?: () => void
  ref?: Ref<HTMLInputElement>
}

/**
 * The browser's own date field. Its value is already a local YYYY-MM-DD, so no time zone is involved.
 * Its calendar is in Spanish but small, and CSS can't reach it; pair it with larger ways to pick the usual days.
 */
export function DateInput({ label, value, onChange, error, max, hideWrittenDate, onKeyDown, onBlur, ref }: Props) {
  // Read once per render on purpose: while value is undefined, today is what's on screen and what gets reported.
  const shown = value ?? todayLocal()

  useEffect(() => {
    if (value === undefined) {
      onChange(shown)
    }
  }, [value, shown, onChange])

  return (
    <Field label={label} error={error} hint={hideWrittenDate ? undefined : formatDateLong(shown)}>
      {(input) => (
        <input
          {...input}
          ref={ref}
          type="date"
          max={max}
          value={shown}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          // Opens the calendar from anywhere in the field, not just its small icon.
          onClick={(event) => event.currentTarget.showPicker?.()}
        />
      )}
    </Field>
  )
}
