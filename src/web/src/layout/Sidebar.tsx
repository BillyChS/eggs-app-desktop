import { useLocation, useNavigate } from 'react-router'
import { BackupStatusLine } from './BackupStatusLine'
import styles from './Sidebar.module.css'
import { useBackupStatus } from './useBackupStatus'
import { useServerStatus, type ServerStatus } from './useServerStatus'

/** The four pages, always there with their names: no submenus, nothing hidden. */
const PAGES = [
  { path: '/ventas', label: 'Ventas' },
  { path: '/clientes', label: 'Clientes' },
  { path: '/gastos', label: 'Gastos' },
  { path: '/resumenes', label: 'Resúmenes' },
] as const

const STATUS_TEXT: Record<ServerStatus, string> = {
  checking: 'Conectando…',
  connected: 'Conectado',
  disconnected: 'Sin conexión. Cierre y vuelva a abrir Eggs App.',
}

/** Whether a page is the one open, counting the screens under it, like a sale being edited under Ventas. */
const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`)

export function Sidebar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { status, version } = useServerStatus()
  const backup = useBackupStatus()

  return (
    <nav aria-label="Menú principal" className={styles.sidebar}>
      <p className={styles.logo}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 22c4.4 0 7-3.2 7-7.5C19 9 15.6 2 12 2S5 9 5 14.5C5 18.8 7.6 22 12 22z" />
        </svg>
        Eggs App
      </p>

      <div className={styles.pages}>
        {PAGES.map(({ path, label }) => {
          const current = isUnder(pathname, path)

          // A button, not a link: links ignore Space.
          return (
            <button
              key={path}
              type="button"
              className={current ? `${styles.page} ${styles.current}` : styles.page}
              aria-current={current ? 'page' : undefined}
              onClick={() => navigate(path)}
            >
              <span className={styles.dot} aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>

      <div className={styles.status}>
        <p role="status" className={status === 'disconnected' ? styles.disconnected : styles.connection}>
          {status === 'connected' && <span className={styles.connected} aria-hidden="true" />}
          {STATUS_TEXT[status]}
        </p>
        {status === 'connected' && backup.status?.enabled && (
          <BackupStatusLine status={backup.status} onRetry={backup.retry} />
        )}
        {/* For Billy to ask "¿qué versión dice?". Text only, nothing to press. */}
        {version && <p>Versión {version}</p>}
      </div>
    </nav>
  )
}
