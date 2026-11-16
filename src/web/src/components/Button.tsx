import type { ButtonHTMLAttributes, Ref } from 'react'
import styles from './Button.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Success is for the Aceptar of a success message. dangerOutline is a destructive action that isn't the page's
   * main one, like Borrar venta: it looks like a secondary button, in the danger color.
   */
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'success'
  ref?: Ref<HTMLButtonElement>
}

/** A real button, so Enter, Space and focus work without extra code. Navigation uses it too: links ignore Space. */
export function Button({ variant = 'primary', type = 'button', className, ...props }: Props) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...props} />
}
