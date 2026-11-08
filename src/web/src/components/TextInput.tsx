import type { InputHTMLAttributes, Ref } from 'react'
import { Field } from './Field'

interface Props {
  label: string
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  error?: string
  maxLength?: number
  /** For Enter, and for selecting the value on focus. */
  inputProps?: InputHTMLAttributes<HTMLInputElement>
  ref?: Ref<HTMLInputElement>
}

export function TextInput({ label, hideLabel, value, onChange, error, maxLength, inputProps, ref }: Props) {
  return (
    <Field label={label} hideLabel={hideLabel} error={error}>
      {(input) => (
        <input
          {...input}
          {...inputProps}
          ref={ref}
          type="text"
          autoComplete="off"
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}
