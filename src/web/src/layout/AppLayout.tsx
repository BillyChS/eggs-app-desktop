import { Outlet } from 'react-router'
import { MessagesProvider } from '../components/MessagesProvider'
import styles from './AppLayout.module.css'
import { Sidebar } from './Sidebar'

/** The sidebar, always there, and the page next to it. */
export function AppLayout() {
  return (
    <MessagesProvider>
      <div className={styles.app}>
        <Sidebar />
        <div className={styles.page}>
          <Outlet />
        </div>
      </div>
    </MessagesProvider>
  )
}
