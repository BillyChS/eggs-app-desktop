import { useNavigate } from 'react-router'
import { Screen } from '../layout/Screen'
import styles from './HomeScreen.module.css'
import { MODULES } from './modules'

export function HomeScreen() {
  const navigate = useNavigate()

  return (
    <Screen title="Eggs App">
      <nav className={styles.grid} aria-label="Inicio">
        {MODULES.map(({ path, label, icon: Icon }) => (
          <button key={path} type="button" className={styles.tile} onClick={() => navigate(path)}>
            <Icon size={72} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
    </Screen>
  )
}
