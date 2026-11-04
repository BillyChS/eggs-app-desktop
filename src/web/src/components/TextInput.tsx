import type { Ref } from 'react'
import { Field } from './Field'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  maxLength?: number
  ref?: Ref<HTMLInputElement>
}

export function TextInput({ label, value, onChange, error, maxLength, ref }: Props) {
  return (
    <Field label={label} error={error}>
      {(input) => (
        <input
          {...input}
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
