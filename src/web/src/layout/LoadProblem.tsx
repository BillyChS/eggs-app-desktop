import { Button } from '../components/Button'
import centered from '../screens/CenteredMessage.module.css'

interface Props {
  state: 'loading' | 'failed'
  /** What couldn't be opened, like "No se pudo abrir este cliente.". */
  failedMessage: string
  onRetry: () => void
}

/** What a screen shows while what it loads isn't there yet. */
export function LoadProblem({ state, failedMessage, onRetry }: Props) {
  return state === 'failed' ? (
    <div className={centered.center}>
      <p role="alert" className={centered.text}>
        {failedMessage}
      </p>
      <Button onClick={onRetry}>Intentar de nuevo</Button>
    </div>
  ) : (
    <p role="status" className={centered.center}>
      Cargando…
    </p>
  )
}
