import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { Screen } from '../layout/Screen'
import styles from './CenteredMessage.module.css'

export function ComingSoonScreen({ title }: { title: string }) {
  const navigate = useNavigate()

  return (
    <Screen title={title} backTo="/">
      <div className={styles.center}>
        <p className={styles.text}>Próximamente</p>
        <Button onClick={() => navigate('/')}>Volver a Inicio</Button>
      </div>
    </Screen>
  )
}
