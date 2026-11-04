import { useEffect } from 'react'
import { formatDateLong, todayLocal } from '../lib/dates'
import { Field } from './Field'

interface Props {
  label: string
  /** Local YYYY-MM-DD. Leave undefined to start on today: the field reports today through onChange. */
  value: string | undefined
  onChange: (value: string) => void
  error?: string
}

/** The browser's own date field. Its value is already a local YYYY-MM-DD, so no time zone is involved. */
export function DateInput({ label, value, onChange, error }: Props) {
  // Read once per render on purpose: while value is undefined, today is what's on screen and what gets reported.
  const shown = value ?? todayLocal()

  useEffect(() => {
    if (value === undefined) {
      onChange(shown)
    }
  }, [value, shown, onChange])

  return (
    <Field label={label} error={error} hint={formatDateLong(shown)}>
      {(input) => (
        <input
          {...input}
          type="date"
          value={shown}
          onChange={(event) => onChange(event.target.value)}
          // Opens the calendar from anywhere in the field, not just its small icon.
          onClick={(event) => event.currentTarget.showPicker?.()}
        />
      )}
    </Field>
  )
}
