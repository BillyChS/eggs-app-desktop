import { Field } from './Field'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}

export function TextInput({ label, value, onChange, error }: Props) {
  return (
    <Field label={label} error={error}>
      {(input) => (
        <input
          {...input}
          type="text"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}
