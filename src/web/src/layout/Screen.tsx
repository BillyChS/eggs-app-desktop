import { Egg } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import styles from './Screen.module.css'

interface Props {
  title: string
  /** Where "‹ Volver" goes: always the parent screen, never browser history, so it still works after a reload. */
  backTo?: string
  children: ReactNode
}

const HOME = '/'

/** A screen's header and scrollable content. Without backTo it's Inicio, the one screen with nothing to go back to. */
export function Screen({ title, backTo, children }: Props) {
  const navigate = useNavigate()

  return (
    <>
      <header className={styles.header}>
        <div className={styles.side}>
          {backTo && (
            <button type="button" className={styles.navButton} onClick={() => navigate(backTo)}>
              <span className={styles.chevron} aria-hidden="true">‹</span>Volver
            </button>
          )}
        </div>
        <h1 className={styles.title}>
          {!backTo && <Egg size={38} aria-hidden="true" />}
          {title}
        </h1>
        <div className={`${styles.side} ${styles.end}`}>
          {/* From one level down, Volver already goes to Inicio. */}
          {backTo && backTo !== HOME && (
            <button type="button" className={styles.navButton} onClick={() => navigate(HOME)}>
              Inicio
            </button>
          )}
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </>
  )
}
