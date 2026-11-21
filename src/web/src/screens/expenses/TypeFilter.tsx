import { ListFilter } from 'lucide-react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Button } from '../../components/Button'
import { plural } from './expenseText'
import { listMaxHeight } from './listHeight'
import styles from './TypeFilter.module.css'

export interface TypeOption {
  id: string
  name: string
  /** How many of the period's expenses have it. */
  count: number
}

// The popup's title, Quitar filtros, its padding (144px), the gap to the button and a margin from the window's edge.
const AROUND_THE_LIST = 170
// Room for about five types: with less below the button, the popup opens above it if there's more room there.
const ROOMY = 280
const GAP = 6
// A type's row is one control tall (--size-input).
const DEFAULT_ROW = 56

/** Where the popup goes in the window, and how tall its list can be, so "Quitar filtros" stays in sight. */
interface Place {
  style: CSSProperties
  maxHeight?: number
}

function rowHeight(): number {
  const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-input'))
  return size > 0 ? size : DEFAULT_ROW
}

interface Props {
  /** The types to offer, in their order. */
  options: TypeOption[]
  /** The ids ticked. None ticked shows every type. */
  selected: string[]
  onChange: (selected: string[]) => void
}

/**
 * "Filtrar": a small popup by the button with a large checkbox per type, and "Quitar filtros". Each tick filters at
 * once. A click outside or Esc closes it, and the button says how many types are ticked. It's fixed in the window,
 * so the part of the page that scrolls can't cut it off.
 */
export function TypeFilter({ options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<Place | null>(null)
  const id = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      firstRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const closeOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    // The popup is fixed in the window, so it would stay put while the page moved under it: the page scrolling, or
    // the window changing size, closes it. Scrolling its own list doesn't.
    const closeOnScroll = (event: Event) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const closeNow = () => setOpen(false)

    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', closeNow)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', closeNow)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const openPopup = () => {
    const button = buttonRef.current?.getBoundingClientRect()

    if (button) {
      // Below the button, unless the list would be short there and there's more room above, as at 1366x768.
      const below = window.innerHeight - button.bottom - AROUND_THE_LIST
      const above = button.top - AROUND_THE_LIST
      const up = below < ROOMY && above > below
      const right = window.innerWidth - button.right
      setPlace({
        style: up ? { bottom: window.innerHeight - button.top + GAP, right } : { top: button.bottom + GAP, right },
        maxHeight: listMaxHeight(up ? above : below, options.length, rowHeight()),
      })
    }

    setOpen(true)
  }

  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((current) => current !== option) : [...selected, option])

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      }}
    >
      <Button
        ref={buttonRef}
        variant="secondary"
        className={selected.length > 0 ? styles.active : undefined}
        aria-expanded={open}
        aria-controls={open ? `${id}-popup` : undefined}
        onClick={() => (open ? close() : openPopup())}
      >
        <span className={styles.buttonContent}>
          <ListFilter size={22} aria-hidden="true" />
          {selected.length > 0 ? `Filtrar (${selected.length})` : 'Filtrar'}
        </span>
      </Button>

      {open && (
        <div
          id={`${id}-popup`}
          role="group"
          aria-label="Filtrar por tipo"
          className={styles.popup}
          style={place?.style}
        >
          <p className={styles.title}>Mostrar solo estos tipos</p>
          {options.length === 0 ? (
            <p className={styles.nothing}>No hay gastos en este período.</p>
          ) : (
            <ul
              className={styles.options}
              style={place?.maxHeight ? { maxHeight: place.maxHeight } : undefined}
            >
              {options.map((option, index) => (
                <li key={option.id}>
                  <label className={styles.option}>
                    <input
                      ref={index === 0 ? firstRef : undefined}
                      type="checkbox"
                      checked={selected.includes(option.id)}
                      onChange={() => toggle(option.id)}
                      // Enter ticks it too, as Space does: Enter is what moves on everywhere else.
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()

                          if (!event.repeat) {
                            toggle(option.id)
                          }
                        }
                      }}
                    />
                    <span className={styles.name}>{option.name}</span>
                    <span className={styles.count}>{plural(option.count, 'gasto', 'gastos')}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" className={styles.clear} onClick={() => onChange([])}>
            Quitar filtros
          </Button>
        </div>
      )}
    </div>
  )
}
