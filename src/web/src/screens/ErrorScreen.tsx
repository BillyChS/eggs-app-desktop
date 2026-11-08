import { Button } from '../components/Button'
import { Screen } from '../layout/Screen'
import styles from './CenteredMessage.module.css'
import appStyles from '../layout/AppLayout.module.css'

/**
 * Replaces the router's default English error page when a screen crashes. Without the sidebar: it's what may have
 * broken, and the one way out is a full reload.
 */
export function ErrorScreen() {
  return (
    <div className={appStyles.app}>
      <div className={appStyles.page}>
        <Screen title="Eggs App">
          <div className={styles.center}>
            <p className={styles.text}>Algo salió mal en esta pantalla.</p>
            <p>Vuelva a Ventas e intente de nuevo. Si vuelve a pasar, por favor llame a Billy.</p>
            {/* A full reload, so whatever broke doesn't survive. */}
            <Button onClick={() => window.location.assign('/ventas')}>Volver a Ventas</Button>
          </div>
        </Screen>
      </div>
    </div>
  )
}
