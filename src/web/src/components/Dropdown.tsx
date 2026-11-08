import { Check, ChevronDown, CircleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import styles from './Dropdown.module.css'

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  /** Shown above the button. Hidden when the button sits under a column heading, which says it already. */
  label: string
  hideLabel?: boolean
  value: T | null
  options: DropdownOption<T>[]
  /** Called once an option is picked. Focus is back on the button by then, so the caller can move it on. */
  onChange: (value: T) => void
  /** What the button says while nothing is chosen. */
  placeholder?: string
  error?: string
  buttonRef?: RefObject<HTMLButtonElement | null>
}

/**
 * A choice among a few options, for where a row of large buttons doesn't fit, styled like our fields. Built by hand
 * because a <select>'s list is drawn by the browser: small, and out of reach of CSS. The keyboard works as in a
 * <select>: Enter, Space or an arrow opens it, the arrows move, Enter or Space picks, Esc closes, and focus goes back
 * to the button. A click outside closes it too.
 */
export function Dropdown<T extends string>({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
  placeholder = 'Elija uno',
  error,
  buttonRef,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const id = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ownRef = useRef<HTMLButtonElement | null>(null)
  const ownButtonRef = buttonRef ?? ownRef
  const listRef = useRef<HTMLUListElement>(null)

  const chosen = options.find((option) => option.value === value)
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const errorId = `${id}-error`
  const optionId = (index: number) => `${id}-option-${index}`

  useEffect(() => {
    if (open) {
      listRef.current?.focus()
    }
  }, [open])

  // A click anywhere else closes it, leaving focus wherever that click put it.
  useEffect(() => {
    if (!open) {
      return
    }

    const closeOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const openList = () => {
    const selected = options.findIndex((option) => option.value === value)
    setActive(selected >= 0 ? selected : 0)
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    ownButtonRef.current?.focus()
  }

  const pick = (index: number) => {
    close()
    onChange(options[index].value)
  }

  const handleButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      // Not a click: a held-down Enter must not open and pick in one go.
      event.preventDefault()

      if (!event.repeat) {
        openList()
      }
    }
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    }

    if (event.key in moves) {
      event.preventDefault()
      setActive(moves[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()

      if (!event.repeat) {
        pick(active)
      }
    } else if (event.key === 'Escape') {
      // Only the list: a dialog the form is in mustn't close too.
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      // Focus moves on from the list as it would from the button.
      setOpen(false)
    }
  }

  const buttonClasses = [styles.button, open && styles.open, error && styles.invalid].filter(Boolean).join(' ')

  return (
    <div className={styles.dropdown} ref={wrapperRef}>
      <span id={labelId} className={hideLabel ? styles.hiddenLabel : styles.label}>
        {label}
      </span>
      <div className={styles.control}>
      <button
        ref={ownButtonRef}
        type="button"
        className={buttonClasses}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleButtonKey}
      >
        <span id={valueId} className={chosen ? undefined : styles.placeholder}>
          {chosen?.label ?? placeholder}
        </span>
        <ChevronDown size={22} aria-hidden="true" className={styles.chevron} />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(active)}
          className={styles.list}
          onKeyDown={handleListKey}
          onBlur={(event) => {
            if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
              setOpen(false)
            }
          }}
        >
          {options.map((option, index) => {
            const selected = option.value === value
            const classes = [styles.option, selected && styles.selected, index === active && styles.active]

            return (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                className={classes.filter(Boolean).join(' ')}
                // Keeps focus in the list, so its blur doesn't close it before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                {option.label}
                {selected && <Check size={22} aria-hidden="true" />}
              </li>
            )
          })}
        </ul>
      )}
      </div>

      {error && (
        <p id={errorId} className={styles.error} role="alert">
          <CircleAlert size={24} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
