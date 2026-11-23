import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import styles from './Modal.module.css'

interface Props {
  title: string
  /** One line of text under the title. Dialogs that need more give `body` instead. */
  message?: string
  /** Richer content under the title, in place of `message`: a summary, a field, a list. */
  body?: ReactNode
  /** In a circle above the title. Left out by a dialog with a form, where the room is worth more. */
  icon?: ReactNode
  /** Wider, for a body laid out in two columns, where stacking it all would not fit a 768-pixel-tall screen. */
  wide?: boolean
  /** A dialog's own layout: its width, or letting a dropdown's list hang past its edge. */
  className?: string
  /** The icon's circle color. */
  tone?: 'primary' | 'success' | 'danger'
  /** Pressing Esc does this. Clicking outside the dialog does nothing, so a stray click can't dismiss it. */
  onEscape: () => void
  /** What starts focused: the button that's safest for Enter, or the dialog's field. */
  initialFocus: RefObject<HTMLElement | null>
  /** The buttons. Announced as an alert: it needs an answer, or holds a message that can't be missed. */
  children: ReactNode
}

/** A native modal dialog: the browser keeps Tab inside it, blocks the page behind it, and returns focus on close. */
export function Modal({
  title,
  message,
  body,
  icon,
  wide = false,
  className,
  tone = 'primary',
  onEscape,
  initialFocus,
  children,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  // A layout effect, so close() runs before the element is removed and focus returns to the page.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (!dialog.open) {
      dialog.showModal()
    }
    initialFocus.current?.focus()

    return () => dialog.close()
  }, [initialFocus])

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      className={[styles.dialog, body && styles.withBody, wide && styles.wide, className].filter(Boolean).join(' ')}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      // A click on the dialog or outside it would take focus off the button, and Enter would stop working. Fields
      // and their labels still take a click.
      onMouseDown={(event) => {
        if (!(event.target as Element).closest('button, input, textarea, label')) {
          event.preventDefault()
        }
      }}
      // Holding Enter down must not press one button after another as dialogs open and close.
      onKeyDownCapture={(event) => {
        if (event.key === 'Enter' && event.repeat) {
          event.preventDefault()
        }
      }}
      onCancel={(event) => {
        // The parent decides when it closes, so its state and the dialog can't disagree.
        event.preventDefault()
        onEscape()
      }}
    >
      {icon && (
        <div className={`${styles.icon} ${styles[tone]}`} aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 id={`${id}-title`} className={styles.title}>
        {title}
      </h2>
      {body ? (
        <div id={`${id}-message`} className={styles.body}>
          {body}
        </div>
      ) : (
        <p id={`${id}-message`} className={styles.message}>
          {message}
        </p>
      )}
      <div className={styles.buttons}>{children}</div>
    </dialog>
  )
}
