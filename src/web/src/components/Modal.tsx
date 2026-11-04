import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import styles from './Modal.module.css'

interface Props {
  title: string
  message: string
  icon: ReactNode
  /** The icon's circle color. */
  tone: 'primary' | 'success' | 'danger'
  /** Pressing Esc does this. Clicking outside the dialog does nothing, so a stray click can't dismiss it. */
  onEscape: () => void
  /** The button that starts focused, so Enter does what's safest. */
  initialFocus: RefObject<HTMLButtonElement | null>
  /** Announced as an alert: it needs an answer, or holds a message that can't be missed. */
  children: ReactNode
}

/** A native modal dialog: the browser keeps Tab inside it, blocks the page behind it, and returns focus on close. */
export function Modal({ title, message, icon, tone, onEscape, initialFocus, children }: Props) {
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
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      // A click on the dialog or outside it would take focus off the button, and Enter would stop working.
      onMouseDown={(event) => {
        if (!(event.target as Element).closest('button')) {
          event.preventDefault()
        }
      }}
      onCancel={(event) => {
        // The parent decides when it closes, so its state and the dialog can't disagree.
        event.preventDefault()
        onEscape()
      }}
    >
      <div className={`${styles.icon} ${styles[tone]}`} aria-hidden="true">
        {icon}
      </div>
      <h2 id={`${id}-title`} className={styles.title}>
        {title}
      </h2>
      <p id={`${id}-message`} className={styles.message}>
        {message}
      </p>
      <div className={styles.buttons}>{children}</div>
    </dialog>
  )
}
