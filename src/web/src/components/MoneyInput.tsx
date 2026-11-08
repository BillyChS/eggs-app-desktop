import {
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type InputHTMLAttributes,
  type RefObject,
} from 'react'
import { groupThousands, MAX_COLONES, parseColones, type ParsedColones } from '../lib/money'
import { Field } from './Field'

interface Props {
  label: string
  hideLabel?: boolean
  /** Whole colones, or null when empty or not a valid amount yet. */
  value: number | null
  onChange: (value: number | null) => void
  error?: string
  /** For Enter, and for selecting the value on focus. */
  inputProps?: InputHTMLAttributes<HTMLInputElement>
  ref?: RefObject<HTMLInputElement | null>
}

const MAX_DIGITS = MAX_COLONES.toString().length

const display = (value: number | null) => (value === null ? '' : groupThousands(value.toString()))

function errorFor(parsed: ParsedColones): string | undefined {
  switch (parsed.kind) {
    case 'decimals':
      return 'Escriba solo colones enteros, sin céntimos.'
    case 'tooLarge':
      return 'Ese monto es demasiado grande.'
    case 'invalid':
      return 'Escriba solo números.'
    default:
      return undefined
  }
}

/**
 * Amount in whole colones, formatted while typing. A text field, because type="number" accepts "e" and changes
 * its value when the mouse wheel scrolls over it.
 *
 * Normally only digits count, and the dots are the field's own. Once someone types a separator themselves, the
 * text stays as typed until they leave the field, so "12500,50" gets an error instead of becoming ₡1.250.050.
 */
export function MoneyInput({ label, hideLabel, value, onChange, error, inputProps, ref }: Props) {
  const [text, setText] = useState(() => display(value))
  const [asTyped, setAsTyped] = useState(false)
  const [ownError, setOwnError] = useState<string>()
  const [reported, setReported] = useState(value)

  const ownRef = useRef<HTMLInputElement>(null)
  const inputRef = ref ?? ownRef
  const digitsBeforeCaret = useRef<number | null>(null)

  // The parent changed the value, for example by clearing the form.
  if (value !== reported) {
    setReported(value)
    setText(display(value))
    setAsTyped(false)
    setOwnError(undefined)
  }

  // Formatting moves the caret to the end; this puts it back after the same digit.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (digitsBeforeCaret.current === null || !input) {
      return
    }

    let position = 0
    for (let digits = digitsBeforeCaret.current; digits > 0 && position < text.length; position++) {
      if (text[position] !== '.') {
        digits--
      }
    }

    input.setSelectionRange(position, position)
    digitsBeforeCaret.current = null
  }, [text, inputRef])

  const report = (next: number | null) => {
    setReported(next)
    if (next !== value) {
      onChange(next)
    }
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const typed = (event.nativeEvent as InputEvent).data
    setOwnError(undefined)

    // Deleting the last separator goes back to normal formatting below.
    if ((asTyped || typed === '.' || typed === ',') && /[.,]/.test(raw)) {
      const kept = raw.replace(/[^\d.,]/g, '')
      const parsed = parseColones(kept)
      setAsTyped(true)
      setText(kept)
      report(parsed.kind === 'ok' ? parsed.value : null)
      return
    }

    const caret = event.target.selectionStart ?? raw.length
    const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS)
    digitsBeforeCaret.current = raw.slice(0, caret).replace(/\D/g, '').length

    setAsTyped(false)
    setText(groupThousands(digits))
    report(digits === '' ? null : Number(digits))
  }

  const handleBlur = () => {
    if (!asTyped) {
      return
    }

    const parsed = parseColones(text)
    setOwnError(errorFor(parsed))

    if (parsed.kind === 'ok') {
      setText(display(parsed.value))
      setAsTyped(false)
    }
  }

  // Whatever is pasted is one amount, read as a whole. It replaces the field.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const parsed = parseColones(event.clipboardData.getData('text'))
    const problem = errorFor(parsed)

    setOwnError(problem)
    if (problem) {
      return
    }

    const next = parsed.kind === 'ok' ? parsed.value : null
    setText(display(next))
    setAsTyped(false)
    report(next)
  }

  return (
    <Field label={label} hideLabel={hideLabel} error={error ?? ownError} prefix="₡">
      {(input) => (
        <input
          {...input}
          {...inputProps}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          onPaste={handlePaste}
        />
      )}
    </Field>
  )
}
