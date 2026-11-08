import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import styles from './Screen.module.css'

interface Props {
  title: string
  /**
   * Where "‹ Volver" goes, on a screen under one of the sidebar's pages: always that parent, never browser history,
   * so it still works after a reload. The sidebar's pages themselves have none.
   */
  backTo?: string
  /** A line under the title, like the day being looked at. */
  subtitle?: ReactNode
  /** The page's main button, at the right of the title. */
  actions?: ReactNode
  children: ReactNode
}

/** A page's header and its scrollable content, next to the sidebar. */
export function Screen({ title, backTo, subtitle, actions, children }: Props) {
  const navigate = useNavigate()

  return (
    <>
      <header className={styles.header}>
        {backTo && (
          <button type="button" className={styles.back} onClick={() => navigate(backTo)}>
            <span className={styles.chevron} aria-hidden="true">
              ‹
            </span>
            Volver
          </button>
        )}
        <div className={styles.heading}>
          <h1 className={styles.title} title={title}>
            {title}
          </h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <main className={styles.content}>{children}</main>
    </>
  )
}
