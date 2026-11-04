import { Circle } from 'lucide-react'
import { Outlet } from 'react-router'
import { MessagesProvider } from '../components/MessagesProvider'
import styles from './AppLayout.module.css'
import { useServerStatus, type ServerStatus } from './useServerStatus'

const STATUS_TEXT: Record<ServerStatus, string> = {
  checking: 'Conectando…',
  connected: 'Conectado',
  disconnected: 'Sin conexión. Cierre y vuelva a abrir Eggs App.',
}

export function AppLayout() {
  const status = useServerStatus()

  return (
    <MessagesProvider>
      <div className={styles.app}>
        <Outlet />
        <footer className={styles.footer}>
          <p role="status" className={status === 'disconnected' ? styles.disconnected : styles.status}>
            {status === 'connected' && <Circle size={16} fill="currentColor" aria-hidden="true" />}
            {STATUS_TEXT[status]}
          </p>
        </footer>
      </div>
    </MessagesProvider>
  )
}
