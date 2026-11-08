import { CircleAlert } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import styles from './Field.module.css'

interface InputProps {
  id: string
  className: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
}

interface Props {
  label: string
  /** For a field under a column heading that already says what it is. Screen readers still read the label. */
  hideLabel?: boolean
  error?: string
  /** Shown under the input, for text that helps confirm the value. */
  hint?: ReactNode
  /** Something fixed to the left of the input, like the ₡ sign. */
  prefix?: string
  children: (input: InputProps) => ReactNode
}

/** The parts every input shares: a label that's always visible, and an error in words, not just color. */
export function Field({ label, hideLabel, error, hint, prefix, children }: Props) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? styles.hiddenLabel : styles.label}>
        {label}
      </label>
      <div className={styles.row}>
        {prefix && (
          <span className={styles.prefix} aria-hidden="true">
            {prefix}
          </span>
        )}
        {children({
          id,
          className: error ? `${styles.input} ${styles.invalid}` : styles.input,
          'aria-invalid': Boolean(error),
          'aria-describedby': describedBy,
        })}
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          <CircleAlert size={26} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
