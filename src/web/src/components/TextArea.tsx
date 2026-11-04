import { Field } from './Field'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  maxLength?: number
}

/** For text that can run to several lines. Enter adds a line here instead of submitting the form. */
export function TextArea({ label, value, onChange, error, maxLength }: Props) {
  return (
    <Field label={label} error={error}>
      {(input) => (
        <textarea
          {...input}
          rows={5}
          autoComplete="off"
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}
