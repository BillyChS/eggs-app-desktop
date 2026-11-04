import { Button } from '../components/Button'
import { Screen } from '../layout/Screen'
import styles from './CenteredMessage.module.css'
import appStyles from '../layout/AppLayout.module.css'

/** Replaces the router's default English error page when a screen crashes. */
export function ErrorScreen() {
  return (
    <div className={appStyles.app}>
      <Screen title="Eggs App">
        <div className={styles.center}>
          <p className={styles.text}>Algo salió mal en esta pantalla.</p>
          <p>Vuelva a Inicio e intente de nuevo. Si vuelve a pasar, por favor llame a Billy.</p>
          {/* A full reload, so whatever broke doesn't survive. */}
          <Button onClick={() => window.location.assign('/')}>Volver a Inicio</Button>
        </div>
      </Screen>
    </div>
  )
}
